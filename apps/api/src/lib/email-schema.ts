import { z } from 'zod';

// Shared email validation. Per platform policy (2026-05-26): plus-
// addressed emails (a "+" in the local part, e.g. user+tag@gmail.com)
// are not allowed for account creation. They route to the same inbox
// as the base address, so they let one person mint multiple distinct
// platform identities — which broke a test once (drukker1991+akadmin
// had an Authentik identity but no Directus member, so its /me showed
// an empty/phantom account).
//
// Applied at every user-facing creation boundary (lead capture, admin
// invites, onboarding routing). NOT enforceable here for the Authentik
// SSO path — email arrives in the id_token claim; that gate lives in
// Authentik enrollment config.

const PLUS_ADDRESSING_MESSAGE = 'Plus-addressed emails (name+tag@…) are not allowed.';

export function hasPlusAddressing(email: string): boolean {
  const localPart = email.split('@')[0] ?? '';
  return localPart.includes('+');
}

// Drop-in replacement for `z.string().email()`. Trims + lowercases for
// canonical storage, caps length, and rejects plus-addressing.
export function emailField(maxLength = 254): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(maxLength)
    .refine((email) => !hasPlusAddressing(email), { message: PLUS_ADDRESSING_MESSAGE });
}
