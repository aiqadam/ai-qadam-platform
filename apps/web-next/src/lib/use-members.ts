// L1 hooks — /v1/workspace/members (operator-facing member directory).
//
// Backs the Members cabinet at /workspace/members. PR 2.2 ships the
// read-only paginated list; filter/cohort hooks come in later PRs that
// build on this same key pattern.
//
// Lives under `lib/use-*` per the convention so L3 blocks can import
// the hook without tripping ADR-0038 §Locks #1.

import { type UseQueryResult, keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { MemberSearchResult } from './types';

export interface MembersSearchArgs {
  q?: string;
  // Raw Directus filter object (built by lib/member-filters). Sent as
  // a JSON-encoded `filter` query param when non-empty.
  filter?: Record<string, unknown>;
  page: number;
  limit: number;
}

const MEMBERS_BASE_KEY = ['workspace', 'members'] as const;

export function useMembersSearch(
  args: MembersSearchArgs,
): UseQueryResult<MemberSearchResult, Error> {
  return useQuery<MemberSearchResult, Error>({
    queryKey: [...MEMBERS_BASE_KEY, args] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(args.page),
        limit: String(args.limit),
      });
      if (args.q && args.q.trim().length > 0) {
        params.set('q', args.q.trim());
      }
      if (args.filter && Object.keys(args.filter).length > 0) {
        params.set('filter', JSON.stringify(args.filter));
      }
      return apiClient<MemberSearchResult>(`/v1/workspace/members?${params.toString()}`);
    },
    // Keep previous page rendered while the next page loads — avoids
    // empty-state flicker between pagination clicks.
    placeholderData: keepPreviousData,
  });
}
