// L1 hooks — /v1/admin/countries/:code/provisioning (super-admin only).
//
// Backs the <CountryProvisioningWizard> cabinet at
// /workspace/admin/countries/[code]/provisioning. M2.5-i ships read; the
// run / retry / activate / manual-complete mutations land with M2.5-ii
// + M2.5-iii so the read surface can be reviewed in isolation first.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { ProvisioningEnvelope } from './types';

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
