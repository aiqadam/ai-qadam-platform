// L1 hooks — per-event Q&A forum.
//
// Backs <ForumThread> on /events/[id]. The page SSRs the initial
// question list via fetchEventQuestions() from cms.ts (Directus
// Public-policy read); the block seeds local state from that prop +
// uses usePostQuestion to append new questions on submit.
//
// Lives under `lib/use-*` per the convention from PR 1.4 so L3 blocks
// can import without tripping ADR-0038 §Locks #1 (which blocks
// runtime imports of `lib/api-*`).
//
// No useQuery here: the initial list arrives via props (SSR) so a
// client-side fetch on mount would be pure duplication. The mutation
// returns the created row, which the block prepends to its local
// list — no cache invalidation needed (no other consumers).

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { EventQuestion } from './types';

interface CreateQuestionResponse {
  id: string;
  eventId: string;
  parentQuestionId: string | null;
  questionText: string;
  createdAt: string;
}

export interface PostQuestionInput {
  questionText: string;
  parentQuestionId?: string;
}

export function usePostQuestion(
  eventId: string,
): UseMutationResult<EventQuestion, Error, PostQuestionInput> {
  return useMutation<EventQuestion, Error, PostQuestionInput>({
    mutationFn: async (input) => {
      // RegisterBody-style cast: apiClient's body type is
      // Record<string, unknown> but PostQuestionInput's optional
      // field doesn't satisfy the index signature under
      // exactOptionalPropertyTypes. Runtime JSON shape is identical.
      const created = await apiClient<CreateQuestionResponse>(
        `/v1/events/${encodeURIComponent(eventId)}/questions`,
        {
          method: 'POST',
          body: {
            questionText: input.questionText,
            ...(input.parentQuestionId ? { parentQuestionId: input.parentQuestionId } : {}),
          } as Record<string, unknown>,
        },
      );
      return {
        id: created.id,
        questionText: created.questionText,
        parentQuestionId: created.parentQuestionId,
        isPinned: false,
        isAnswered: false,
        createdAt: created.createdAt,
        author: { displayName: null, directusUserId: null },
      };
    },
  });
}
