import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM authenticated encryption for the tg_config.encrypted_token
// column. Why AEAD (vs plain CBC + HMAC vs plain CTR):
//   - GCM gives confidentiality + integrity in one primitive.
//   - It's in Node's stdlib — no new dependency.
//   - Tampering with the ciphertext (or aad) makes decrypt throw with a
//     clear AuthTagError, which the service surfaces as 500 — operators
//     immediately see "stored token was modified".
//
// Wire format (single bytea column):
//   version(1) | iv(12) | tag(16) | ciphertext(N)
//
//   version = 0x01. Reserves room to swap algorithms later without
//             schema churn — decrypt() refuses unknown versions.
//   iv      = 12 bytes (GCM's recommended IV size). Fresh per encrypt
//             call from crypto.randomBytes; never reused with the same
//             key (which would catastrophically break GCM's
//             confidentiality).
//   tag     = 16 bytes GCM auth tag.
//   ct      = plaintext length.
//
// Key handling: 32-byte (256-bit) key supplied as hex via the
// TG_CONFIG_ENCRYPTION_KEY env var. Caller resolves the key once and
// passes a Buffer in — we don't read process.env from this file so
// tests can pass keys in cleanly.

const VERSION = 0x01;
const ALG = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

export class TokenCryptoError extends Error {
  constructor(reason: string) {
    super(`tg-config token crypto: ${reason}`);
    this.name = 'TokenCryptoError';
  }
}

// Parse a hex-encoded 32-byte key. Exported so the env loader + tests
// can validate the key shape once at boot rather than failing on first
// encrypt/decrypt.
export function parseEncryptionKey(hex: string): Buffer {
  const cleaned = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new TokenCryptoError('key must be hex-encoded');
  }
  if (cleaned.length !== KEY_BYTES * 2) {
    throw new TokenCryptoError(`key must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars)`);
  }
  return Buffer.from(cleaned, 'hex');
}

// Generate a fresh key. Operators run `node -e "console.log(...)"` or
// the CLI documented in the runbook; not used by the API at runtime.
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString('hex');
}

export function encryptToken(plaintext: string, key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(`key must be ${KEY_BYTES} bytes`);
  }
  if (plaintext.length === 0) {
    throw new TokenCryptoError('plaintext must be non-empty');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.alloc(HEADER_BYTES + ciphertext.length);
  out.writeUInt8(VERSION, 0);
  iv.copy(out, 1);
  tag.copy(out, 1 + IV_BYTES);
  ciphertext.copy(out, HEADER_BYTES);
  return out;
}

export function decryptToken(blob: Buffer, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(`key must be ${KEY_BYTES} bytes`);
  }
  if (blob.length < HEADER_BYTES + 1) {
    throw new TokenCryptoError('ciphertext blob too short');
  }
  const version = blob.readUInt8(0);
  if (version !== VERSION) {
    throw new TokenCryptoError(`unsupported version 0x${version.toString(16)}`);
  }
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    // Either the auth tag mismatched (tampering / wrong key) or the
    // ciphertext is corrupt. Both surface as the same error so callers
    // can't distinguish — that's deliberate, GCM is symmetric on auth
    // failure and we don't want to leak which case it was.
    const reason = err instanceof Error ? err.message : 'unknown';
    throw new TokenCryptoError(`decrypt failed: ${reason}`);
  }
}
