// L1 hooks — linked accounts read + unlink mutations.
//
// Pattern mirrors use-registrations.ts: React Query hooks wrapping
// apiClient, living in lib/ so L3 blocks can import them without
// violating ADR-0038 §Locks #1.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';

export type LinkedProvider = 'email' | 'google' | 'github' | 'telegram';

export interface LinkedAccountEntry {
  provider: LinkedProvider;
  linked: boolean;
  handle: string | null;
  canUnlink: boolean;
}

const LINKED_ACCOUNTS_KEY = ['auth', 'linked-accounts'] as const;

export function useLinkedAccounts(): UseQueryResult<LinkedAccountEntry[], Error> {
  return useQuery<LinkedAccountEntry[], Error>({
    queryKey: LINKED_ACCOUNTS_KEY,
    queryFn: async () => {
      return apiClient<LinkedAccountEntry[]>('/v1/auth/linked-accounts');
    },
  });
}

export function useUnlinkProvider(): UseMutationResult<void, Error, LinkedProvider> {
  const qc = useQueryClient();
  return useMutation<void, Error, LinkedProvider>({
    mutationFn: async (provider) => {
      await apiClient<void>(`/v1/auth/linked-accounts/${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LINKED_ACCOUNTS_KEY });
    },
  });
}
