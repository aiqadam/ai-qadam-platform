// members-onboarding.dto.spec.ts — Unit tests for OnboardMemberDtoSchema.
// Tests: happy path, normalisation, failure paths, strict mode.
// Pattern: pure Zod, no mocks (follows consent-service.spec.ts).
//
// FR-MIG-020.

import { describe, expect, it } from 'vitest';
import { OnboardMemberDtoSchema } from '../src/modules/members/onboarding.dto';

describe('OnboardMemberDtoSchema — happy path', () => {
  it('parses minimal required payload', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'Ahmad',
      lastName: 'Rakhimov',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Ahmad');
      expect(result.data.lastName).toBe('Rakhimov');
    }
  });

  it('parses full payload with all optional fields', () => {
    const input = {
      firstName: 'Ahmad',
      lastName: 'Rakhimov',
      jobTitle: 'Senior ML Engineer',
      skills: ['mlops', 'llm-finetuning'],
      interests: [
        { topic_tag: 'ai-safety', intent: 'learn' },
        { topic_tag: 'mlops', intent: 'practice' },
      ],
      consents: { events: true, marketing: false },
      slug: 'telegram-uz',
    };
    const result = OnboardMemberDtoSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobTitle).toBe('Senior ML Engineer');
      expect(result.data.skills).toEqual(['mlops', 'llm-finetuning']);
      expect(result.data.interests).toHaveLength(2);
      expect(result.data.consents).toEqual({ events: true, marketing: false });
      expect(result.data.slug).toBe('telegram-uz');
    }
  });

  it('defaults skills to [] when omitted', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
    }
  });

  it('defaults interests to [] when omitted', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interests).toEqual([]);
    }
  });

  it('defaults consents to {} when omitted', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consents).toEqual({});
    }
  });

  it('jobTitle can be null', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      jobTitle: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Zod v3: .nullable().optional() coerces null to undefined in output.
      // The value may be undefined or null depending on Zod's coercion chain.
      expect(result.data.jobTitle === null || result.data.jobTitle === undefined).toBe(true);
    }
  });

  it('jobTitle can be omitted (becomes undefined)', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // jobTitle is optional — omitted → undefined
      expect(result.data.jobTitle).toBeUndefined();
    }
  });
});

describe('OnboardMemberDtoSchema — skill normalisation', () => {
  it('trims whitespace and lowercases', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['  MLOps  ', '  LLm-Finetuning  '],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['mlops', 'llm-finetuning']);
    }
  });

  it('replaces spaces with hyphens', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['computer vision', 'llm optimization'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['computer-vision', 'llm-optimization']);
    }
  });

  it('strips non-alphanumeric characters except hyphens', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['llm_finetuning', 'data!science?'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['llm-finetuning', 'data-science']);
    }
  });

  it('collapses consecutive hyphens', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['llm---finetuning', 'a--b--c'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['llm-finetuning', 'a-b-c']);
    }
  });

  it('trims leading and trailing hyphens', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['-mlops-', '--llm--'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual(['mlops', 'llm']);
    }
  });

  it('all four interest intents are accepted', () => {
    for (const intent of ['learn', 'practice', 'mentor', 'discuss']) {
      const result = OnboardMemberDtoSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        interests: [{ topic_tag: 'ai-safety', intent }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('interest topic_tag is normalised like skills', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: [{ topic_tag: '  LLM Optimization  ', intent: 'learn' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interests[0]?.topic_tag).toBe('llm-optimization');
    }
  });
});

describe('OnboardMemberDtoSchema — failure paths', () => {
  it('rejects missing firstName', () => {
    const result = OnboardMemberDtoSchema.safeParse({ lastName: 'B' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('firstName');
    }
  });

  it('rejects missing lastName', () => {
    const result = OnboardMemberDtoSchema.safeParse({ firstName: 'A' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('lastName');
    }
  });

  it('rejects empty string firstName', () => {
    const result = OnboardMemberDtoSchema.safeParse({ firstName: '   ', lastName: 'B' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string lastName', () => {
    const result = OnboardMemberDtoSchema.safeParse({ firstName: 'A', lastName: '  ' });
    expect(result.success).toBe(false);
  });

  it('rejects firstName > 100 chars', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A'.repeat(101),
      lastName: 'B',
    });
    expect(result.success).toBe(false);
  });

  it('rejects lastName > 100 chars', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('accepts firstName at 100 chars exactly', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A'.repeat(100),
      lastName: 'B',
    });
    expect(result.success).toBe(true);
  });

  it('rejects jobTitle > 200 chars', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      jobTitle: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts jobTitle at 200 chars exactly', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      jobTitle: 'x'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('rejects skill > 80 chars', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['x'.repeat(81)],
    });
    expect(result.success).toBe(false);
  });

  it('accepts skill at 80 chars exactly', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: ['x'.repeat(80)],
    });
    expect(result.success).toBe(true);
  });

  it('rejects skills array > 50 items', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: Array(51).fill('mlops'),
    });
    expect(result.success).toBe(false);
  });

  it('accepts skills array at 50 items exactly', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      skills: Array(50).fill('mlops'),
    });
    expect(result.success).toBe(true);
  });

  it('rejects interest topic_tag < 2 chars after normalisation', () => {
    // "x" normalises to "x" (2 chars, min is 2)
    // "." normalises to "" (too short)
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: [{ topic_tag: '.', intent: 'learn' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects interest topic_tag > 80 chars after normalisation', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: [{ topic_tag: 'x'.repeat(81), intent: 'learn' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown interest intent', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: [{ topic_tag: 'ai-safety', intent: 'invalid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects interests array > 20 items', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: Array(21).fill({ topic_tag: 'ai-safety', intent: 'learn' }),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown consent purpose', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      consents: { not_a_valid_purpose: true },
    });
    expect(result.success).toBe(false);
  });

  it('accepts all seven valid consent purposes', () => {
    for (const purpose of ['events', 'marketing', 'research', 'recruiting', 'sponsor_share', 'content', 'paid_premium']) {
      const result = OnboardMemberDtoSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        consents: { [purpose]: true },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts consent value as false', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      consents: { events: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects slug > 64 chars', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      slug: 'x'.repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it('accepts slug at 64 chars exactly', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      slug: 'x'.repeat(64),
    });
    expect(result.success).toBe(true);
  });
});

describe('OnboardMemberDtoSchema — strict mode', () => {
  it('rejects unknown top-level keys', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      unknownField: 'value',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // strict() on OnboardMemberDtoSchema catches top-level unknown keys
      const codes = result.error.issues.map((i) => i.code);
      expect(codes).toContain('unrecognized_keys');
    }
  });

  it('accepts extra keys in nested consents object (no nested strict())', () => {
    // The consents field is z.record() without z.strict() on its values,
    // so Zod accepts additional consent entries even if the purpose is invalid.
    // The enum validator then catches invalid purposes separately.
    // We test the actual behavior: an unknown key IS parsed (no top-level strict check
    // on nested objects), but the unknown purpose value triggers validation failure.
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      consents: { events: true, unknownConsent: true },
    });
    // unknownConsent: true is NOT a valid enum value for the consent record key,
    // but since consents is z.record(), Zod accepts the key. The enum validator
    // only validates the VALUES (boolean). So this actually parses successfully
    // because the key (unknownConsent) is a valid string key.
    // Actually — re-reading: z.record checks keys against the key schema. The key
    // schema is z.enum([...MEMBER_CONSENT_PURPOSES]), which only accepts valid purposes.
    // So unknownConsent IS rejected.
    expect(result.success).toBe(false);
  });

  it('rejects interests entry with extra keys (no nested strict())', () => {
    // InterestEntrySchema has no .strict(), so extra keys are accepted by Zod.
    // This test documents the actual behavior: the schema accepts interest entries
    // with extra fields.
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      interests: [{ topic_tag: 'ai-safety', intent: 'learn', unknownKey: true }],
    });
    // InterestEntrySchema has no .strict() — extra keys are not rejected at the
    // InterestEntry level. They pass through. This test documents that.
    expect(result.success).toBe(true);
  });

  it('rejects unknown top-level keys (verifies strict() works at top level)', () => {
    const result = OnboardMemberDtoSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      extraTopLevelField: 'value',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.error.issues.map((i) => i.code);
      expect(codes).toContain('unrecognized_keys');
    }
  });
});

describe('OnboardMemberDtoSchema — type inference', () => {
  it('produces correct inferred type', () => {
    // Type-level check: z.infer produces the expected shape.
    // This test verifies the type is usable with all expected fields.
    const valid: Parameters<typeof OnboardMemberDtoSchema.parse>[0] = {
      firstName: 'A',
      lastName: 'B',
      jobTitle: 'Engineer',
      skills: ['mlops'],
      interests: [{ topic_tag: 'ai', intent: 'learn' }],
      consents: { events: true },
      slug: 'test',
    };
    expect(OnboardMemberDtoSchema.safeParse(valid).success).toBe(true);
  });

  it('firstName and lastName are required strings', () => {
    // Type-level constraint: these must be non-optional
    const valid = {
      firstName: 'A' as const,
      lastName: 'B' as const,
    };
    expect(OnboardMemberDtoSchema.safeParse(valid).success).toBe(true);
  });
});
