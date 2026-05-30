// L1 hooks — /v1/workspace/announce (operator announcement composer).
//
// Backs the <AnnounceComposer> cabinet at /workspace/announce. M2.4-i
// ships the preview mutation; M2.4-ii will add the send mutation.

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { AnnouncePreview } from './types';

export interface PreviewAnnounceBody {
  cohortId: string;
  subject: string;
  body: string;
}

export function usePreviewAnnounce(): UseMutationResult<
  AnnouncePreview,
  Error,
  PreviewAnnounceBody
> {
  return useMutation<AnnouncePreview, Error, PreviewAnnounceBody>({
    mutationFn: async (body) => {
      return apiClient<AnnouncePreview>('/v1/workspace/announce/preview', {
        method: 'POST',
        // Same exactOptionalPropertyTypes cast as the other mutation
        // hooks — runtime JSON shape identical.
        body: body as unknown as Record<string, unknown>,
      });
    },
  });
}
