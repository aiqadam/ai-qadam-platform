// L1 hooks — /v1/workspace/forms/:id (per-form detail + responses).
//
// FR-MIG-013 — backs FormBuilderCabinet (GET/PATCH) and
// FormResponsesCabinet (GET aggregate + submissions).

import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { FieldDef, FormAggregate, FormDetail, FormSubmission } from './types';

const FORMS_BASE_KEY = ['workspace', 'forms'] as const;

// GET /v1/workspace/forms/:id
export function useFormDetail(id: string): UseQueryResult<{ form: FormDetail }, Error> {
  return useQuery<{ form: FormDetail }, Error>({
    queryKey: [...FORMS_BASE_KEY, 'detail', id] as const,
    queryFn: async () =>
      apiClient<{ form: FormDetail }>(`/v1/workspace/forms/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
  });
}

// PATCH /v1/workspace/forms/:id
export interface UpdateFormBody {
  title?: string;
  description?: string | null;
  status?: 'draft' | 'published' | 'archived';
  allow_anonymous?: boolean;
  schema?: { fields: FieldDef[] };
}

export function useUpdateForm(
  id: string,
): UseMutationResult<{ form: FormDetail }, Error, UpdateFormBody> {
  const qc = useQueryClient();
  return useMutation<{ form: FormDetail }, Error, UpdateFormBody>({
    mutationFn: async (body) =>
      apiClient<{ form: FormDetail }>(`/v1/workspace/forms/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...FORMS_BASE_KEY, 'detail', id] });
      void qc.invalidateQueries({ queryKey: [...FORMS_BASE_KEY, 'list'] });
    },
  });
}

// POST /v1/workspace/forms/:id/archive
export function useArchiveForm(id: string): UseMutationResult<{ form: FormDetail }, Error, void> {
  const qc = useQueryClient();
  return useMutation<{ form: FormDetail }, Error, void>({
    mutationFn: async () =>
      apiClient<{ form: FormDetail }>(`/v1/workspace/forms/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...FORMS_BASE_KEY, 'detail', id] });
      void qc.invalidateQueries({ queryKey: [...FORMS_BASE_KEY, 'list'] });
    },
  });
}

// GET /v1/workspace/forms/:id/aggregate
export function useFormAggregate(id: string): UseQueryResult<{ aggregate: FormAggregate }, Error> {
  return useQuery<{ aggregate: FormAggregate }, Error>({
    queryKey: [...FORMS_BASE_KEY, 'aggregate', id] as const,
    queryFn: async () =>
      apiClient<{ aggregate: FormAggregate }>(
        `/v1/workspace/forms/${encodeURIComponent(id)}/aggregate`,
      ),
    enabled: id.length > 0,
  });
}

// GET /v1/workspace/forms/:id/submissions
export function useFormSubmissions(
  id: string,
  limit = 500,
): UseQueryResult<{ submissions: FormSubmission[] }, Error> {
  return useQuery<{ submissions: FormSubmission[] }, Error>({
    queryKey: [...FORMS_BASE_KEY, 'submissions', id, limit] as const,
    queryFn: async () =>
      apiClient<{ submissions: FormSubmission[] }>(
        `/v1/workspace/forms/${encodeURIComponent(id)}/submissions?limit=${limit}`,
      ),
    enabled: id.length > 0,
  });
}
