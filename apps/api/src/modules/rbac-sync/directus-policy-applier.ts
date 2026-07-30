import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import type { DirectusPolicySlug, ExpectedDirectusState } from './group-mapping';

// F-S2.2-c — Directus engine apply. Resolves the seven policy slugs
// to the deterministic UUIDs seeded by F-S2.2-pre (bootstrap.sh
// POLICY_RBAC_*) and PATCHes directus_users.policies[] to match.
//
// Country filter ({ country: { _eq: <c> } } per ADR-0021 §4.1) is
// applied via the directus_users.country attribute the same sync
// writes. Per-collection permission rows that ADR-0021 §4.1 references
// are seeded at policy creation time (bootstrap.sh) — this PR just
// attaches the right policy mix to the user.

// Slug → UUID. Source of truth is bootstrap.sh:1820-1826. Hard-coded
// here so the apply path doesn't need to query Directus at runtime.
export const DIRECTUS_POLICY_UUIDS: Record<DirectusPolicySlug, string> = {
  'policy.member': '400e0021-0000-4000-8000-000000000001',
  'policy.speaker': '400e0021-0000-4000-8000-000000000002',
  'policy.sponsor_rep': '400e0021-0000-4000-8000-000000000003',
  'policy.organizer': '400e0021-0000-4000-8000-000000000004',
  'policy.country_lead': '400e0021-0000-4000-8000-000000000005',
  'policy.svc_bot': '400e0021-0000-4000-8000-000000000006',
  'policy.svc_worker': '400e0021-0000-4000-8000-000000000007',
};

export interface ApplyOutcome {
  status: 'applied' | 'failed';
  error?: string;
}

@Injectable()
export class DirectusPolicyApplier {
  private readonly logger = new Logger(DirectusPolicyApplier.name);

  constructor(private readonly directus: DirectusClient) {}

  /**
   * PATCHes the Directus user's policies + country to match the
   * expected state. Idempotent: if the user already has the right
   * policies + country, the PATCH is a no-op on Directus' side.
   *
   * Returns a structured outcome; failures are non-fatal to the caller
   * (the sync service flips directus_status='failed' on the rbac_sync_jobs
   * row and continues to the next engine).
   */
  async apply(directusUserId: string, expected: ExpectedDirectusState): Promise<ApplyOutcome> {
    const policyUuids = expected.policies.map((slug) => DIRECTUS_POLICY_UUIDS[slug]);
    try {
      // `policies` on directus_users is an M2M alias field backed by the
      // directus_access junction table — Directus rejects a flat array of
      // related-record UUIDs here with a generic 403 (ISS-UAT-RBAC-001;
      // confirmed against directus/directus #25108 and directus/docs #520:
      // the array elements are junction-record ids, not policy ids). The
      // field must be written via the relational create/update/delete
      // envelope. We replace the full set every sync (delete all existing
      // access rows for this user, create the expected set) rather than
      // diffing, since ExpectedDirectusState is already the complete
      // desired state and a full replace is simpler and still idempotent.
      const existingRowIds = await this.fetchExistingAccessRowIds(directusUserId);
      const body: Record<string, unknown> = {
        policies: {
          create: policyUuids.map((policy) => ({ user: directusUserId, policy })),
          update: [],
          delete: existingRowIds,
        },
        // directus_users' real field is `country` (2-letter code), not
        // `country_code` -- the latter silently no-ops on PATCH since
        // Directus ignores unknown body keys instead of erroring
        // (found live, ISS-RBAC-PERMS-001, wf-20260731-fix-161: every
        // country-scoped policy grant depends on this field actually
        // being set, and it never was).
        country: expected.filter_country,
      };
      await this.directus.patch(`/users/${encodeURIComponent(directusUserId)}`, body);
      this.logger.log({
        event: 'rbac.apply.directus.ok',
        user_id: directusUserId,
        policies: expected.policies,
        country: expected.filter_country,
      });
      return { status: 'applied' };
    } catch (err) {
      const reason = err instanceof DirectusError ? `${err.status} ${err.path}` : String(err);
      this.logger.warn(`rbac.apply.directus.failed user=${directusUserId}: ${reason}`);
      return { status: 'failed', error: reason.slice(0, 500) };
    }
  }

  // directus_access is a protected system collection — GET /items/directus_access
  // 403s even for a full-admin token. The user's own directus_access row ids
  // are readable through the `policies` alias field on /users/{id} instead
  // (Directus returns the junction-record ids there, not policy ids — same
  // shape the nested create/update/delete envelope expects for `delete`).
  private async fetchExistingAccessRowIds(directusUserId: string): Promise<string[]> {
    const res = await this.directus.get<{ data: { policies: string[] } }>(
      `/users/${encodeURIComponent(directusUserId)}?fields=policies`,
    );
    return res.data.policies;
  }
}
