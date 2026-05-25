// L1 hooks — /v1/workspace/dashboard (operator KPI metrics).
//
// Two endpoints:
//   GET /v1/workspace/dashboard/country?c=<cc>&days=30   — single country
//   GET /v1/workspace/dashboard/cross-country?days=30    — all 4 countries
//
// The cabinet defaults to a 30-day window; the picker can switch to
// 7 / 90 / 365. PR 2.4 ships read-only KPIs; trends + delta-vs-prev-
// window land in a follow-up when the API surfaces them.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CountryCode, CountryMetrics } from './types';

const DASHBOARD_BASE_KEY = ['workspace', 'dashboard'] as const;

export interface CountryMetricsArgs {
  country: CountryCode;
  days: number;
}

export function useCountryMetrics(args: CountryMetricsArgs): UseQueryResult<CountryMetrics, Error> {
  return useQuery<CountryMetrics, Error>({
    queryKey: [...DASHBOARD_BASE_KEY, 'country', args] as const,
    queryFn: async () => {
      const params = new URLSearchParams({ c: args.country, days: String(args.days) });
      return apiClient<CountryMetrics>(`/v1/workspace/dashboard/country?${params.toString()}`);
    },
  });
}

export function useCrossCountryMetrics(days: number): UseQueryResult<CountryMetrics[], Error> {
  return useQuery<CountryMetrics[], Error>({
    queryKey: [...DASHBOARD_BASE_KEY, 'cross-country', days] as const,
    queryFn: async () => {
      const body = await apiClient<{ metrics: CountryMetrics[] } | CountryMetrics[]>(
        `/v1/workspace/dashboard/cross-country?days=${days}`,
      );
      // Endpoint returns the array directly in v1; tolerate either shape.
      return Array.isArray(body) ? body : body.metrics;
    },
  });
}
