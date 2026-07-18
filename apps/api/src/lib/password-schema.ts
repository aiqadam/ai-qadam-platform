import { z } from 'zod';

// Shared password validation for PUBLIC self-service endpoints.
//
// ISS-USR-REG-001 retry pass — SecurityReviewer MAJOR-3: the length-only
// `min(12)` policy matches existing precedent (admin-invites.service.ts's
// consumeInvite, `password.length < 12`), but that precedent is
// operator-invited — a materially smaller exposure surface than genuine
// public self-registration. A 12-char length-only policy on a public
// endpoint still allows trivially weak-but-long passwords
// (`aaaaaaaaaaaa`, `passwordpassword`, `123456789012`).
//
// Chosen fix (Option (a) from the retry brief — stronger than a
// documentation-only risk acceptance, low effort, no new dependency):
// reject passwords that are all one repeated character, AND reject a
// small hardcoded top-N common-password blocklist. This is NOT meant to
// be a comprehensive breach-list check (that would need an external API
// or a large bundled corpus, overkill for a MAJOR/should-fix finding) —
// it exists to raise the bar past "any 12 characters" without adding
// external dependencies or network calls to a hot, rate-limited public
// endpoint. Authentik's own server-side Password Policy configuration
// (if bound to the registration/set-password flow) is a separate,
// unverified-from-this-repo backstop — see security.md and
// 03-code-summary.md's "Known Limitations" for that explicit
// risk-acceptance note.
//
// Deliberately NOT applied to admin-invites.service.ts's consumeInvite —
// that flow is operator-invited (smaller exposure, out of scope for this
// fix) and changing it is a separate decision with its own blast radius.

// Top ~40 trivially common passwords/patterns from public breach
// corpora (RockYou-class), filtered to those that are >= 12 characters
// (shorter ones are already rejected by the length check) or are
// common 12+-char patterns attackers try first. Lowercased; compared
// case-insensitively.
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password123',
  'password1234',
  'passwordpassword',
  '123456789012',
  '1234567890123',
  '12345678901234',
  'qwertyuiop123',
  'qwertyuiopasdf',
  'letmein123456',
  'admin12345678',
  'welcome123456',
  'iloveyou12345',
  'princess123456',
  'sunshine123456',
  'football123456',
  'baseball123456',
  'dragon123456789',
  'monkey123456789',
  'trustno1trustno1',
  'aaaaaaaaaaaa',
  'aaaaaaaaaaaaa',
  'bbbbbbbbbbbb',
  '000000000000',
  '111111111111',
  'changeme12345',
  'abc123abc123',
  'abcdefghijkl',
  'abcdefghijklmn',
  '1q2w3e4r5t6y',
  'zxcvbnmzxcvbnm',
  'superman123456',
  'batman123456789',
  'whatever123456',
  'nopassword1234',
  'temppassword1',
  'temporarypass',
  'newpassword123',
  'testtesttest',
  'testtest1234',
]);

// True if the password is all one repeated character (e.g.
// "aaaaaaaaaaaa") — trivially guessable regardless of length.
function isAllOneCharacter(password: string): boolean {
  return password.length > 0 && new Set(password).size === 1;
}

function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

export const WEAK_PASSWORD_MESSAGE =
  'This password is too common or predictable. Please choose a different one.';

export function isWeakPassword(password: string): boolean {
  return isAllOneCharacter(password) || isCommonPassword(password);
}

// Drop-in replacement for `z.string().min(12)` on public, self-service
// password fields. Keeps the existing length floor and adds the
// weak-password rejection above.
export function passwordField(minLength = 12): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .min(minLength)
    .refine((password) => !isWeakPassword(password), { message: WEAK_PASSWORD_MESSAGE });
}
