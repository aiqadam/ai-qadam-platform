// L1 hooks — /v1/admin/country-leads (super-admin onboarding cabinet).
//
// FR-MIG-028 — backs the country-leads cabinet at /workspace/country-leads.
// Super-admins list candidates + run the 4-step onboarding wizard that
// automates the manual activation runbook.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type {
  AdvanceOnboardingBody,
  CountryLeadRow,
  CountryLeadsResult,
  CreateCountryLeadBody,
  OnboardingState,
} from './types';

const LEADS_BASE_KEY = ['workspace', 'admin', 'country-leads'] as const;

export function leadsKey(): readonly unknown[] {
  return [...LEADS_BASE_KEY, 'list'] as const;
}

export function onboardingKey(leadId: string): readonly unknown[] {
  return [...LEADS_BASE_KEY, 'onboarding', leadId] as const;
}

export function useCountryLeads(): UseQueryResult<CountryLeadsResult, Error> {
  return useQuery<CountryLeadsResult, Error>({
    queryKey: leadsKey(),
    queryFn: () => apiClient<CountryLeadsResult>('/v1/admin/country-leads'),
  });
}

export function useOnboardingState(leadId: string): UseQueryResult<OnboardingState, Error> {
  return useQuery<OnboardingState, Error>({
    queryKey: onboardingKey(leadId),
    queryFn: () =>
      apiClient<OnboardingState>(
        `/v1/admin/country-leads/${encodeURIComponent(leadId)}/onboarding`,
      ),
    enabled: leadId.length > 0,
    // Poll while any step is in-flight (the RBAC bind is async).
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasInFlight = Object.values(data.steps).some((s) => s.status === 'pending');
      return hasInFlight ? 3000 : false;
    },
  });
}

export interface CreateLeadVars {
  body: CreateCountryLeadBody;
}

export function useCreateCountryLead(): UseMutationResult<CountryLeadRow, Error, CreateLeadVars> {
  const qc = useQueryClient();
  return useMutation<CountryLeadRow, Error, CreateLeadVars>({
    mutationFn: ({ body }) =>
      apiClient<CountryLeadRow>('/v1/admin/country-leads', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leadsKey() });
    },
  });
}

export interface AdvanceStepVars {
  leadId: string;
  stepId: string;
  body?: AdvanceOnboardingBody;
}

export function useAdvanceOnboardingStep(): UseMutationResult<
  OnboardingState,
  Error,
  AdvanceStepVars
> {
  const qc = useQueryClient();
  return useMutation<OnboardingState, Error, AdvanceStepVars>({
    mutationFn: ({ leadId, stepId, body }) =>
      apiClient<OnboardingState>(
        `/v1/admin/country-leads/${encodeURIComponent(leadId)}/onboarding/${encodeURIComponent(stepId)}`,
        {
          method: 'POST',
          body: (body ?? {}) as Record<string, unknown>,
        },
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: onboardingKey(vars.leadId) });
      void qc.invalidateQueries({ queryKey: leadsKey() });
    },
  });
}
