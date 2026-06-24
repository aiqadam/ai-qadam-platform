// L1 hook — event-day check-in for /checkin (FR-MIG-021).
//
// Wraps POST /v1/registrations/:token/checkin. The token is the QR code's
// checkin_code UUID; the operator provides eventId from the dropdown.

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { CheckinRequest, CheckinResponse } from './types';

export interface CheckinVariables {
  token: string;
  eventId: string;
}

export function useCheckin(): UseMutationResult<CheckinResponse, Error, CheckinVariables> {
  return useMutation<CheckinResponse, Error, CheckinVariables>({
    mutationFn: async ({ token, eventId }) => {
      const body: CheckinRequest = { eventId };
      return apiClient<CheckinResponse>(`/v1/registrations/${encodeURIComponent(token)}/checkin`, {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      });
    },
  });
}
