import { describe, expect, it } from 'vitest';
import { WEAK_PASSWORD_MESSAGE, isWeakPassword, passwordField } from '../src/lib/password-schema';

describe('isWeakPassword', () => {
  it('rejects passwords that are all one repeated character', () => {
    expect(isWeakPassword('aaaaaaaaaaaa')).toBe(true);
    expect(isWeakPassword('000000000000')).toBe(true);
  });

  it('rejects known common passwords, case-insensitively', () => {
    expect(isWeakPassword('passwordpassword')).toBe(true);
    expect(isWeakPassword('PASSWORDPASSWORD')).toBe(true);
    expect(isWeakPassword('PasswordPassword')).toBe(true);
  });

  it('accepts a genuinely varied, non-blocklisted password', () => {
    expect(isWeakPassword('a-genuinely-long-passphrase-12')).toBe(false);
    expect(isWeakPassword('Tr0ub4dor&3-correct-horse')).toBe(false);
  });

  it('does not flag an empty string as all-one-character', () => {
    // Guards isAllOneCharacter's `password.length > 0` check — an empty
    // string has zero distinct characters, not one, and should fall through
    // to the length check elsewhere (z.string().min(12)) rather than being
    // reported as "weak" for the wrong reason.
    expect(isWeakPassword('')).toBe(false);
  });
});

describe('passwordField', () => {
  const schema = passwordField(12);

  it('accepts a password that is long enough and not weak', () => {
    const res = schema.safeParse('a-genuinely-long-passphrase-12');
    expect(res.success).toBe(true);
  });

  it('rejects a password shorter than the minimum length', () => {
    const res = schema.safeParse('short1234567'.slice(0, 11));
    expect(res.success).toBe(false);
  });

  it('rejects an all-one-character password even if long enough', () => {
    const res = schema.safeParse('aaaaaaaaaaaa');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(WEAK_PASSWORD_MESSAGE);
    }
  });

  it('rejects a blocklisted common password even if long enough', () => {
    const res = schema.safeParse('passwordpassword');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(WEAK_PASSWORD_MESSAGE);
    }
  });

  it('respects a custom minLength argument', () => {
    const shorter = passwordField(8);
    expect(shorter.safeParse('8-charss').success).toBe(true);
    expect(schema.safeParse('8-charss').success).toBe(false);
  });
});
