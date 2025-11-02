use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use ratchetx2::{Ratchetx2, Scalar, SharedKeys};
use ring::agreement::X25519;
use ring::hkdf::{KeyType, Salt, HKDF_SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use ring::{aead, aead::BoundKey, hmac};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum E2eeError {
    #[error("missing remote bundle for peer")]
    MissingBundle,
    #[error("invalid bundle signature")]
    InvalidBundle,
    #[error("crypto error: {0}")]
    Crypto(String),
    #[error("no session for peer")]
    NoSession,
}

// 96 bytes HKDF output -> 3x32: secret_key, header_key_alice, header_key_bob
struct HkdfBytes96;
impl KeyType for HkdfBytes96 {
    fn len(&self) -> usize {
        96
    }
}

// Header format used by ratchetx2::party
#[derive(Debug, Serialize, Deserialize)]
struct Header {
    public_key: Vec<u8>,
    pn: usize,
    n: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitMessage {
    pub identity_key_alice: Vec<u8>,
    pub ephemeral_public_key_alice: Vec<u8>,
    pub prekey_bob: Vec<u8>,
    pub one_time_prekey_bob: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrekeyBundle {
    pub identity_key_bob: Vec<u8>,   // XEdDSA public key
    pub prekey: Vec<u8>,             // X25519 public prekey
    pub prekey_signature: Vec<u8>,   // signature by identity key
    pub one_time_keys: Vec<Vec<u8>>, // optional one-time prekeys
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPacket {
    pub init: Option<Vec<u8>>, // bincode of InitMessage for first message
    pub enc_header: Vec<u8>,
    pub enc_content: Vec<u8>,
}

#[derive(Default)]
struct SessionState {
    ratchet: Option<Ratchetx2>,
    pn: usize,
    ns: usize,
    nr: usize,
    associated_data: Vec<u8>,
}

#[derive(Clone, Serialize, Deserialize)]
struct GroupKeyEntry {
    epoch: u64,
    key: Vec<u8>,
}

pub struct Manager {
    // Identity for X3DH (XEdDSA)
    identity_seed: [u8; 32],
    xeddsa_identity: ratchetx2::xeddsa::XEdDSAPrivateKey,
    // Map public prekey bytes -> private
    prekeys: HashMap<Vec<u8>, [u8; 32]>,
    one_time_prekeys: HashMap<Vec<u8>, [u8; 32]>,
    // remote bundles by peer id
    remote_bundles: HashMap<String, PrekeyBundle>,
    // sessions per peer id
    sessions: HashMap<String, SessionState>,
    // storage dir (state.json)
    storage_dir: Option<PathBuf>,
    // group keys by group_id
    group_keys: HashMap<String, GroupKeyEntry>,
}

impl Manager {
    pub fn new() -> Self {
        let mut seed = [0u8; 32];
        SystemRandom::new().fill(&mut seed).unwrap();
        let scalar = Scalar::from_bytes_mod_order(seed);
        let xkey = ratchetx2::xeddsa::XEdDSAPrivateKey::from(scalar);
        Self {
            identity_seed: seed,
            xeddsa_identity: xkey,
            prekeys: HashMap::new(),
            one_time_prekeys: HashMap::new(),
            remote_bundles: HashMap::new(),
            sessions: HashMap::new(),
            storage_dir: None,
            group_keys: HashMap::new(),
        }
    }

    pub fn identity_public_key(&self) -> Vec<u8> {
        self.xeddsa_identity.compute_public_key().as_ref().to_vec()
    }

    pub fn generate_prekey_bundle(&mut self, one_time_count: usize) -> PrekeyBundle {
        let mut spk_sk = [0u8; 32];
        SystemRandom::new().fill(&mut spk_sk).unwrap();
        let spk_pk = x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from(spk_sk));
        let public_prekey = spk_pk.as_bytes().to_vec();
        let prekey_signature = self.xeddsa_identity.sign(&public_prekey);
        self.prekeys.insert(public_prekey.clone(), spk_sk);

        let mut one_time_keys = vec![];
        for _ in 0..one_time_count {
            let mut sk = [0u8; 32];
            SystemRandom::new().fill(&mut sk).unwrap();
            let pk = x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from(sk));
            let pub_bytes = pk.as_bytes().to_vec();
            self.one_time_prekeys.insert(pub_bytes.clone(), sk);
            one_time_keys.push(pub_bytes);
        }

        let bundle = PrekeyBundle {
            identity_key_bob: self.identity_public_key(),
            prekey: public_prekey,
            prekey_signature,
            one_time_keys,
        };
        let _ = self.save_all();
        bundle
    }

    pub fn add_remote_bundle(
        &mut self,
        peer_id: String,
        bundle: PrekeyBundle,
    ) -> Result<(), E2eeError> {
        // verify signature of prekey with identity key
        let xpub = ratchetx2::xeddsa::XEdDSAPublicKey::new(&bundle.identity_key_bob);
        xpub.verify(&bundle.prekey, &bundle.prekey_signature)
            .map_err(|_| E2eeError::InvalidBundle)?;
        self.remote_bundles.insert(peer_id, bundle);
        let _ = self.save_all();
        Ok(())
    }

    fn hkdf32x2(key: &[u8], info: &[&[u8]]) -> Result<([u8; 32], [u8; 32]), E2eeError> {
        struct HkdfBytes64;
        impl KeyType for HkdfBytes64 {
            fn len(&self) -> usize {
                64
            }
        }
        let salt = Salt::new(HKDF_SHA256, &[0; 32]);
        let prk = salt.extract(key);
        let okm = prk
            .expand(info, HkdfBytes64)
            .map_err(|e| E2eeError::Crypto(format!("hkdf: {e:?}")))?;
        let mut keys = [0; 64];
        okm.fill(&mut keys)
            .map_err(|e| E2eeError::Crypto(format!("hkdf: {e:?}")))?;
        Ok((
            keys[..32].try_into().unwrap(),
            keys[32..].try_into().unwrap(),
        ))
    }

    fn encrypt_with_key(
        key: [u8; 32],
        info: &[&[u8]],
        aad: &[u8],
        content: &[u8],
    ) -> Result<Vec<u8>, E2eeError> {
        let (enc_key, auth_key) = Self::hkdf32x2(&key, info)?;
        let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &enc_key)
            .map_err(|e| E2eeError::Crypto(format!("aead key: {e:?}")))?;
        // simple monotonic nonce starting at 0 for each message (same as ratchetx2 impl)
        // use a zero counter because we authenticate+ciphertext HMAC with auth_key too.
        struct Counter(u32);
        impl aead::NonceSequence for Counter {
            fn advance(&mut self) -> Result<aead::Nonce, ring::error::Unspecified> {
                let mut bytes = [0u8; aead::NONCE_LEN];
                bytes[aead::NONCE_LEN - 4..].copy_from_slice(&self.0.to_be_bytes());
                self.0 = self.0.wrapping_add(1);
                aead::Nonce::try_assume_unique_for_key(&bytes)
            }
        }
        let mut sealing = aead::SealingKey::new(unbound, Counter(0));
        let mut in_out = content.to_vec();
        sealing
            .seal_in_place_append_tag(aead::Aad::from(aad), &mut in_out)
            .map_err(|e| E2eeError::Crypto(format!("seal: {e:?}")))?;
        let hmac_key = hmac::Key::new(hmac::HMAC_SHA256, &auth_key);
        let mut to_sign = aad.to_vec();
        to_sign.extend_from_slice(&in_out);
        let tag = hmac::sign(&hmac_key, &to_sign);
        in_out.extend_from_slice(tag.as_ref());
        Ok(in_out)
    }

    fn decrypt_with_key(
        key: [u8; 32],
        info: &[&[u8]],
        aad: &[u8],
        encrypted: &[u8],
    ) -> Result<Vec<u8>, E2eeError> {
        if encrypted.len() < 32 {
            return Err(E2eeError::Crypto("ciphertext too short".into()));
        }
        let (enc_key, auth_key) = Self::hkdf32x2(&key, info)?;
        let hmac_key = hmac::Key::new(hmac::HMAC_SHA256, &auth_key);
        let mut to_verify = aad.to_vec();
        to_verify.extend_from_slice(&encrypted[..encrypted.len() - 32]);
        hmac::verify(&hmac_key, &to_verify, &encrypted[encrypted.len() - 32..])
            .map_err(|_| E2eeError::Crypto("hmac verify".into()))?;
        let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &enc_key)
            .map_err(|e| E2eeError::Crypto(format!("aead key: {e:?}")))?;
        struct Counter(u32);
        impl aead::NonceSequence for Counter {
            fn advance(&mut self) -> Result<aead::Nonce, ring::error::Unspecified> {
                let mut bytes = [0u8; aead::NONCE_LEN];
                bytes[aead::NONCE_LEN - 4..].copy_from_slice(&self.0.to_be_bytes());
                self.0 = self.0.wrapping_add(1);
                aead::Nonce::try_assume_unique_for_key(&bytes)
            }
        }
        let mut opening = aead::OpeningKey::new(unbound, Counter(0));
        let mut in_out = encrypted[..encrypted.len() - 32].to_vec();
        let pt = opening
            .open_in_place(aead::Aad::from(aad), &mut in_out)
            .map_err(|_| E2eeError::Crypto("open".into()))?;
        Ok(pt.to_vec())
    }

    pub fn encrypt_for(
        &mut self,
        peer_id: &str,
        plaintext: &[u8],
    ) -> Result<EncryptedPacket, E2eeError> {
        // ensure session
        let mut init: Option<Vec<u8>> = None;
        if !self.sessions.contains_key(peer_id) {
            let bundle = self
                .remote_bundles
                .get(peer_id)
                .ok_or(E2eeError::MissingBundle)?
                .clone();

            // derive shared keys via X3DH-like KDF
            let mut key_material = vec![0xFF; 32];
            // DH(IK_A, SPK_B)
            key_material.extend(
                self.xeddsa_identity
                    .agree_ephemeral(&bundle.prekey)
                    .map_err(|e| E2eeError::Crypto(format!("agree1: {e:?}")))?,
            );
            // generate EK_A
            let ek_a = {
                let mut b = [0u8; 32];
                SystemRandom::new().fill(&mut b).unwrap();
                b
            };
            let ek_a_pub = x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from(ek_a))
                .as_bytes()
                .to_vec();
            // DH(EK_A, IK_B)
            {
                let ss = x25519_dalek::StaticSecret::from(ek_a);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(bundle.identity_key_bob.as_slice())
                        .map_err(|_| E2eeError::Crypto("ikb bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }
            // DH(EK_A, SPK_B)
            {
                let ss = x25519_dalek::StaticSecret::from(ek_a);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(bundle.prekey.as_slice())
                        .map_err(|_| E2eeError::Crypto("spkb bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }
            // DH(EK_A, OPK_B) if present
            let chosen_opk = bundle.one_time_keys.first().cloned();
            if let Some(opk) = chosen_opk.as_ref() {
                let ss = x25519_dalek::StaticSecret::from(ek_a);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(opk.as_slice())
                        .map_err(|_| E2eeError::Crypto("opkb bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }

            let mut sk = [0u8; 96];
            Salt::new(HKDF_SHA256, &[0; 96])
                .extract(&key_material)
                .expand(&[b"X3DH"], HkdfBytes96)
                .map_err(|e| E2eeError::Crypto(format!("hkdf96: {e:?}")))?
                .fill(&mut sk)
                .map_err(|e| E2eeError::Crypto(format!("hkdf fill: {e:?}")))?;
            let shared = SharedKeys {
                secret_key: sk[..32].try_into().unwrap(),
                header_key_alice: sk[32..64].try_into().unwrap(),
                header_key_bob: sk[64..].try_into().unwrap(),
            };
            let associated_data = {
                let mut ad = Vec::new();
                ad.extend_from_slice(&self.identity_public_key());
                ad.extend_from_slice(&bundle.identity_key_bob);
                ad
            };
            let ratchet = shared.alice(&bundle.prekey);
            self.sessions.insert(
                peer_id.to_string(),
                SessionState {
                    ratchet: Some(ratchet),
                    pn: 0,
                    ns: 0,
                    nr: 0,
                    associated_data,
                },
            );
            // Build init message
            let init_msg = InitMessage {
                identity_key_alice: self.identity_public_key(),
                ephemeral_public_key_alice: ek_a_pub,
                prekey_bob: bundle.prekey.clone(),
                one_time_prekey_bob: chosen_opk,
            };
            init = Some(bincode::serialize(&init_msg).unwrap());
        }

        // encrypt header + content
        let sess = self.sessions.get_mut(peer_id).unwrap();
        let ratchet = sess.ratchet.as_mut().unwrap();
        let header = Header {
            public_key: ratchet.public_key(),
            pn: sess.pn,
            n: sess.ns,
        };
        let header_bytes = bincode::serialize(&header).unwrap();
        let enc_header = Self::encrypt_with_key(
            ratchet.header_key_s(),
            &[b"Header"],
            &sess.associated_data,
            &header_bytes,
        )?;

        let msg_key = ratchet.step_msgs();
        let enc_content =
            Self::encrypt_with_key(msg_key, &[b"Content"], &sess.associated_data, plaintext)?;
        sess.ns += 1;

        Ok(EncryptedPacket {
            init,
            enc_header,
            enc_content,
        })
    }

    pub fn decrypt_from(
        &mut self,
        peer_id: &str,
        packet: &EncryptedPacket,
    ) -> Result<Vec<u8>, E2eeError> {
        if !self.sessions.contains_key(peer_id) {
            // need init msg
            let init_bytes = packet.init.as_ref().ok_or(E2eeError::NoSession)?;
            let init: InitMessage = bincode::deserialize(init_bytes)
                .map_err(|e| E2eeError::Crypto(format!("init decode: {e}")))?;

            // build shared keys as in X3DH handle
            let mut key_material = vec![0xFF; 32];
            // bob uses private_prekey
            let prekey_sk = *self
                .prekeys
                .get(&init.prekey_bob)
                .ok_or(E2eeError::Crypto("prekey not found".into()))?;
            // DH(SPK_B, IK_A)
            {
                let ss = x25519_dalek::StaticSecret::from(prekey_sk);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(init.identity_key_alice.as_slice())
                        .map_err(|_| E2eeError::Crypto("ika bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }
            // DH(IK_B, EK_A)
            key_material.extend(
                self.xeddsa_identity
                    .agree_ephemeral(&init.ephemeral_public_key_alice)
                    .map_err(|e| E2eeError::Crypto(format!("agree2: {e:?}")))?,
            );
            // DH(SPK_B, EK_A)
            {
                let ss = x25519_dalek::StaticSecret::from(prekey_sk);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(init.ephemeral_public_key_alice.as_slice())
                        .map_err(|_| E2eeError::Crypto("eka bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }
            // DH(OTPK_B, EK_A) if provided
            if let Some(one_time_pub) = init.one_time_prekey_bob.as_ref() {
                let ot_priv = self
                    .one_time_prekeys
                    .remove(one_time_pub)
                    .ok_or(E2eeError::Crypto("one-time prekey not found".into()))?;
                let _ = self.save_all();
                let ss = x25519_dalek::StaticSecret::from(ot_priv);
                let pk = x25519_dalek::PublicKey::from(
                    <[u8; 32]>::try_from(init.ephemeral_public_key_alice.as_slice())
                        .map_err(|_| E2eeError::Crypto("eka bytes".into()))?,
                );
                key_material.extend(ss.diffie_hellman(&pk).as_bytes());
            }
            let mut sk = [0u8; 96];
            Salt::new(HKDF_SHA256, &[0; 96])
                .extract(&key_material)
                .expand(&[b"X3DH"], HkdfBytes96)
                .map_err(|e| E2eeError::Crypto(format!("hkdf96: {e:?}")))?
                .fill(&mut sk)
                .map_err(|e| E2eeError::Crypto(format!("hkdf fill: {e:?}")))?;
            let shared = SharedKeys {
                secret_key: sk[..32].try_into().unwrap(),
                header_key_alice: sk[32..64].try_into().unwrap(),
                header_key_bob: sk[64..].try_into().unwrap(),
            };
            let associated_data = {
                let mut ad = Vec::new();
                ad.extend_from_slice(&init.identity_key_alice);
                ad.extend_from_slice(&self.identity_public_key());
                ad
            };
            // Construct bob ratchet with a dummy ephemeral; the derived keys carry confidentiality
            let dummy =
                ring::agreement::EphemeralPrivateKey::generate(&X25519, &SystemRandom::new())
                    .unwrap();
            let ratchet = shared.bob(dummy);
            self.sessions.insert(
                peer_id.to_string(),
                SessionState {
                    ratchet: Some(ratchet),
                    pn: 0,
                    ns: 0,
                    nr: 0,
                    associated_data,
                },
            );
        }

        let sess = self.sessions.get_mut(peer_id).unwrap();
        let ratchet = sess.ratchet.as_mut().unwrap();
        // try current header key, else try next and ratchet twice as in ratchetx2
        // decrypt header
        let header_bytes = Self::decrypt_with_key(
            ratchet.header_key_r(),
            &[b"Header"],
            &sess.associated_data,
            &packet.enc_header,
        );
        let (header, used_next) = match header_bytes {
            Ok(bytes) => (bytes, false),
            Err(_) => {
                // step based on next header key
                let _ = Self::decrypt_with_key(
                    ratchet.next_header_key_r(),
                    &[b"Header"],
                    &sess.associated_data,
                    &packet.enc_header,
                )?;
                // perform two root steps per ratchetx2
                // use header public key after decode
                // Need to decode header to get public key
                let hdr: Header = bincode::deserialize(&Self::decrypt_with_key(
                    ratchet.next_header_key_r(),
                    &[b"Header"],
                    &sess.associated_data,
                    &packet.enc_header,
                )?)
                .map_err(|e| E2eeError::Crypto(format!("hdr decode: {e}")))?;
                ratchet.step_dh_root(&hdr.public_key);
                ratchet.step_dh_root(&hdr.public_key);
                (bincode::serialize(&hdr).unwrap(), true)
            }
        };
        let hdr: Header = bincode::deserialize(&header)
            .map_err(|e| E2eeError::Crypto(format!("hdr decode: {e}")))?;
        if !used_next {
            // normal case: possibly need to catch up receive chain keys if out-of-order
            // minimal support: step until n
            while sess.nr < hdr.n {
                let _ = ratchet.step_msgr();
                sess.nr += 1;
            }
        }
        let msg_key = ratchet.step_msgr();
        sess.nr += 1;
        let plaintext = Self::decrypt_with_key(
            msg_key,
            &[b"Content"],
            &sess.associated_data,
            &packet.enc_content,
        )?;
        Ok(plaintext)
    }

    fn group_id(server_id: &str, channel_id: &Option<String>) -> String {
        match channel_id {
            Some(c) => format!("{server}:{chan}", server = server_id, chan = c),
            None => format!("{server}", server = server_id),
        }
    }

    pub fn set_group_key(
        &mut self,
        server_id: &str,
        channel_id: &Option<String>,
        epoch: u64,
        key: &[u8],
    ) {
        let id = Self::group_id(server_id, channel_id);
        self.group_keys.insert(
            id,
            GroupKeyEntry {
                epoch,
                key: key.to_vec(),
            },
        );
        let _ = self.save_all();
    }

    pub fn get_group_key(
        &self,
        server_id: &str,
        channel_id: &Option<String>,
    ) -> Option<(u64, Vec<u8>)> {
        let id = Self::group_id(server_id, channel_id);
        self.group_keys
            .get(&id)
            .map(|entry| (entry.epoch, entry.key.clone()))
    }

    pub fn generate_and_set_group_key(
        &mut self,
        server_id: &str,
        channel_id: &Option<String>,
        epoch: u64,
    ) -> Vec<u8> {
        let mut key = [0u8; 32];
        SystemRandom::new().fill(&mut key).unwrap();
        self.set_group_key(server_id, channel_id, epoch, &key);
        key.to_vec()
    }

    pub fn encrypt_group_message(
        &self,
        server_id: &str,
        channel_id: &Option<String>,
        plaintext: &[u8],
    ) -> Result<(u64, Vec<u8>, Vec<u8>), E2eeError> {
        let id = Self::group_id(server_id, channel_id);
        let entry = self
            .group_keys
            .get(&id)
            .ok_or(E2eeError::Crypto("missing group key".into()))?;
        let epoch = entry.epoch;
        // Random 96-bit nonce
        let mut nonce = vec![0u8; aead::NONCE_LEN];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| E2eeError::Crypto("rng".into()))?;
        struct OnceNonce(Vec<u8>, bool);
        impl aead::NonceSequence for OnceNonce {
            fn advance(&mut self) -> Result<aead::Nonce, ring::error::Unspecified> {
                if self.1 {
                    return Err(ring::error::Unspecified);
                }
                self.1 = true;
                let mut bytes = [0u8; aead::NONCE_LEN];
                bytes.copy_from_slice(&self.0);
                aead::Nonce::try_assume_unique_for_key(&bytes)
            }
        }
        let key = aead::UnboundKey::new(&aead::AES_256_GCM, &entry.key)
            .map_err(|e| E2eeError::Crypto(format!("aead: {e:?}")))?;
        let mut sealing = aead::SealingKey::new(key, OnceNonce(nonce.clone(), false));
        // Provide associated data = group id and epoch
        let aad = [
            Self::group_id(server_id, channel_id).as_bytes(),
            &epoch.to_be_bytes(),
        ]
        .concat();
        let mut in_out = plaintext.to_vec();
        sealing
            .seal_in_place_append_tag(aead::Aad::from(aad), &mut in_out)
            .map_err(|_| E2eeError::Crypto("seal".into()))?;
        Ok((epoch, nonce, in_out))
    }

    pub fn decrypt_group_message(
        &self,
        server_id: &str,
        channel_id: &Option<String>,
        epoch: u64,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, E2eeError> {
        let id = Self::group_id(server_id, channel_id);
        let entry = self
            .group_keys
            .get(&id)
            .ok_or(E2eeError::Crypto("missing group key".into()))?;
        if entry.epoch != epoch {
            return Err(E2eeError::Crypto("epoch mismatch".into()));
        }
        struct OnceNonce(Vec<u8>, bool);
        impl aead::NonceSequence for OnceNonce {
            fn advance(&mut self) -> Result<aead::Nonce, ring::error::Unspecified> {
                if self.1 {
                    return Err(ring::error::Unspecified);
                }
                self.1 = true;
                let mut bytes = [0u8; aead::NONCE_LEN];
                bytes.copy_from_slice(&self.0);
                aead::Nonce::try_assume_unique_for_key(&bytes)
            }
        }
        let key = aead::UnboundKey::new(&aead::AES_256_GCM, &entry.key)
            .map_err(|e| E2eeError::Crypto(format!("aead: {e:?}")))?;
        let mut opening = aead::OpeningKey::new(key, OnceNonce(nonce.to_vec(), false));
        let aad = [
            Self::group_id(server_id, channel_id).as_bytes(),
            &epoch.to_be_bytes(),
        ]
        .concat();
        let mut in_out = ciphertext.to_vec();
        let pt = opening
            .open_in_place(aead::Aad::from(aad), &mut in_out)
            .map_err(|_| E2eeError::Crypto("open".into()))?;
        Ok(pt.to_vec())
    }
}

static GLOBAL: OnceCell<Arc<Mutex<Manager>>> = OnceCell::new();

pub fn init_global_manager() -> Arc<Mutex<Manager>> {
    GLOBAL
        .get_or_init(|| Arc::new(Mutex::new(Manager::new())))
        .clone()
}

pub fn global() -> Option<Arc<Mutex<Manager>>> {
    GLOBAL.get().cloned()
}

// ---------- Persistence ----------

#[derive(Serialize, Deserialize)]
struct StoredPrekeyEntry {
    pubkey: Vec<u8>,
    secret: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
struct StoredState {
    identity_seed: Vec<u8>,
    prekeys: Vec<StoredPrekeyEntry>,
    one_time_prekeys: Vec<StoredPrekeyEntry>,
    remote_bundles: HashMap<String, PrekeyBundle>,
    group_keys: HashMap<String, GroupKeyEntry>,
}

impl Manager {
    pub fn set_storage_dir(&mut self, dir: PathBuf) {
        self.storage_dir = Some(dir);
    }

    fn storage_file(&self) -> Option<PathBuf> {
        self.storage_dir.as_ref().map(|d| d.join("state.json"))
    }

    pub fn save_all(&self) -> Result<(), E2eeError> {
        let path = self
            .storage_file()
            .ok_or(E2eeError::Crypto("no storage dir".into()))?;
        let st = StoredState {
            identity_seed: self.identity_seed.to_vec(),
            prekeys: self
                .prekeys
                .iter()
                .map(|(pk, sk)| StoredPrekeyEntry {
                    pubkey: pk.clone(),
                    secret: sk.to_vec(),
                })
                .collect(),
            one_time_prekeys: self
                .one_time_prekeys
                .iter()
                .map(|(pk, sk)| StoredPrekeyEntry {
                    pubkey: pk.clone(),
                    secret: sk.to_vec(),
                })
                .collect(),
            remote_bundles: self.remote_bundles.clone(),
            group_keys: self.group_keys.clone(),
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let data = serde_json::to_vec_pretty(&st).map_err(|e| E2eeError::Crypto(e.to_string()))?;
        std::fs::write(path, data).map_err(|e| E2eeError::Crypto(e.to_string()))
    }
}

pub fn init_with_dir(path: impl AsRef<Path>) -> Arc<Mutex<Manager>> {
    let dir = path.as_ref().to_path_buf();
    let mgr = if let Ok(bytes) = std::fs::read(dir.join("state.json")) {
        if let Ok(st) = serde_json::from_slice::<StoredState>(&bytes) {
            let mut seed = [0u8; 32];
            if st.identity_seed.len() == 32 {
                seed.copy_from_slice(&st.identity_seed);
            }
            let scalar = Scalar::from_bytes_mod_order(seed);
            let xkey = ratchetx2::xeddsa::XEdDSAPrivateKey::from(scalar);
            let mut m = Manager {
                identity_seed: seed,
                xeddsa_identity: xkey,
                prekeys: HashMap::new(),
                one_time_prekeys: HashMap::new(),
                remote_bundles: st.remote_bundles,
                sessions: HashMap::new(),
                storage_dir: Some(dir.clone()),
                group_keys: st.group_keys,
            };
            for e in st.prekeys {
                if e.secret.len() == 32 {
                    let mut sk = [0u8; 32];
                    sk.copy_from_slice(&e.secret);
                    m.prekeys.insert(e.pubkey, sk);
                }
            }
            for e in st.one_time_prekeys {
                if e.secret.len() == 32 {
                    let mut sk = [0u8; 32];
                    sk.copy_from_slice(&e.secret);
                    m.one_time_prekeys.insert(e.pubkey, sk);
                }
            }
            Arc::new(Mutex::new(m))
        } else {
            Arc::new(Mutex::new(Manager::new()))
        }
    } else {
        Arc::new(Mutex::new(Manager::new()))
    };
    {
        let mut guard = mgr.lock();
        guard.set_storage_dir(dir);
        let _ = guard.save_all();
    }
    let _ = GLOBAL.set(mgr.clone());
    mgr
}
