import { describe, expect, it } from 'vitest';
import { emailField, hasPlusAddressing } from '../src/lib/email-schema';

describe('hasPlusAddressing', () => {
  it('detects + in the local part', () => {
    expect(hasPlusAddressing('drukker1991+akadmin@gmail.com')).toBe(true);
    expect(hasPlusAddressing('a+b+c@example.org')).toBe(true);
  });

  it('passes plain local parts', () => {
    expect(hasPlusAddressing('drukker1991@gmail.com')).toBe(false);
    expect(hasPlusAddressing('first.last@aiqadam.org')).toBe(false);
  });

  it('ignores a + that is only in the domain', () => {
    // Not a real-world address, but the rule targets the local part only.
    expect(hasPlusAddressing('user@weird+domain.test')).toBe(false);
  });
});

describe('emailField', () => {
  const schema = emailField();

  it('rejects plus-addressed emails', () => {
    const res = schema.safeParse('drukker1991+akadmin@gmail.com');
    expect(res.success).toBe(false);
  });

  it('accepts a plain email and canonicalizes it (trim + lowercase)', () => {
    const res = schema.safeParse('  Drukker1991@Gmail.com  ');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toBe('drukker1991@gmail.com');
  });

  it('rejects malformed emails', () => {
    expect(schema.safeParse('not-an-email').success).toBe(false);
  });

  it('enforces the max length', () => {
    const long = `${'a'.repeat(250)}@x.io`;
    expect(emailField(50).safeParse(long).success).toBe(false);
  });
});
