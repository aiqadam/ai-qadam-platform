// L1 hooks — /v1/workspace/announce (operator announcement composer).
//
// Backs the <AnnounceComposer> cabinet at /workspace/announce. M2.4-i
// shipped the preview mutation; M2.4-ii adds the send mutation.

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { AnnouncePreview, AnnounceSent } from './types';

export interface PreviewAnnounceBody {
  cohortId: string;
  subject: string;
  body: string;
}

export type ConsentBasis = 'explicit_opt_in' | 'operational_contract';

export interface SendAnnounceBody extends PreviewAnnounceBody {
  consentBasis: ConsentBasis;
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

export function useSendAnnounce(): UseMutationResult<AnnounceSent, Error, SendAnnounceBody> {
  return useMutation<AnnounceSent, Error, SendAnnounceBody>({
    mutationFn: async (body) => {
      return apiClient<AnnounceSent>('/v1/workspace/announce', {
        method: 'POST',
        body: body as unknown as Record<string, unknown>,
      });
    },
  });
}
