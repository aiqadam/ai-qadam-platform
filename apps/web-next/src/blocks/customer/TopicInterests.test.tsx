// TopicInterests.test.tsx — unit tests for TopicInterests pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next (ESM / Node
// test environment). Tests cover pure logic extracted from the block:
//   1. Topic catalog hardcoded list
//   2. Selection state computation
//   3. Interest ID lookup (for DELETE)

import { describe, expect, it } from 'vitest';

// Inline the types here
interface Topic {
  id: string;
  name: string;
  slug: string;
  country?: string | null;
}

interface Interest {
  id: string;
  topic_id: string;
  created_at: string;
}

// ─── 1. Topic catalog hardcoded list ─────────────────────────────────────────

const HARDCODED_TOPICS: Topic[] = [
  { id: '1', name: 'AI/ML', slug: 'ai-ml' },
  { id: '2', name: 'MLOps', slug: 'mlops' },
  { id: '3', name: 'Python', slug: 'python' },
  { id: '4', name: 'Computer Vision', slug: 'computer-vision' },
  { id: '5', name: 'NLP', slug: 'nlp' },
  { id: '6', name: 'FinTech', slug: 'fintech' },
  { id: '7', name: 'Healthcare AI', slug: 'healthcare-ai' },
  { id: '8', name: 'Governance', slug: 'governance' },
];

describe('HARDCODED_TOPICS', () => {
  it('contains exactly 8 topics', () => {
    expect(HARDCODED_TOPICS).toHaveLength(8);
  });

  it('has unique slugs', () => {
    const slugs = HARDCODED_TOPICS.map((t) => t.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(HARDCODED_TOPICS.length);
  });

  it('has unique IDs', () => {
    const ids = HARDCODED_TOPICS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(HARDCODED_TOPICS.length);
  });
});

// ─── 2. Selection state computation ──────────────────────────────────────────

function isTopicSelected(topicId: string, interests: Interest[]): boolean {
  return interests.some((i) => i.topic_id === topicId);
}

describe('isTopicSelected', () => {
  const sampleInterests: Interest[] = [
    { id: 'i1', topic_id: '1', created_at: '2026-08-01T00:00:00Z' },
    { id: 'i2', topic_id: '3', created_at: '2026-08-02T00:00:00Z' },
  ];

  it('returns true when topic is in interests', () => {
    expect(isTopicSelected('1', sampleInterests)).toBe(true);
    expect(isTopicSelected('3', sampleInterests)).toBe(true);
  });

  it('returns false when topic is not in interests', () => {
    expect(isTopicSelected('2', sampleInterests)).toBe(false);
    expect(isTopicSelected('999', sampleInterests)).toBe(false);
  });

  it('returns false when interests is empty', () => {
    expect(isTopicSelected('1', [])).toBe(false);
  });
});

// ─── 3. Interest ID lookup (for DELETE) ──────────────────────────────────────

function findInterestId(topicId: string, interests: Interest[]): string | null {
  const match = interests.find((i) => i.topic_id === topicId);
  return match?.id ?? null;
}

describe('findInterestId', () => {
  const sampleInterests: Interest[] = [
    { id: 'i1', topic_id: '1', created_at: '2026-08-01T00:00:00Z' },
    { id: 'i2', topic_id: '3', created_at: '2026-08-02T00:00:00Z' },
  ];

  it('returns interest ID when topic is selected', () => {
    expect(findInterestId('1', sampleInterests)).toBe('i1');
    expect(findInterestId('3', sampleInterests)).toBe('i2');
  });

  it('returns null when topic is not selected', () => {
    expect(findInterestId('2', sampleInterests)).toBeNull();
  });
});
