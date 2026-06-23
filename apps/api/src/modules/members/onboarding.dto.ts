// Zod schemas for /v1/members/onboard (FR-MIG-020).
//
// Input DTO for POST /v1/members/onboard.

import { z } from 'zod';
import {
  INTEREST_INTENTS,
  type InterestIntent,
  MEMBER_CONSENT_PURPOSES,
  type MemberConsentPurpose,
} from '../me-profile/me-profile.service';

export type { MemberConsentPurpose };

export const InterestIntentSchema = z.enum([...INTEREST_INTENTS] as [
  InterestIntent,
  ...InterestIntent[],
]);

export const InterestEntrySchema = z.object({
  topic_tag: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .transform((s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
    ),
  intent: InterestIntentSchema,
});

export const OnboardMemberDtoSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    jobTitle: z.string().trim().max(200).nullable().optional(),
    skills: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(80)
          .transform((s) =>
            s
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, ''),
          ),
      )
      .max(50)
      .default([]),
    interests: z.array(InterestEntrySchema).max(20).default([]),
    consents: z
      .record(
        z.enum([...MEMBER_CONSENT_PURPOSES] as [MemberConsentPurpose, ...MemberConsentPurpose[]]),
        z.boolean(),
      )
      .optional()
      .default({}),
    slug: z.string().trim().max(64).optional(),
  })
  .strict();

export type OnboardMemberDto = z.infer<typeof OnboardMemberDtoSchema>;
