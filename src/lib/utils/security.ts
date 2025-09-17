import { englishWordlist } from './wordlist';

const webCrypto = globalThis.crypto;
if (!webCrypto) {
  throw new Error('Web Crypto API is required but unavailable in this environment.');
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type BufferLike = {
  from(input: string, encoding: string): { toString(encoding: string): string };
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE32_ALPHABET.length; i += 1) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
}

function getBtoa() {
  if (typeof btoa === 'function') {
    return btoa;
  }
  const bufferCtor = (globalThis as { Buffer?: BufferLike }).Buffer;
  if (bufferCtor) {
    return (str: string) => bufferCtor.from(str, 'binary').toString('base64');
  }
  throw new Error('No base64 encoder available.');
}

function getAtob() {
  if (typeof atob === 'function') {
    return atob;
  }
  const bufferCtor = (globalThis as { Buffer?: BufferLike }).Buffer;
  if (bufferCtor) {
    return (str: string) => bufferCtor.from(str, 'base64').toString('binary');
  }
  throw new Error('No base64 decoder available.');
}

const btoaImpl = getBtoa();
const atobImpl = getAtob();

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoaImpl(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atobImpl(value);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer.slice(0, len);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(value: string): Uint8Array {
  let bits = 0;
  let current = 0;
  const output: number[] = [];
  for (const char of value.replace(/=+$/g, '').toUpperCase()) {
    const mapped = BASE32_LOOKUP[char];
    if (typeof mapped === 'undefined') {
      continue;
    }
    current = (current << 5) | mapped;
    bits += 5;
    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

export interface SecretEnvelope {
  cipherText: string;
  iv: string;
  salt: string;
}

export interface DeviceHandshakePayload {
  version: 1;
  password: string;
  totpSecret: string;
  username?: string;
  issuedAt: number;
  recoveryEnvelope: SecretEnvelope | null;
  recoveryHash: string | null;
  requireTotpOnUnlock?: boolean;
}

export function generateRecoveryPhrase(wordCount = 12): string[] {
  if (wordCount <= 0) {
    throw new Error('wordCount must be positive.');
  }
  const randomValues = new Uint32Array(wordCount);
  webCrypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => englishWordlist[value % englishWordlist.length]);
}

export function normalizeRecoveryPhrase(input: string | string[]): string {
  const words = Array.isArray(input) ? input : input.split(/\s+/);
  return words
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0)
    .join(' ');
}

export function pickRecoveryConfirmationIndices(wordCount: number, selectionCount = 3): number[] {
  if (selectionCount >= wordCount) {
    throw new Error('selectionCount must be less than wordCount.');
  }
  const indices = new Set<number>();
  const randomValues = new Uint32Array(selectionCount * 2);
  webCrypto.getRandomValues(randomValues);
  let cursor = 0;
  while (indices.size < selectionCount) {
    const idx = randomValues[cursor % randomValues.length] % wordCount;
    indices.add(idx);
    cursor += 1;
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export async function hashString(value: string, algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'): Promise<string> {
  const data = textEncoder.encode(value);
  const digest = await webCrypto.subtle.digest(algorithm, data);
  return arrayBufferToBase64(digest);
}

export async function derivePasswordKey(phrase: string | string[]): Promise<string> {
  const normalized = normalizeRecoveryPhrase(phrase);
  return hashString(normalized, 'SHA-512');
}

export function generateTotpSecret(byteLength = 20): string {
  const buffer = new Uint8Array(byteLength);
  webCrypto.getRandomValues(buffer);
  return base32Encode(buffer);
}

export function buildTotpUri(secret: string, username: string, issuer = 'Aegis'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const issuerParam = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuerParam}&algorithm=SHA1&digits=6&period=30`;
}

function computeCounter(timestamp: number, stepSeconds = 30): ArrayBuffer {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;
  view.setUint32(0, high);
  view.setUint32(4, low);
  return buffer;
}

export function sanitizeTotpCode(code: string): string {
  return code.replace(/[^0-9]/g, '');
}

export async function generateTotpCode(secret: string, timestamp = Date.now()): Promise<string> {
  const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
  const keyData = base32Decode(cleanSecret);
  const key = await webCrypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counterBuffer = computeCounter(timestamp);
  const hmac = await webCrypto.subtle.sign('HMAC', key, counterBuffer);
  const hmacBytes = new Uint8Array(hmac);
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);
  const otp = (binary % 1_000_000).toString();
  return otp.padStart(6, '0');
}

export async function verifyTotp(secret: string, token: string, window = 1): Promise<boolean> {
  const sanitized = sanitizeTotpCode(token);
  if (sanitized.length !== 6) {
    return false;
  }
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const code = await generateTotpCode(secret, now + offset * 30_000);
    if (code === sanitized) {
      return true;
    }
  }
  return false;
}

async function deriveAesKeyFromSecret(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await webCrypto.subtle.importKey('raw', textEncoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithSecret(secret: string, plaintext: string): Promise<SecretEnvelope> {
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const salt = webCrypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKeyFromSecret(secret, salt);
  const ciphertext = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plaintext));
  return {
    cipherText: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
  };
}

export async function decryptWithSecret(secret: string, envelope: SecretEnvelope): Promise<string> {
  const iv = new Uint8Array(base64ToArrayBuffer(envelope.iv));
  const salt = new Uint8Array(base64ToArrayBuffer(envelope.salt));
  const key = await deriveAesKeyFromSecret(secret, salt);
  const plaintext = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToArrayBuffer(envelope.cipherText)
  );
  return textDecoder.decode(plaintext);
}

export function encodeDeviceHandshake(payload: DeviceHandshakePayload): string {
  const json = JSON.stringify(payload);
  const encoded = textEncoder.encode(json);
  return `aegis-device-login::${arrayBufferToBase64(encoded)}`;
}

export function decodeDeviceHandshake(value: string): DeviceHandshakePayload | null {
  if (!value.startsWith('aegis-device-login::')) {
    return null;
  }
  const encoded = value.slice('aegis-device-login::'.length);
  try {
    const buffer = base64ToArrayBuffer(encoded);
    const jsonString = textDecoder.decode(buffer);
    const parsed = JSON.parse(jsonString) as DeviceHandshakePayload;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.password === 'string' &&
      typeof parsed.totpSecret === 'string'
    ) {
      return {
        ...parsed,
        recoveryEnvelope: parsed.recoveryEnvelope ?? null,
        recoveryHash: parsed.recoveryHash ?? null,
        requireTotpOnUnlock: parsed.requireTotpOnUnlock ?? false,
      };
    }
  } catch (error) {
    console.error('Failed to decode device handshake:', error);
  }
  return null;
}
