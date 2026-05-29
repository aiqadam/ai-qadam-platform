// L1 — Authentik group predicates (single source of truth).
//
// The raw Authentik `groups` claim arrives via useAuth().user.groups
// (client) and Astro.locals.auth.me.groups (SSR). There is NO synthetic
// flat `aiqadam-operators` group — "operator" is a FAMILY of groups.
// Before this module, four call sites each rolled their own predicate
// and two invented non-existent groups (`aiqadam-operators`,
// `aiqadam-engineers`), locking every real operator out of the
// workspace. This module is the one definition, mirroring the API
// guard (super-admin.guard.ts) + v1's NavAccountMenu semantics.

const SUPER_ADMIN_GROUPS = ['aiqadam-super-admin', 'authentik Admins'] as const;

export function isSuperAdmin(groups: readonly string[]): boolean {
  return groups.some((g) => (SUPER_ADMIN_GROUPS as readonly string[]).includes(g));
}

// Operator = anyone who should reach /workspace. Matches the same
// family AccountChip uses to show the "Workspace" nav link, so the
// nav and the page gate can never disagree (the Topic-1 bug).
export function isOperator(groups: readonly string[]): boolean {
  return groups.some(
    (g) =>
      g === 'aiqadam-super-admin' ||
      g === 'aiqadam-sponsor-rep' ||
      g.startsWith('aiqadam-country-lead-') ||
      g.startsWith('aiqadam-organizer-'),
  );
}

// Semantic role tokens for <AuthGate role=...>. These are NOT literal
// Authentik groups — they expand to the families above. Any other
// string is matched as a literal group membership.
export const ROLE_OPERATOR = 'aiqadam-operators';
export const ROLE_SUPER_ADMIN = 'aiqadam-super-admin';

export function satisfiesRole(required: string, groups: readonly string[]): boolean {
  if (required === ROLE_OPERATOR) return isOperator(groups);
  if (required === ROLE_SUPER_ADMIN) return isSuperAdmin(groups);
  return groups.includes(required);
}
