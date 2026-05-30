// L1 hooks — /v1/admin/countries/:code/provisioning (super-admin only).
//
// Backs the <CountryProvisioningWizard> cabinet at
// /workspace/admin/countries/[code]/provisioning. M2.5-i shipped read;
// M2.5-ii adds run + activate. M2.5-iii adds manual-complete.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { ProvisioningEnvelope, ProvisioningState } from './types';

const PROVISIONING_BASE_KEY = ['workspace', 'admin', 'countries', 'provisioning'] as const;

export function provisioningKey(code: string): readonly unknown[] {
  return [...PROVISIONING_BASE_KEY, code] as const;
}

export function useProvisioningState(code: string): UseQueryResult<ProvisioningEnvelope, Error> {
  return useQuery<ProvisioningEnvelope, Error>({
    queryKey: provisioningKey(code),
    queryFn: () =>
      apiClient<ProvisioningEnvelope>(
        `/v1/admin/countries/${encodeURIComponent(code)}/provisioning`,
      ),
    // The state mutates from the API runner (POST .../run); auto-refetch
    // on focus keeps a sticky tab in sync if the operator switched away.
    refetchOnWindowFocus: true,
  });
}

// POST /v1/admin/countries/:code/provisioning/run — idempotent. Used
// for both "Start" (no prior state) and "Re-run" (advance past the
// first non-succeeded step). On success we invalidate the read query
// so the cabinet picks up the new per-step status without a manual
// refresh.
export function useRunProvisioning(
  code: string,
): UseMutationResult<ProvisioningState, Error, void> {
  const qc = useQueryClient();
  return useMutation<ProvisioningState, Error, void>({
    mutationFn: () =>
      apiClient<ProvisioningState>(
        `/v1/admin/countries/${encodeURIComponent(code)}/provisioning/run`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: provisioningKey(code) });
    },
  });
}

// POST /v1/admin/countries/:code/activate — legal only when every
// step is `succeeded`. Flips is_active=true. Server-side enforces
// the gate; the cabinet disables the button on stale state for UX.
export function useActivateCountry(
  code: string,
): UseMutationResult<ProvisioningEnvelope, Error, void> {
  const qc = useQueryClient();
  return useMutation<ProvisioningEnvelope, Error, void>({
    mutationFn: () =>
      apiClient<ProvisioningEnvelope>(`/v1/admin/countries/${encodeURIComponent(code)}/activate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: provisioningKey(code) });
    },
  });
}
