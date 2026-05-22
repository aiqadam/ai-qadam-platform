// F-S2.2 (ADR-0021 §4) — pure mapping from Authentik group names to
// the expected per-engine state. No I/O — testable in isolation.
//
// Canonical group names per ADR-0021 §2:
//   aiqadam-member         (default for every Authentik user)
//   aiqadam-speaker
//   aiqadam-sponsor-rep
//   aiqadam-sponsor-rep-<org>     (multiple per rep)
//   aiqadam-organizer-<country>   uz | kz | tj | xx
//   aiqadam-country-lead-<country>
//   aiqadam-super-admin
//   aiqadam-svc-bot
//   aiqadam-svc-worker
//   aiqadam-staff                 (workspace cabinet access, no admin)

export type CountryCode = 'uz' | 'kz' | 'tj' | 'xx';
export const COUNTRY_CODES: readonly CountryCode[] = ['uz', 'kz', 'tj', 'xx'] as const;

// Directus policy keys — match the seven role policies seeded by F-S2.2-pre
// (see infrastructure/directus/bootstrap.sh: `policy.member`, `.speaker`,
// `.sponsor_rep`, `.organizer`, `.country_lead`, `.svc_bot`, `.svc_worker`).
// The sync service resolves these slugs to Directus policy UUIDs at apply
// time — we keep slugs here so the mapping stays declarative.
export type DirectusPolicySlug =
  | 'policy.member'
  | 'policy.speaker'
  | 'policy.sponsor_rep'
  | 'policy.organizer'
  | 'policy.country_lead'
  | 'policy.svc_bot'
  | 'policy.svc_worker';

export interface ExpectedDirectusState {
  policies: DirectusPolicySlug[];
  // Country filter for collections scoped by country_code. Null means no
  // filter (super-admin, service principals).
  filter_country: CountryCode | null;
}

export type PlausibleRole = 'admin' | 'viewer';

export interface ExpectedPlausibleState {
  // Site names match the per-country domain — uz.aiqadam.org, etc.
  sites: string[];
  role: PlausibleRole;
}

export interface ExpectedState {
  directus: ExpectedDirectusState;
  plausible: ExpectedPlausibleState;
}

const SUPER_ADMIN = 'aiqadam-super-admin';
const SVC_BOT = 'aiqadam-svc-bot';
const SVC_WORKER = 'aiqadam-svc-worker';
const COUNTRY_LEAD_PREFIX = 'aiqadam-country-lead-';
const ORGANIZER_PREFIX = 'aiqadam-organizer-';
const SPONSOR_REP = 'aiqadam-sponsor-rep';
const SPEAKER = 'aiqadam-speaker';

// Parse a per-country group name. Returns the country code or null when
// the suffix doesn't match a known country.
function parseCountrySuffix(group: string, prefix: string): CountryCode | null {
  if (!group.startsWith(prefix)) return null;
  const suffix = group.slice(prefix.length);
  return (COUNTRY_CODES as readonly string[]).includes(suffix) ? (suffix as CountryCode) : null;
}

/**
 * Compute the desired Directus + Plausible state for a user whose
 * canonical Authentik group membership is `groups` (array of group
 * names). The function is total — every input yields a sane output —
 * and idempotent (same input → same output).
 *
 * Priority order (highest wins on filter_country):
 *   super_admin → no filter
 *   svc_*       → no filter (service principals)
 *   country_lead-<c> → filter_country=c
 *   organizer-<c>    → filter_country=c
 *   else        → no filter (member-class)
 */
export function computeExpectedState(groups: string[]): ExpectedState {
  const policies = new Set<DirectusPolicySlug>();
  let filterCountry: CountryCode | null = null;
  const plausibleSites = new Set<string>();
  let plausibleRole: PlausibleRole = 'viewer';

  // Every Authentik user gets the member baseline.
  policies.add('policy.member');

  for (const g of groups) {
    if (g === SUPER_ADMIN) {
      // Super-admin wins everything: admin policy is applied at the
      // sync layer (we use the built-in Directus Admin policy id; here
      // we still write `policy.member` for downstream rendering, but
      // the sync service treats super_admin specially and grants the
      // built-in admin policy in addition).
      filterCountry = null;
      plausibleRole = 'admin';
      for (const c of COUNTRY_CODES) plausibleSites.add(`${c}.aiqadam.org`);
      continue;
    }
    if (g === SVC_BOT) {
      policies.add('policy.svc_bot');
      filterCountry = null;
      continue;
    }
    if (g === SVC_WORKER) {
      policies.add('policy.svc_worker');
      filterCountry = null;
      continue;
    }
    if (g === SPEAKER) {
      policies.add('policy.speaker');
      continue;
    }
    if (g === SPONSOR_REP || g.startsWith(`${SPONSOR_REP}-`)) {
      policies.add('policy.sponsor_rep');
      continue;
    }
    const leadCountry = parseCountrySuffix(g, COUNTRY_LEAD_PREFIX);
    if (leadCountry) {
      policies.add('policy.country_lead');
      filterCountry = filterCountry ?? leadCountry;
      plausibleSites.add(`${leadCountry}.aiqadam.org`);
      // Country lead manages their country's analytics — viewer role
      // is sufficient; admin reserved for super-admin.
      continue;
    }
    const orgCountry = parseCountrySuffix(g, ORGANIZER_PREFIX);
    if (orgCountry) {
      policies.add('policy.organizer');
      filterCountry = filterCountry ?? orgCountry;
      plausibleSites.add(`${orgCountry}.aiqadam.org`);
    }
    // aiqadam-member, aiqadam-staff, unknown — fall through. Members
    // don't get extra policies; staff is workspace-cabinet only and is
    // governed entirely at the cabinet/route level, not Directus policy.
  }

  return {
    directus: {
      policies: Array.from(policies).sort(),
      filter_country: filterCountry,
    },
    plausible: {
      sites: Array.from(plausibleSites).sort(),
      role: plausibleRole,
    },
  };
}
