// L1 hooks — /v1/referrals/mine + /v1/referrals/mine/stats
// (member referral codes + attribution stats).
//
// FR-MIG-018 — backs <ReferralDashboard> on /me/referrals.
// Both endpoints are self-only (controller filters by req.user.sub).
// Lives under lib/use-* per ADR-0038 §Locks #1.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { MyReferralStats, ReferralCodeView } from './types';

const REFERRALS_KEY = ['me', 'referrals'] as const;

export function useMyReferralCodes(): UseQueryResult<ReferralCodeView[], Error> {
  return useQuery<ReferralCodeView[], Error>({
    queryKey: [...REFERRALS_KEY, 'codes'] as const,
    queryFn: async () => {
      const body = await apiClient<{ codes: ReferralCodeView[] }>('/v1/referrals/mine');
      return body.codes;
    },
  });
}

export function useMyReferralStats(): UseQueryResult<MyReferralStats, Error> {
  return useQuery<MyReferralStats, Error>({
    queryKey: [...REFERRALS_KEY, 'stats'] as const,
    queryFn: async () => {
      const body = await apiClient<{ stats: MyReferralStats }>('/v1/referrals/mine/stats');
      return body.stats;
    },
  });
}
