// L1 hook — public form renderer for /forms/[slug].
//
// Fetches form schema by slug and handles form submission. The API endpoint
// is public (GET + POST); no auth required for anonymous forms.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { PublicForm } from './types';

// ─── Query ────────────────────────────────────────────────────────────────────

export function usePublicForm(slug: string): UseQueryResult<PublicForm | null, Error> {
  return useQuery<PublicForm | null, Error>({
    queryKey: ['public', 'forms', slug] as const,
    queryFn: async () => {
      const res = await apiClient<PublicForm>(`/v1/forms/${encodeURIComponent(slug)}`);
      return res;
    },
    enabled: slug.length > 0,
  });
}

// ─── Submission ───────────────────────────────────────────────────────────────

export interface SubmitFormPayload {
  payload: Record<string, unknown>;
  is_anonymous: boolean;
  source: 'web';
}

export interface SubmitFormResult {
  success: boolean;
  error?: string;
}

export async function submitForm(
  slug: string,
  payload: Record<string, unknown>,
  isAnonymous = true,
): Promise<SubmitFormResult> {
  try {
    await apiClient<void>(`/v1/forms/${encodeURIComponent(slug)}/responses`, {
      method: 'POST',
      body: {
        payload,
        is_anonymous: isAnonymous,
        source: 'web',
      } satisfies SubmitFormPayload,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Submission failed' };
  }
}
