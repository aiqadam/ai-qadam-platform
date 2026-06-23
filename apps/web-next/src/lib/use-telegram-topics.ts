// L1 hooks — /v1/telegram/event-topics.
//
// Backs the CriteriaBuilder segment editor with topic selection.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';

interface EventTopic {
  slug: string;
  label: string;
  icon: string | null;
}

const TOPICS_KEY = ['telegram', 'event-topics'] as const;

export function useEventTopics(): UseQueryResult<{ items: EventTopic[] }, Error> {
  return useQuery<{ items: EventTopic[] }, Error>({
    queryKey: TOPICS_KEY,
    queryFn: () => apiClient<{ items: EventTopic[] }>('/v1/telegram/event-topics'),
  });
}
