// L1 hooks — /v1/workspace/forms (operator forms-library list).
//
// Backs the Forms cabinet at /workspace/forms. PR 2.7b ships the
// read-only list view with status + country filtering. Per-form
// detail page (builder + submissions inbox + aggregate) lands as
// separate PRs (2.10 family per migration plan).

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { WorkspaceFormRow } from './types';

const WORKSPACE_FORMS_BASE_KEY = ['workspace', 'forms'] as const;

export function useWorkspaceForms(): UseQueryResult<{ forms: WorkspaceFormRow[] }, Error> {
  return useQuery<{ forms: WorkspaceFormRow[] }, Error>({
    queryKey: [...WORKSPACE_FORMS_BASE_KEY, 'list'] as const,
    queryFn: async () => apiClient<{ forms: WorkspaceFormRow[] }>('/v1/workspace/forms'),
  });
}
