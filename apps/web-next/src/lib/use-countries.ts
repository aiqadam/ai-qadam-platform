// L1 hooks — /v1/workspace/countries (operator countries list).
//
// Backs the Countries cabinet at /workspace/admin/countries. FR-MIG-012
// ships the read-only list with status indicators.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CountryRow } from './types';

const COUNTRIES_KEY = ['workspace', 'countries'] as const;

export function useCountries(): UseQueryResult<CountryRow[], Error> {
  return useQuery<CountryRow[], Error>({
    queryKey: COUNTRIES_KEY,
    queryFn: () =>
      apiClient<{ countries: CountryRow[] }>('/v1/workspace/countries').then(
        (res) => res.countries,
      ),
  });
}
