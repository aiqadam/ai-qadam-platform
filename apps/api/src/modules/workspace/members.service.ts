import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// F-S3.2 — paginated member search powering /workspace/members.
//
// Filter primitives (MVP — 7 of them, per the multi-hat-reviewed scope):
//   country         — equality on directus_users.country (resolved via
//                     relation to countries.code; today members have an
//                     implicit country via registered events; once members
//                     gain a direct country column this becomes trivial)
//   seniority       — _in over the seniority enum on directus_users
//   industry        — _contains over the industry tag array
//   interests       — _in over member_interests.topic_tag (joined)
//   employed_at     — _eq over member_employments.employer + is_current=true
//   attended_min    — denormalised registrations_count threshold; we count
//                     registrations on the fly via Directus _count
//   consent         — purpose ∈ member_consents with revoked_at IS NULL
//
// Filter language is Directus-native JSON so it stores 1:1 into
// cohorts.filter_query and can be replayed against the dispatcher's
// audience resolver without translation.
//
// Country scoping: until ADR-0021 RBAC ships, this service runs in
// super-admin mode (any logged-in operator sees all). The CohortsService
// + the auto-injected country filter come in S2.2.

// NOTE on field names: Directus's directus_users collection uses
// `industry_tags` (the canonical schema field, per
// infrastructure/directus/bootstrap.sh). `display_name` does NOT exist
// on directus_users at all. The cabinets + v1's MemberDirectory were
// authored against an intended schema that didn't ship — Directus 400'd
// our `fields=` selector, DirectusClient threw, NestJS surfaced 500
// (root-caused 2026-05-29 on first signed-in hit). We keep the public
// `industry` key on MemberRow because the cabinet UI + cohort filter
// language are built around it; the Directus schema name leaks only
// at the fetch boundary below.
export interface MemberRow {
  id: string;
  email: string;
  first_name?: string | null;
  job_title?: string | null;
  seniority?: string | null;
  city?: string | null;
  industry?: string[] | null;
  is_student?: boolean | null;
  appear_in_directory?: boolean | null;
  state?: string | null;
}

export interface MemberSearchResult {
  members: MemberRow[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);
  private static readonly MAX_LIMIT = 200;
  private static readonly DEFAULT_LIMIT = 50;

  constructor(private readonly directus: DirectusClient) {}

  /**
   * Search members against an arbitrary Directus filter object.
   *
   * The filter shape is Directus-native — same JSON that cohorts.filter_query
   * stores — so passing a saved cohort's filter to this method renders the
   * same audience the dispatcher would resolve.
   */
  async search(input: {
    filter?: Record<string, unknown> | undefined;
    query?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<MemberSearchResult> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(
      MembersService.MAX_LIMIT,
      Math.max(1, input.limit ?? MembersService.DEFAULT_LIMIT),
    );
    const offset = (page - 1) * limit;

    // Compose the filter: caller's filter ANDed with a directory-visible
    // gate. Operators see members regardless of appear_in_directory because
    // they need them for cohort building; that's why operators are role-
    // gated to begin with. (Sponsors NEVER reach this endpoint.)
    const effectiveFilter = input.filter ?? {};

    // Request Directus's canonical schema names; `display_name` is
    // intentionally absent (it doesn't exist on directus_users).
    const fields = encodeURIComponent(
      [
        'id',
        'email',
        'first_name',
        'job_title',
        'seniority',
        'city',
        'industry_tags',
        'is_student',
        'appear_in_directory',
        'state',
      ].join(','),
    );

    const filterParam = encodeURIComponent(JSON.stringify(effectiveFilter));
    const searchParam = input.query ? `&search=${encodeURIComponent(input.query)}` : '';
    const path = `/users?fields=${fields}&filter=${filterParam}${searchParam}&limit=${limit}&offset=${offset}&meta=filter_count`;

    interface DirectusUserRow extends Omit<MemberRow, 'industry'> {
      industry_tags?: string[] | null;
    }
    const res = await this.directus.get<{
      data: DirectusUserRow[];
      meta?: { filter_count?: number };
    }>(path);

    // Boundary mapping: industry_tags (Directus) → industry (public).
    const members = res.data.map((row): MemberRow => {
      const { industry_tags, ...rest } = row;
      return { ...rest, industry: industry_tags ?? null };
    });

    return {
      members,
      total: res.meta?.filter_count ?? members.length,
      page,
      limit,
    };
  }

  /**
   * Count members matching a filter. Cheaper than search() — returns
   * just the meta count, no rows. Used by SaveCohortModal for live
   * preview.
   */
  async count(filter: Record<string, unknown>): Promise<number> {
    const filterParam = encodeURIComponent(JSON.stringify(filter));
    const path = `/users?fields=id&filter=${filterParam}&limit=1&meta=filter_count`;
    const res = await this.directus.get<{
      meta?: { filter_count?: number };
    }>(path);
    return res.meta?.filter_count ?? 0;
  }

  /**
   * Resolve a filter to the matching user IDs — used by AnnounceService
   * (F-S3.3) to translate a cohort's filter_query into the
   * dispatcher's audience.userIds[] shape with zero schema translation.
   *
   * Hard cap at MAX_DISPATCH_AUDIENCE so a runaway filter doesn't
   * blast the platform. If the actual cohort exceeds the cap, callers
   * should split into multiple dispatches OR refine the cohort first.
   */
  static readonly MAX_DISPATCH_AUDIENCE = 5000;

  async resolveToUserIds(filter: Record<string, unknown>): Promise<{
    userIds: string[];
    truncated: boolean;
    total: number;
  }> {
    const total = await this.count(filter);
    const truncated = total > MembersService.MAX_DISPATCH_AUDIENCE;
    const fetchLimit = Math.min(total, MembersService.MAX_DISPATCH_AUDIENCE);
    if (fetchLimit === 0) {
      return { userIds: [], truncated: false, total: 0 };
    }
    const filterParam = encodeURIComponent(JSON.stringify(filter));
    const path = `/users?fields=id&filter=${filterParam}&limit=${fetchLimit}`;
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(path);
    return {
      userIds: res.data.map((u) => u.id),
      truncated,
      total,
    };
  }
}
