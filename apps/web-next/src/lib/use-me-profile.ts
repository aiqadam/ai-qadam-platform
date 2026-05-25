// L1 hooks — /v1/me/profile (signed-in self-edit surface).
//
// Backs the L3 blocks on /me/profile: <ConsentList>, <SkillTagger>,
// and (future PRs) interests + employments + profile-core editors.
//
// Lives under `lib/use-*` per the convention established in PR 1.4
// so L3 blocks can import these hooks without tripping ADR-0038
// §Locks #1 (which blocks runtime imports of `lib/api-*`).
//
// One query (`useMyFullProfile`) fetches the entire envelope once;
// each editor reads the slice it cares about and the mutations
// invalidate the parent key on success. Subsequent block mounts
// share the same cache entry — N blocks = 1 network call.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { ConsentPurpose, ConsentSummary, MeProfileFull, MemberSkill } from './types';

const PROFILE_KEY = ['me', 'profile'] as const;

export function useMyFullProfile(): UseQueryResult<MeProfileFull, Error> {
  return useQuery<MeProfileFull, Error>({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const body = await apiClient<{
        profile: MeProfileFull['profile'];
        consents: ConsentSummary[];
        skills: MemberSkill[];
      }>('/v1/me/profile');
      return {
        profile: body.profile,
        consents: body.consents,
        skills: body.skills ?? [],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Consent — single-purpose toggle. The API returns the updated
// ConsentSummary for the toggled purpose; we patch it into the
// cached envelope optimistically.
// ---------------------------------------------------------------------------

export function useUpdateConsent(): UseMutationResult<
  ConsentSummary,
  Error,
  { purpose: ConsentPurpose; granted: boolean }
> {
  const qc = useQueryClient();
  return useMutation<ConsentSummary, Error, { purpose: ConsentPurpose; granted: boolean }>({
    mutationFn: async ({ purpose, granted }) => {
      const body = await apiClient<{ consent: ConsentSummary }>('/v1/me/profile/consents', {
        method: 'PATCH',
        body: { purpose, granted },
      });
      return body.consent;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Skills — add / remove. The API returns the created Skill on add;
// remove is fire-and-forget.
// ---------------------------------------------------------------------------

export function useAddSkill(): UseMutationResult<MemberSkill, Error, string> {
  const qc = useQueryClient();
  return useMutation<MemberSkill, Error, string>({
    mutationFn: async (skillTag) => {
      const body = await apiClient<{ skill: MemberSkill }>('/v1/me/profile/skills', {
        method: 'POST',
        body: { skill_tag: skillTag },
      });
      return body.skill;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

export function useRemoveSkill(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (skillId) => {
      await apiClient<void>(`/v1/me/profile/skills/${encodeURIComponent(skillId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
