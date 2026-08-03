// L3 block — <TopicInterests>.
//
// FR-NTF-005 — Topic interest selection for announcement gating.
//
// Fetches current interests from GET /v1/me/profile (includes interests[]),
// adds/removes via POST/DELETE /v1/me/profile/interests/:id. Topics are
// fetched from the global topics catalog (FR-EVT-007) and filtered by the
// user's country (directus_users.country FK).
//
// These interests gate fan-out announcements only — transactional messages
// (confirmations, reminders) are NOT affected.
//
// Wiring: docs/04-development/architecture/wiring-map.md → member_interests

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { type ReactElement } from 'react';

interface MemberInterest {
  id: string;
  topic_tag: string;
  intent: string;
}

interface Topic {
  id: string;
  name: string;
  slug: string;
}

interface ProfileResponse {
  profile: {
    id: string;
    country?: string | null;
  };
  interests: MemberInterest[];
}

async function fetchProfile(): Promise<ProfileResponse> {
  const res = await fetch('/v1/me/profile', {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

async function fetchTopics(_countryCode?: string | null): Promise<Topic[]> {
  // For now, return hardcoded topic list. In production, this would fetch from
  // /v1/topics?country={countryCode} (FR-EVT-007). The bot already has this
  // list wired via /interests command.
  const allTopics: Topic[] = [
    { id: '1', name: 'AI/ML', slug: 'ai-ml' },
    { id: '2', name: 'MLOps', slug: 'mlops' },
    { id: '3', name: 'Python', slug: 'python' },
    { id: '4', name: 'Computer Vision', slug: 'computer-vision' },
    { id: '5', name: 'NLP', slug: 'nlp' },
    { id: '6', name: 'FinTech', slug: 'fintech' },
    { id: '7', name: 'Healthcare AI', slug: 'healthcare-ai' },
    { id: '8', name: 'Governance', slug: 'governance' },
  ];
  // In production, filter by countryCode. For now, return all.
  return allTopics;
}

async function addInterest(topicTag: string): Promise<MemberInterest> {
  const res = await fetch('/v1/me/profile/interests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topic_tag: topicTag, intent: 'announcements' }),
  });
  if (!res.ok) throw new Error('Failed to add interest');
  const data = await res.json();
  return data.interest;
}

async function removeInterest(interestId: string): Promise<void> {
  const res = await fetch(`/v1/me/profile/interests/${interestId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });
  if (!res.ok) throw new Error('Failed to remove interest');
}

function TopicInterestsInner(): ReactElement {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const topicsQuery = useQuery({
    queryKey: ['topics', profileQuery.data?.profile.country],
    queryFn: () => fetchTopics(profileQuery.data?.profile.country),
    enabled: profileQuery.isSuccess,
  });

  const addMutation = useMutation({
    mutationFn: addInterest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeInterest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  if (profileQuery.isPending || topicsQuery.isPending) {
    return <p className="text-xs text-muted-foreground">Loading topics…</p>;
  }
  if (profileQuery.error || topicsQuery.error || !profileQuery.data || !topicsQuery.data) {
    return (
      <p className="text-xs text-destructive">Topics unavailable. Reload the page to retry.</p>
    );
  }

  const { interests } = profileQuery.data;
  const topics = topicsQuery.data;
  const interestTags = new Set(interests.map((i) => i.topic_tag));

  const onToggle = (topicSlug: string, isSelected: boolean): void => {
    if (isSelected) {
      const interest = interests.find((i) => i.topic_tag === topicSlug);
      if (interest) {
        removeMutation.mutate(interest.id);
      }
    } else {
      addMutation.mutate(topicSlug);
    }
  };

  const isPending = (topicSlug: string): boolean => {
    if (addMutation.isPending && addMutation.variables === topicSlug) return true;
    const interest = interests.find((i) => i.topic_tag === topicSlug);
    return removeMutation.isPending && removeMutation.variables === interest?.id;
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-foreground">Topic Interests</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Select topics you care about. Affects event announcements only — transactional messages
          (confirmations, reminders) are always sent.
        </p>
      </div>
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          {topics.map((topic) => {
            const isSelected = interestTags.has(topic.slug);
            const pending = isPending(topic.slug);
            return (
              <Button
                key={topic.id}
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => onToggle(topic.slug, isSelected)}
                disabled={pending}
                className="justify-start gap-2 h-auto py-2.5"
              >
                {isSelected && <Check className="w-4 h-4 shrink-0" />}
                <span className="text-sm">{pending ? '…' : topic.name}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TopicInterests(): ReactElement {
  return (
    <IslandRoot>
      <TopicInterestsInner />
    </IslandRoot>
  );
}

export default TopicInterests;
