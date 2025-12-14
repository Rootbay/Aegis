use anyhow::{anyhow, Result};
use once_cell::sync::OnceCell;
use tokio::sync::Mutex as TokioMutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use rkyv::{Archive, Deserialize as RkyvDeserialize, Serialize as RkyvSerialize};

use vodozemac::megolm::{
    GroupSession, GroupSessionPickle, InboundGroupSession, InboundGroupSessionPickle,
    MegolmMessage, SessionConfig as MegolmSessionConfig, SessionKey,
};
use rand::RngCore;
use vodozemac::olm::{
    Account, AccountPickle, Message, OlmMessage, PreKeyMessage, Session,
    SessionConfig as OlmSessionConfig, SessionPickle,
};
use vodozemac::{Curve25519PublicKey};


const PICKLE_KEY: &[u8; 32] = b"aegis_local_storage_key_32_bytes";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrekeyBundle {
    pub identity_key: String,
    pub signed_prekey: String,
    pub signed_prekey_signature: String,
    pub one_time_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPacket {
    pub init: Option<Vec<u8>>,
    pub enc_header: Vec<u8>,
    pub enc_content: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedGroupPacket {
    pub session_id: String,
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedDmPacket {
    pub init: Option<Vec<u8>>,
    pub enc_header: Vec<u8>,
    pub enc_content: Vec<u8>,
}

#[derive(Archive, RkyvDeserialize, RkyvSerialize)]
#[archive(check_bytes)]
struct StoredState {
    account_pickle: String,
    sessions: HashMap<String, String>,
    outbound_group_sessions: HashMap<String, String>,
    inbound_group_sessions: HashMap<String, String>,
    group_keys: HashMap<String, (u64, String)>,
}

pub struct Manager {
    account: Account,
    sessions: HashMap<String, Session>,
    outbound_group: HashMap<String, GroupSession>,
    inbound_group: HashMap<String, InboundGroupSession>,
    group_keys: HashMap<String, (u64, String)>,
    storage_dir: Option<PathBuf>,
}

impl Manager {
    pub fn new() -> Self {
        Self {
            account: Account::new(),
            sessions: HashMap::new(),
            outbound_group: HashMap::new(),
            inbound_group: HashMap::new(),
            group_keys: HashMap::new(),
            storage_dir: None,
        }
    }

    pub fn identity_key(&self) -> String {
        self.account.identity_keys().curve25519.to_base64()
    }

    pub fn generate_prekey_bundle(&mut self, num_keys: usize) -> Result<PrekeyBundle> {
        self.account.generate_one_time_keys(num_keys);
        let id_keys = self.account.identity_keys();
        let otks = self.account.one_time_keys();

        let signed_prekey = id_keys.curve25519;
        
        // Vodozemac sign() expects a string (usually the base64 representation of the key)
        let signature = self.account.sign(&signed_prekey.to_base64());

        let one_time_key = otks.values().next().map(|k| k.to_base64());

        let bundle = PrekeyBundle {
            identity_key: id_keys.curve25519.to_base64(),
            signed_prekey: signed_prekey.to_base64(),
            signed_prekey_signature: signature.to_base64(),
            one_time_key,
        };

        self.save_all()?;
        Ok(bundle)
    }

    pub fn create_outbound_session(&mut self, peer_id: &str, bundle: &PrekeyBundle) -> Result<()> {
        let identity_key = Curve25519PublicKey::from_base64(&bundle.identity_key)?;
        let one_time_key = Curve25519PublicKey::from_base64(
            bundle
                .one_time_key
                .as_ref()
                .ok_or_else(|| anyhow!("Missing one-time key"))?,
        )?;

        let session = self.account.create_outbound_session(
            OlmSessionConfig::default(),
            identity_key,
            one_time_key,
        );

        self.sessions.insert(peer_id.to_string(), session);
        self.save_all()?;
        Ok(())
    }

    pub fn encrypt_direct(&mut self, peer_id: &str, plaintext: &str) -> Result<EncryptedPacket> {
        let session = self
            .sessions
            .get_mut(peer_id)
            .ok_or_else(|| anyhow!("No session found for peer {}", peer_id))?;

        let msg = session.encrypt(plaintext);
        self.save_all()?;

        match msg {
            OlmMessage::PreKey(m) => Ok(EncryptedPacket {
                init: Some(m.to_base64().as_bytes().to_vec()),
                enc_header: vec![],
                enc_content: vec![],
            }),
            OlmMessage::Normal(m) => Ok(EncryptedPacket {
                init: None,
                enc_header: m.to_base64().as_bytes().to_vec(),
                enc_content: vec![],
            }),
        }
    }

    pub fn decrypt_direct(&mut self, peer_id: &str, packet: &EncryptedPacket) -> Result<Vec<u8>> {
        // If we don't have a session, this MUST be a PreKeyMessage (initiation).
        // However, we cannot create a session purely from the message; we need the peer's Identity Key.
        // In a real app, you fetch this from your contact list/server based on `peer_id`.
        if !self.sessions.contains_key(peer_id) {
             return Err(anyhow!("No session exists for {}. You must call 'create_inbound_session_from_packet' first with their Identity Key.", peer_id));
        }

        let session = self.sessions.get_mut(peer_id).unwrap();

        let decrypted_bytes = if let Some(init_bytes) = &packet.init {
            let body_str = std::str::from_utf8(init_bytes).map_err(|e| anyhow!("Invalid UTF-8: {}", e))?;
            session.decrypt(&OlmMessage::PreKey(PreKeyMessage::from_base64(body_str)?))?
        } else {
            let body_str = std::str::from_utf8(&packet.enc_header).map_err(|e| anyhow!("Invalid UTF-8: {}", e))?;
            session.decrypt(&OlmMessage::Normal(Message::from_base64(body_str)?))?
        };

        self.save_all()?;
        Ok(decrypted_bytes)
    }
    
    pub fn create_inbound_session_from_packet(&mut self, peer_id: &str, peer_identity_key_b64: &str, packet_body: &str) -> Result<String> {
        let peer_key = Curve25519PublicKey::from_base64(peer_identity_key_b64)?;
        let prekey_msg = PreKeyMessage::from_base64(packet_body)?;
        
        // create_inbound_session returns an InboundCreationResult struct
        // containing { session, plaintext }
        let result = self.account.create_inbound_session(peer_key, &prekey_msg)?;
        
        self.sessions.insert(peer_id.to_string(), result.session);
        self.save_all()?;
        
        Ok(String::from_utf8(result.plaintext)?)
    }

    pub fn create_group_session(&mut self, group_id: &str) -> Result<String> {
        let session = GroupSession::new(MegolmSessionConfig::default());
        let session_key = session.session_key().to_base64();

        self.outbound_group.insert(group_id.to_string(), session);
        self.save_all()?;

        Ok(session_key)
    }

    pub fn add_inbound_group_session(&mut self, session_key_b64: &str) -> Result<()> {
        let key = SessionKey::from_base64(session_key_b64)?;
        
        // InboundGroupSession::new returns Self (not Result) in this version
        let session = InboundGroupSession::new(&key, MegolmSessionConfig::default());
        
        let session_id = session.session_id();
        self.inbound_group.insert(session_id, session);
        self.save_all()?;
        Ok(())
    }

    pub fn encrypt_group(
        &mut self,
        group_id: &str,
        plaintext: &str,
    ) -> Result<EncryptedGroupPacket> {
        // Block to limit mutable borrow scope
        let (session_id, ciphertext) = {
            let session = self
                .outbound_group
                .get_mut(group_id)
                .ok_or_else(|| anyhow!("No outbound session for group {}", group_id))?;

            let ciphertext_obj = session.encrypt(plaintext);
            (session.session_id(), ciphertext_obj.to_base64())
        };

        self.save_all()?;

        Ok(EncryptedGroupPacket {
            session_id,
            ciphertext,
        })
    }

    pub fn decrypt_group(&mut self, packet: &EncryptedGroupPacket) -> Result<String> {
        let session = self
            .inbound_group
            .get_mut(&packet.session_id)
            .ok_or_else(|| anyhow!("Unknown session ID {}", packet.session_id))?;

        let msg = vodozemac::megolm::MegolmMessage::from_base64(&packet.ciphertext)?;
        let res = session.decrypt(&msg)?;

        self.save_all()?;
        Ok(String::from_utf8(res.plaintext)?)
    }

    fn format_group_id(&self, server_id: &str, channel_id: &Option<String>) -> String {
        match channel_id {
            Some(c) => format!("{}:{}", server_id, c),
            None => server_id.to_string(),
        }
    }

    pub fn set_group_key(&mut self, server_id: &str, channel_id: &Option<String>, epoch: u64, key: &[u8]) {
        let group_id = self.format_group_id(server_id, channel_id);
        let session_key_b64 = String::from_utf8(key.to_vec()).unwrap_or_default();
        self.group_keys.insert(group_id, (epoch, session_key_b64));
        let _ = self.save_all();
    }

    pub fn get_group_key(&self, server_id: &str, channel_id: &Option<String>) -> Option<(u64, Vec<u8>)> {
        let group_id = self.format_group_id(server_id, channel_id);
        self.group_keys.get(&group_id).map(|(e, k)| (*e, k.as_bytes().to_vec()))
    }

    pub fn generate_and_set_group_key(&mut self, server_id: &str, channel_id: &Option<String>, epoch: u64) -> Vec<u8> {
        let session = GroupSession::new(MegolmSessionConfig::default());
        let session_key = session.session_key().to_base64();
        let group_id = self.format_group_id(server_id, channel_id);
        self.outbound_group.insert(group_id.clone(), session);
        self.group_keys.insert(group_id, (epoch, session_key.clone()));
        let _ = self.save_all();
        session_key.into_bytes()
    }

    pub fn encrypt_for(&mut self, peer_id: &str, plaintext: &[u8]) -> Result<EncryptedDmPacket> {
        let plaintext_str = String::from_utf8(plaintext.to_vec()).map_err(|e| anyhow!("Invalid UTF-8: {}", e))?;
        let packet = self.encrypt_direct(peer_id, &plaintext_str)?;
        Ok(EncryptedDmPacket {
            init: packet.init,
            enc_header: packet.enc_header,
            enc_content: packet.enc_content,
        })
    }

    pub fn encrypt_group_message(&mut self, server_id: &str, channel_id: &Option<String>, plaintext: &[u8]) -> Result<(u64, Vec<u8>, Vec<u8>)> {
        let group_id = self.format_group_id(server_id, channel_id);
        let session = self.outbound_group.get_mut(&group_id).ok_or_else(|| anyhow!("No outbound session for group {}", group_id))?;
        let plaintext_str = String::from_utf8(plaintext.to_vec()).map_err(|e| anyhow!("Invalid UTF-8: {}", e))?;
        let ciphertext_obj = session.encrypt(&plaintext_str);
        let epoch = self.group_keys.get(&group_id).map(|(e,_)| *e).unwrap_or(0);
        let mut nonce = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut nonce);
        Ok((epoch, nonce.to_vec(), ciphertext_obj.to_base64().into_bytes()))
    }

    pub fn add_remote_bundle(&mut self, user_id: &str, bundle: PrekeyBundle) {
        let _ = self.create_outbound_session(user_id, &bundle);
    }

    pub fn decrypt_from(&mut self, peer_id: &str, packet: &EncryptedPacket) -> Result<Vec<u8>> {
        self.decrypt_direct(peer_id, packet)
    }

    pub fn decrypt_group_message(&mut self, server_id: &str, channel_id: &Option<String>, ciphertext: &[u8]) -> Result<Vec<u8>> {
        let group_id = self.format_group_id(server_id, channel_id);
        let session = self.inbound_group.get_mut(&group_id).ok_or_else(|| anyhow!("No inbound session for group {}", group_id))?;
        let ciphertext_b64 = std::str::from_utf8(ciphertext).map_err(|e| anyhow!("Invalid UTF-8: {}", e))?;
        let msg = MegolmMessage::from_base64(ciphertext_b64)?;
        let res = session.decrypt(&msg)?;
        Ok(res.plaintext)
    }

    pub fn set_storage_dir(&mut self, dir: PathBuf) {
        self.storage_dir = Some(dir);
    }

    fn storage_path(&self) -> Option<PathBuf> {
        self.storage_dir.as_ref().map(|d| d.join("state.e2ee"))
    }

    pub fn save_all(&self) -> Result<()> {
        let path = self
            .storage_path()
            .ok_or_else(|| anyhow!("Storage path not set"))?;

        let sessions_map: HashMap<String, String> = self
            .sessions
            .iter()
            .map(|(k, v)| (k.clone(), v.pickle().encrypt(PICKLE_KEY)))
            .collect();

        let outbound_map: HashMap<String, String> = self
            .outbound_group
            .iter()
            .map(|(k, v)| (k.clone(), v.pickle().encrypt(PICKLE_KEY)))
            .collect();

        let inbound_map: HashMap<String, String> = self
            .inbound_group
            .iter()
            .map(|(k, v)| (k.clone(), v.pickle().encrypt(PICKLE_KEY)))
            .collect();

        let state = StoredState {
            account_pickle: self.account.pickle().encrypt(PICKLE_KEY),
            sessions: sessions_map,
            outbound_group_sessions: outbound_map,
            inbound_group_sessions: inbound_map,
            group_keys: self.group_keys.clone(),
        };

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let bytes = rkyv::to_bytes::<_, 1024>(&state).expect("Failed to serialize");
        std::fs::write(path, &bytes)?;
        Ok(())
    }
}

static GLOBAL: OnceCell<Arc<TokioMutex<Manager>>> = OnceCell::new();

pub fn init_with_dir(path: impl AsRef<Path>) -> Arc<TokioMutex<Manager>> {
    let dir = path.as_ref().to_path_buf();
    let state_file = dir.join("state.e2ee");

    let manager = if state_file.exists() {
        match std::fs::read(&state_file) {
            Ok(bytes) => {
                if let Ok(archived) = rkyv::check_archived_root::<StoredState>(&bytes) {
                    let st: StoredState = archived.deserialize(&mut rkyv::Infallible).expect("Infallible");
                    let account = AccountPickle::from_encrypted(&st.account_pickle, PICKLE_KEY)
                        .map(Account::from_pickle)
                        .unwrap_or_else(|_| Account::new());

                    let sessions = st
                        .sessions
                        .into_iter()
                        .filter_map(|(k, v)| {
                            SessionPickle::from_encrypted(&v, PICKLE_KEY)
                                .ok()
                                .map(|p| (k, Session::from_pickle(p)))
                        })
                        .collect();

                    let outbound_group = st
                        .outbound_group_sessions
                        .into_iter()
                        .filter_map(|(k, v)| {
                            GroupSessionPickle::from_encrypted(&v, PICKLE_KEY)
                                .map(|p| (k, GroupSession::from_pickle(p)))
                                .ok()
                        })
                        .collect();

                    let inbound_group = st
                        .inbound_group_sessions
                        .into_iter()
                        .filter_map(|(k, v)| {
                            InboundGroupSessionPickle::from_encrypted(&v, PICKLE_KEY)
                                .map(|p| (k, InboundGroupSession::from_pickle(p)))
                                .ok()
                        })
                        .collect();

                    Manager {
                        account,
                        sessions,
                        outbound_group,
                        inbound_group,
                        group_keys: st.group_keys,
                        storage_dir: Some(dir.clone()),
                    }
                } else {
                    Manager::new()
                }
            }
            Err(_) => Manager::new(),
        }
    } else {
        Manager::new()
    };

    let wrapper = Arc::new(TokioMutex::new(manager));
    {
        let mut g = wrapper.try_lock().unwrap();
        g.set_storage_dir(dir);
        let _ = g.save_all();
    }

    let _ = GLOBAL.set(wrapper.clone());
    wrapper
}

pub fn global() -> Option<Arc<TokioMutex<Manager>>> {
    GLOBAL.get().cloned()
}

pub fn init_global_manager() -> Arc<TokioMutex<Manager>> {
    global().expect("e2ee not initialized")
}
