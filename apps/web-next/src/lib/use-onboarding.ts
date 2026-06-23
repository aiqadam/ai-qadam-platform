// L1 hooks — POST /v1/members/onboard (FR-MIG-020).
//
// Lives under lib/use-* so L3 blocks can import without tripping
// ADR-0038 §Locks #1.

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { apiClient } from './api-client';

export interface OnboardingData {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  skills: string[];
  interests: Array<{ topic_tag: string; intent: 'learn' | 'practice' | 'mentor' | 'discuss' }>;
  consents: Record<string, boolean>;
  slug?: string | undefined;
  [key: string]: unknown;
}

export function useOnboardMember(): UseMutationResult<void, Error, OnboardingData, unknown> {
  return useMutation<void, Error, OnboardingData>({
    mutationFn: async (data: OnboardingData) => {
      await apiClient<void>('/v1/members/onboard', {
        method: 'POST',
        body: data,
      });
    },
  });
}
