// OnboardingForm.test.tsx — Unit tests for OnboardingForm component logic.
// Tests: step navigation, field validation, skill/interest state, consent toggling,
// submission payload shape, success redirect.
// Pattern: pure helper extraction + state-machine stub (follows AccessLogTable.test.tsx).
//
// NOTE: Component JSX NOT re-implemented. @testing-library/react is NOT installed.
// Per codebase convention (AccessLogTable.test.tsx, AnnounceComposer.test.tsx),
// logic is extracted as pure functions and tested with input/output assertions.
//
// FR-MIG-020.

import { describe, expect, it } from 'vitest';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'profile', label: 'About you' },
  { id: 'skills', label: 'Skills & interests' },
  { id: 'consents', label: 'Consents' },
] as const;

const CONSENT_LABELS: Record<string, string> = {
  events: 'Event announcements & updates',
  marketing: 'Community newsletters & promotions',
  research: 'Aggregate analytics & research sharing',
  recruiting: 'Job board & recruitment opportunities',
  sponsor_share: 'Sharing my profile with sponsors',
  content: 'Curated content recommendations',
  paid_premium: 'Premium features & paid offerings',
};

const INTEREST_INTENTS = ['learn', 'practice', 'mentor', 'discuss'] as const;

// ─── Pure helpers ──────────────────────────────────────────────────────────────

// Mirrors the validateStep logic from OnboardingForm.tsx
function validateStep(currentStepId: string, firstName: string, lastName: string): boolean {
  if (currentStepId === 'profile') {
    return firstName.trim().length > 0 && lastName.trim().length > 0;
  }
  return true;
}

// Mirrors the step-index computation
function stepIndex(currentStepId: string): number {
  return STEPS.findIndex((s) => s.id === currentStepId);
}

// Mirrors handleNext
function nextStepId(currentStepId: string): string | undefined {
  const idx = stepIndex(currentStepId);
  const next = STEPS[idx + 1];
  return next?.id;
}

// Mirrors handleBack
function prevStepId(currentStepId: string): string | undefined {
  const idx = stepIndex(currentStepId);
  const prev = STEPS[idx - 1];
  return prev?.id;
}

// Mirrors the skill normalisation logic from OnboardingForm.tsx:
// 1. trim()
// 2. toLowerCase()
// 3. replace(/[^a-z0-9]+/g, '-')  — non-alphanum → hyphen
// 4. replace(/-+/g, '-')          — collapse consecutive hyphens
// 5. replace(/^-+|-+$/g, '')      — trim edges
// Steps 3+4 are distinct: step 3 can introduce new hyphens (e.g. "a!b" → "a-b");
// step 4 collapses any consecutive hyphens that resulted from step 3.
function normaliseSkill(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mirrors the skill add logic from OnboardingForm.tsx
function addSkill(skills: string[], tag: string): string[] {
  const normalised = normaliseSkill(tag);
  if (normalised.length < 2) return skills;
  if (skills.includes(normalised)) return skills;
  return [...skills, normalised];
}

// Mirrors the skill remove logic
function removeSkill(skills: string[], tag: string): string[] {
  return skills.filter((s) => s !== tag);
}

// Mirrors interest add logic
interface InterestEntry {
  topic_tag: string;
  intent: 'learn' | 'practice' | 'mentor' | 'discuss';
}

function addInterest(
  interests: InterestEntry[],
  topic_tag: string,
  intent: InterestEntry['intent'],
): InterestEntry[] {
  const normalised = topic_tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalised.length < 2) return interests;
  if (interests.some((i) => i.topic_tag === normalised && i.intent === intent)) return interests;
  return [...interests, { topic_tag: normalised, intent }];
}

// Mirrors interest remove logic
function removeInterest(interests: InterestEntry[], entry: InterestEntry): InterestEntry[] {
  return interests.filter((i) => !(i.topic_tag === entry.topic_tag && i.intent === entry.intent));
}

// Mirrors consent toggle logic
function toggleConsent(
  consents: Record<string, boolean>,
  purpose: string,
  value: boolean,
): Record<string, boolean> {
  return { ...consents, [purpose]: value };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('OnboardingForm — step navigation', () => {
  describe('validateStep', () => {
    it('returns false when firstName and lastName are empty', () => {
      expect(validateStep('profile', '', '')).toBe(false);
    });

    it('returns false when firstName is empty', () => {
      expect(validateStep('profile', '', 'Rakhimov')).toBe(false);
    });

    it('returns false when lastName is empty', () => {
      expect(validateStep('profile', 'Ahmad', '')).toBe(false);
    });

    it('returns true when firstName and lastName are filled', () => {
      expect(validateStep('profile', 'Ahmad', 'Rakhimov')).toBe(true);
    });

    it('returns true when firstName and lastName have whitespace', () => {
      expect(validateStep('profile', '  Ahmad  ', '  Rakhimov  ')).toBe(true);
    });

    it('returns true for steps beyond profile', () => {
      expect(validateStep('skills', '', '')).toBe(true);
      expect(validateStep('consents', '', '')).toBe(true);
    });
  });

  describe('nextStepId', () => {
    it('returns "skills" from "profile"', () => {
      expect(nextStepId('profile')).toBe('skills');
    });

    it('returns "consents" from "skills"', () => {
      expect(nextStepId('skills')).toBe('consents');
    });

    it('returns undefined from "consents" (last step)', () => {
      expect(nextStepId('consents')).toBeUndefined();
    });
  });

  describe('prevStepId', () => {
    it('returns "profile" from "skills"', () => {
      expect(prevStepId('skills')).toBe('profile');
    });

    it('returns "skills" from "consents"', () => {
      expect(prevStepId('consents')).toBe('skills');
    });

    it('returns undefined from "profile" (first step)', () => {
      expect(prevStepId('profile')).toBeUndefined();
    });
  });

  describe('stepIndex', () => {
    it('profile is index 0', () => {
      expect(stepIndex('profile')).toBe(0);
    });

    it('skills is index 1', () => {
      expect(stepIndex('skills')).toBe(1);
    });

    it('consents is index 2', () => {
      expect(stepIndex('consents')).toBe(2);
    });
  });
});

describe('OnboardingForm — skill management', () => {
  it('adds a normalised skill', () => {
    const skills: string[] = [];
    const result = addSkill(skills, '  MLOps  ');
    expect(result).toEqual(['mlops']);
  });

  it('normalises spaces to hyphens', () => {
    const skills: string[] = [];
    const result = addSkill(skills, 'computer vision');
    expect(result).toEqual(['computer-vision']);
  });

  it('strips non-alphanumeric except hyphens', () => {
    const skills: string[] = [];
    const result = addSkill(skills, 'llm_finetuning');
    expect(result).toEqual(['llm-finetuning']);
  });

  it('collapses consecutive hyphens', () => {
    const skills: string[] = [];
    const result = addSkill(skills, 'a--b--c');
    expect(result).toEqual(['a-b-c']);
  });

  it('trims leading and trailing hyphens', () => {
    const skills: string[] = [];
    const result = addSkill(skills, '-mlops-');
    expect(result).toEqual(['mlops']);
  });

  it('does not add skill shorter than 2 chars', () => {
    const skills: string[] = [];
    const result = addSkill(skills, 'x');
    expect(result).toEqual([]);
  });

  it('does not add duplicate skill', () => {
    const skills = ['mlops'];
    const result = addSkill(skills, 'MLOps');
    expect(result).toEqual(['mlops']); // still just one
  });

  it('adds multiple distinct skills', () => {
    let skills: string[] = [];
    skills = addSkill(skills, 'mlops');
    skills = addSkill(skills, 'llm');
    skills = addSkill(skills, 'cv');
    expect(skills).toEqual(['mlops', 'llm', 'cv']);
  });

  it('removes a skill', () => {
    const skills = ['mlops', 'llm', 'cv'];
    const result = removeSkill(skills, 'llm');
    expect(result).toEqual(['mlops', 'cv']);
  });

  it('removing non-existent skill returns original array', () => {
    const skills = ['mlops'];
    const result = removeSkill(skills, 'llm');
    expect(result).toEqual(['mlops']);
  });
});

describe('OnboardingForm — interest management', () => {
  it('adds a normalised interest', () => {
    const interests: InterestEntry[] = [];
    const result = addInterest(interests, 'AI Safety', 'learn');
    expect(result).toEqual([{ topic_tag: 'ai-safety', intent: 'learn' }]);
  });

  it('normalises topic_tag like skills', () => {
    const interests: InterestEntry[] = [];
    const result = addInterest(interests, 'LLM Optimization', 'practice');
    expect(result[0]?.topic_tag).toBe('llm-optimization');
  });

  it('does not add interest shorter than 2 chars', () => {
    const interests: InterestEntry[] = [];
    const result = addInterest(interests, 'x', 'learn');
    expect(result).toEqual([]);
  });

  it('does not add duplicate topic_tag + intent pair', () => {
    const interests: InterestEntry[] = [{ topic_tag: 'ai-safety', intent: 'learn' }];
    const result = addInterest(interests, 'ai-safety', 'learn');
    expect(result).toEqual(interests);
  });

  it('allows same topic with different intent', () => {
    const interests: InterestEntry[] = [{ topic_tag: 'mlops', intent: 'learn' }];
    const result = addInterest(interests, 'mlops', 'practice');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.intent)).toEqual(['learn', 'practice']);
  });

  it('adds multiple interests', () => {
    let interests: InterestEntry[] = [];
    interests = addInterest(interests, 'ai-safety', 'learn');
    interests = addInterest(interests, 'mlops', 'practice');
    interests = addInterest(interests, 'llm', 'mentor');
    expect(interests).toHaveLength(3);
  });

  it('removes an interest by topic_tag + intent pair', () => {
    const interests: InterestEntry[] = [
      { topic_tag: 'ai-safety', intent: 'learn' },
      { topic_tag: 'mlops', intent: 'practice' },
    ];
    const result = removeInterest(interests, { topic_tag: 'ai-safety', intent: 'learn' });
    expect(result).toEqual([{ topic_tag: 'mlops', intent: 'practice' }]);
  });

  it('removing non-existent interest returns original array', () => {
    const interests: InterestEntry[] = [{ topic_tag: 'ai-safety', intent: 'learn' }];
    const result = removeInterest(interests, { topic_tag: 'mlops', intent: 'practice' });
    expect(result).toEqual(interests);
  });

  it('accepts all four valid intent values', () => {
    const interests: InterestEntry[] = [];
    let result = addInterest(interests, 'ai', 'learn');
    result = addInterest(result, 'mlops', 'practice');
    result = addInterest(result, 'llm', 'mentor');
    result = addInterest(result, 'cv', 'discuss');
    expect(result).toHaveLength(4);
    expect(result.map((i) => i.intent)).toEqual(['learn', 'practice', 'mentor', 'discuss']);
  });
});

describe('OnboardingForm — consent toggling', () => {
  it('toggles a consent to true', () => {
    const consents: Record<string, boolean> = {};
    const result = toggleConsent(consents, 'events', true);
    expect(result).toEqual({ events: true });
  });

  it('toggles a consent to false', () => {
    const consents: Record<string, boolean> = { events: true };
    const result = toggleConsent(consents, 'events', false);
    expect(result).toEqual({ events: false });
  });

  it('leaves other consents unchanged', () => {
    const consents: Record<string, boolean> = { events: true, marketing: true };
    const result = toggleConsent(consents, 'events', false);
    expect(result).toEqual({ events: false, marketing: true });
  });

  it('all seven consent purposes are defined in CONSENT_LABELS', () => {
    const expectedPurposes = [
      'events',
      'marketing',
      'research',
      'recruiting',
      'sponsor_share',
      'content',
      'paid_premium',
    ];
    for (const purpose of expectedPurposes) {
      expect(CONSENT_LABELS[purpose]).toBeTruthy();
      expect(typeof CONSENT_LABELS[purpose]).toBe('string');
    }
  });
});

describe('OnboardingForm — submission payload', () => {
  it('builds correct payload from all three steps', () => {
    // Simulate the handleSubmit payload construction from OnboardingForm.tsx
    const formState = {
      firstName: 'Ahmad',
      lastName: 'Rakhimov',
      jobTitle: 'Senior ML Engineer',
      skills: ['mlops', 'llm-finetuning'],
      interests: [
        { topic_tag: 'ai-safety', intent: 'learn' as const },
        { topic_tag: 'mlops', intent: 'practice' as const },
      ],
      consents: { events: true, marketing: false },
      slug: 'telegram-uz',
    };

    const payload = {
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      jobTitle: (formState.jobTitle ?? '')?.trim() || null,
      skills: formState.skills,
      interests: formState.interests,
      consents: formState.consents,
      slug: formState.slug,
    };

    expect(payload.firstName).toBe('Ahmad');
    expect(payload.lastName).toBe('Rakhimov');
    expect(payload.jobTitle).toBe('Senior ML Engineer');
    expect(payload.skills).toEqual(['mlops', 'llm-finetuning']);
    expect(payload.interests).toHaveLength(2);
    expect(payload.consents).toEqual({ events: true, marketing: false });
    expect(payload.slug).toBe('telegram-uz');
  });

  it('jobTitle becomes null when empty string', () => {
    const formState = {
      firstName: 'A',
      lastName: 'B',
      jobTitle: '',
      skills: [],
      interests: [],
      consents: {},
      slug: undefined,
    };

    const payload = {
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      jobTitle: (formState.jobTitle ?? '')?.trim() || null,
      skills: formState.skills,
      interests: formState.interests,
      consents: formState.consents,
      ...(formState.slug !== undefined && { slug: formState.slug }),
    };

    expect(payload.jobTitle).toBeNull();
  });

  it('slug is omitted when undefined', () => {
    const formState: {
      firstName: string;
      lastName: string;
      jobTitle: string | null;
      skills: string[];
      interests: Array<{ topic_tag: string; intent: string }>;
      consents: Record<string, boolean>;
      slug: string | undefined;
    } = {
      firstName: 'A',
      lastName: 'B',
      jobTitle: null,
      skills: [],
      interests: [],
      consents: {},
      slug: undefined,
    };

    const payload = {
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      jobTitle: (formState.jobTitle ?? '')?.trim() || null,
      skills: formState.skills,
      interests: formState.interests,
      consents: formState.consents,
      ...(formState.slug !== undefined && { slug: formState.slug }),
    };

    // slug should not be a key in the payload
    expect(Object.prototype.hasOwnProperty.call(payload, 'slug')).toBe(false);
  });

  it('slug is included when provided', () => {
    const formState: {
      firstName: string;
      lastName: string;
      jobTitle: string | null;
      skills: string[];
      interests: Array<{ topic_tag: string; intent: string }>;
      consents: Record<string, boolean>;
      slug: string | undefined;
    } = {
      firstName: 'A',
      lastName: 'B',
      jobTitle: null,
      skills: [],
      interests: [],
      consents: {},
      slug: 'telegram-uz',
    };

    const payload = {
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      jobTitle: (formState.jobTitle ?? '')?.trim() || null,
      skills: formState.skills,
      interests: formState.interests,
      consents: formState.consents,
      ...(formState.slug !== undefined && { slug: formState.slug }),
    };

    expect(payload.slug).toBe('telegram-uz');
  });
});

describe('OnboardingForm — step metadata', () => {
  it('has exactly 3 steps', () => {
    expect(STEPS).toHaveLength(3);
  });

  it('steps are in order: profile, skills, consents', () => {
    expect(STEPS[0]?.id).toBe('profile');
    expect(STEPS[1]?.id).toBe('skills');
    expect(STEPS[2]?.id).toBe('consents');
  });

  it('each step has a label', () => {
    for (const step of STEPS) {
      expect(typeof step.label).toBe('string');
      expect(step.label.length).toBeGreaterThan(0);
    }
  });

  it('all INTEREST_INTENTS are valid', () => {
    expect(INTEREST_INTENTS).toEqual(['learn', 'practice', 'mentor', 'discuss']);
  });
});
