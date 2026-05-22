import { describe, expect, it } from 'vitest';
import {
  TokenCryptoError,
  decryptToken,
  encryptToken,
  generateEncryptionKey,
  parseEncryptionKey,
} from '../src/modules/telegram/token-crypto';

const KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SAMPLE_TOKEN = '123456789:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTT';

describe('token-crypto', () => {
  const key = parseEncryptionKey(KEY_HEX);

  it('round-trips a token through encrypt → decrypt', () => {
    const blob = encryptToken(SAMPLE_TOKEN, key);
    expect(blob.length).toBeGreaterThan(SAMPLE_TOKEN.length); // header + tag overhead
    expect(decryptToken(blob, key)).toBe(SAMPLE_TOKEN);
  });

  it('produces a different ciphertext on each encrypt (random IV)', () => {
    // GCM with the same key + plaintext but a fresh IV must yield distinct
    // ciphertexts; identical ciphertexts would mean IV reuse → catastrophic.
    const blob1 = encryptToken(SAMPLE_TOKEN, key);
    const blob2 = encryptToken(SAMPLE_TOKEN, key);
    expect(blob1.equals(blob2)).toBe(false);
    expect(decryptToken(blob1, key)).toBe(SAMPLE_TOKEN);
    expect(decryptToken(blob2, key)).toBe(SAMPLE_TOKEN);
  });

  it('rejects decrypt with the wrong key', () => {
    const blob = encryptToken(SAMPLE_TOKEN, key);
    const otherKey = parseEncryptionKey('f'.repeat(64));
    expect(() => decryptToken(blob, otherKey)).toThrow(TokenCryptoError);
  });

  it('rejects decrypt when the ciphertext is tampered with', () => {
    const blob = encryptToken(SAMPLE_TOKEN, key);
    // Flip a bit in the body (past header + tag).
    const tampered = Buffer.from(blob);
    const last = tampered[tampered.length - 1] ?? 0;
    tampered[tampered.length - 1] = last ^ 0x01;
    expect(() => decryptToken(tampered, key)).toThrow(TokenCryptoError);
  });

  it('rejects decrypt on a blob with an unsupported version byte', () => {
    const blob = encryptToken(SAMPLE_TOKEN, key);
    const altered = Buffer.from(blob);
    altered[0] = 0x99;
    expect(() => decryptToken(altered, key)).toThrow(/unsupported version/);
  });

  it('rejects decrypt on a too-short blob', () => {
    expect(() => decryptToken(Buffer.alloc(4), key)).toThrow(/too short/);
  });

  it('rejects encrypt with the wrong key length', () => {
    expect(() => encryptToken(SAMPLE_TOKEN, Buffer.alloc(16))).toThrow(/must be 32 bytes/);
  });

  it('rejects encrypt of an empty plaintext', () => {
    expect(() => encryptToken('', key)).toThrow(/non-empty/);
  });

  describe('parseEncryptionKey', () => {
    it('accepts a 64-hex-char string', () => {
      const k = parseEncryptionKey(KEY_HEX);
      expect(k.length).toBe(32);
    });

    it('rejects a too-short key', () => {
      expect(() => parseEncryptionKey('abcd')).toThrow(/must be 32 bytes/);
    });

    it('rejects non-hex characters', () => {
      expect(() => parseEncryptionKey('z'.repeat(64))).toThrow(/hex-encoded/);
    });
  });

  describe('generateEncryptionKey', () => {
    it('yields a 64-hex-char string that parseEncryptionKey accepts', () => {
      const hex = generateEncryptionKey();
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
      const k = parseEncryptionKey(hex);
      expect(k.length).toBe(32);
    });
  });
});
