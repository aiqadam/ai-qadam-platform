// L1 hooks — registration status + register/cancel mutations.
//
// Lives outside `lib/api-*` deliberately so L3 blocks can import these
// hooks without tripping ADR-0038 §Locks #1 ("blocks must not import
// lib/api-*"). The intent of the lock — keep raw fetch + auth-handshake
// infra inside lib/api-* — is preserved: this file ONLY wraps
// apiClient calls behind TanStack Query hooks, no new fetch logic.
//
// Pages CAN use these too; nothing in the lock spec forces a separate
// path for "block-allowed" vs "page-allowed" hooks. Convention:
// hooks named `useX` always live in `lib/use-*.ts`.

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';

export type ActiveRegistrationStatus = 'registered' | 'waitlisted';

interface RegistrationRow {
  id: string;
  eventId: string;
  status: 'registered' | 'waitlisted' | 'cancelled' | 'attended';
  registeredAt: string;
}

interface RegistrationsResponse {
  registrations: RegistrationRow[];
}

interface RegisterBody {
  referredBy?: string;
  acquisitionSource?: unknown;
}

interface RegisterResponse {
  status: ActiveRegistrationStatus | 'cancelled' | 'attended';
}

const REGS_BASE_KEY = ['registrations', 'me'] as const;

export function useMyRegistrationStatus(
  eventId: string,
): UseQueryResult<ActiveRegistrationStatus | null, Error> {
  return useQuery<ActiveRegistrationStatus | null, Error>({
    queryKey: [...REGS_BASE_KEY, 'by-event', eventId] as const,
    queryFn: async () => {
      const body = await apiClient<RegistrationsResponse>('/v1/registrations');
      for (const r of body.registrations) {
        if (r.eventId === eventId && (r.status === 'registered' || r.status === 'waitlisted')) {
          return r.status;
        }
      }
      return null;
    },
    enabled: typeof eventId === 'string' && eventId.length > 0,
  });
}

export function useRegisterForEvent(
  eventId: string,
): UseMutationResult<ActiveRegistrationStatus, Error, RegisterBody | undefined> {
  const qc = useQueryClient();
  return useMutation<ActiveRegistrationStatus, Error, RegisterBody | undefined>({
    mutationFn: async (body) => {
      const res = await apiClient<RegisterResponse>(
        `/v1/events/${encodeURIComponent(eventId)}/register`,
        // Cast to Record<string,unknown> — RegisterBody's optional
        // fields make the index-signature widening unhappy under
        // exactOptionalPropertyTypes. The body is JSON-stringified
        // by apiClient downstream; the runtime shape is identical.
        { method: 'POST', body: (body ?? {}) as Record<string, unknown> },
      );
      if (res.status !== 'registered' && res.status !== 'waitlisted') {
        throw new Error(`unexpected status: ${res.status}`);
      }
      return res.status;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REGS_BASE_KEY });
    },
  });
}

export function useCancelRegistration(eventId: string): UseMutationResult<void, Error, void> {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await apiClient<void>(`/v1/events/${encodeURIComponent(eventId)}/register`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REGS_BASE_KEY });
    },
  });
}
