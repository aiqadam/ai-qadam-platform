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

// FR-ADM-011 — plain-language role labels. The admin user/role management
// screen must never show a raw Authentik group slug (e.g.
// "aiqadam-country-lead-uz") to a super-admin; it shows "Country Lead —
// Uzbekistan" instead. Mirrors ADR-0021 §2's roles-inventory table.
//
// Per-country groups (organizer, country_lead) carry the country code as
// a suffix — COUNTRY_NAMES resolves the code to a display name so the
// label stays readable without a second lookup table at call sites.
const COUNTRY_NAMES: Record<string, string> = {
  uz: 'Uzbekistan',
  kz: 'Kazakhstan',
  tj: 'Tajikistan',
  xx: 'Demo',
};

const PER_COUNTRY_PREFIXES: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: 'aiqadam-organizer-', label: 'Organizer' },
  { prefix: 'aiqadam-country-lead-', label: 'Country Lead' },
];

const FIXED_LABELS: Record<string, string> = {
  'aiqadam-member': 'Member',
  'aiqadam-speaker': 'Speaker',
  'aiqadam-sponsor-rep': 'Sponsor Rep',
  'aiqadam-super-admin': 'Super Admin',
  'aiqadam-svc-bot': 'Bot Service',
  'aiqadam-svc-worker': 'Worker Service',
};

// Returns a human-readable label for a single raw Authentik group slug.
// Unknown groups (e.g. a per-org sponsor-rep group
// "aiqadam-sponsor-rep-<org-slug>", or a group not yet in this map) fall
// back to the raw slug rather than throwing — the admin screen must
// still render something for a group this mapping doesn't yet know
// about, per AGENTS.md §3 "functions protect themselves from bad input."
export function roleLabel(group: string): string {
  const fixed = FIXED_LABELS[group];
  if (fixed) return fixed;

  for (const { prefix, label } of PER_COUNTRY_PREFIXES) {
    if (group.startsWith(prefix)) {
      const code = group.slice(prefix.length);
      const country = COUNTRY_NAMES[code] ?? code.toUpperCase();
      return `${label} — ${country}`;
    }
  }

  if (group.startsWith('aiqadam-sponsor-rep-')) {
    return `Sponsor Rep — ${group.slice('aiqadam-sponsor-rep-'.length)}`;
  }

  return group;
}

// Maps a full groups claim to plain-language labels, one per group.
export function roleLabels(groups: readonly string[]): string[] {
  return groups.map(roleLabel);
}
