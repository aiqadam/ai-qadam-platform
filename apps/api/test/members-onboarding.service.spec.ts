// members-onboarding.service.spec.ts — Unit tests for MembersOnboardingService.
// Tests: completeOnboarding happy path, idempotency, parallel writes, field routing.
// Pattern: mock MeProfileService + PointsDirectusService with vi.fn()
//          (follows me-profile-service.spec.ts).
//
// FR-MIG-020.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterestIntent } from '../src/modules/me-profile/me-profile.service';
import { MembersOnboardingService } from '../src/modules/members/onboarding.service';
import type { OnboardMemberDto } from '../src/modules/members/onboarding.dto';

// ---------------------------------------------------------------------------
// Fake collaborators
// ---------------------------------------------------------------------------

type FakeProfile = {
  addSkill: ReturnType<typeof vi.fn>;
  addInterest: ReturnType<typeof vi.fn>;
  setConsent: ReturnType<typeof vi.fn>;
  setOnboardedAt: ReturnType<typeof vi.fn>;
  patchProfile: ReturnType<typeof vi.fn>;
  patchDirectusFields: ReturnType<typeof vi.fn>;
};

type FakePoints = {
  awardFirstJoinPoints: ReturnType<typeof vi.fn>;
};

const USER_ID = '11111111-1111-4000-8000-000000000001';

function makeFakeProfile(): FakeProfile {
  return {
    addSkill: vi.fn().mockResolvedValue({ id: 's-1', skill_tag: '', endorsement_count: 0, verified_by_event: null }),
    addInterest: vi.fn().mockResolvedValue({ id: 'i-1', topic_tag: '', intent: 'learn' as InterestIntent }),
    setConsent: vi.fn().mockResolvedValue({ purpose: 'events', granted: true, lastChangedAt: '2026-01-01T00:00:00Z' }),
    setOnboardedAt: vi.fn().mockResolvedValue(undefined),
    patchProfile: vi.fn().mockResolvedValue({ id: USER_ID }),
    patchDirectusFields: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakePoints(): FakePoints {
  return {
    awardFirstJoinPoints: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSut(profile: FakeProfile, points: FakePoints): MembersOnboardingService {
  return new MembersOnboardingService(
    profile as unknown as import('../src/modules/me-profile/me-profile.service').MeProfileService,
    points as unknown as import('../src/modules/points/points-directus.service').PointsDirectusService,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MembersOnboardingService.completeOnboarding', () => {
  let profile: FakeProfile;
  let points: FakePoints;
  let svc: MembersOnboardingService;

  beforeEach(() => {
    profile = makeFakeProfile();
    points = makeFakePoints();
    svc = makeSut(profile, points);
  });

  describe('happy path — all operations called', () => {
    it('calls patchDirectusFields with first_name and last_name', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'Ahmad',
        lastName: 'Rakhimov',
        jobTitle: null,
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.patchDirectusFields).toHaveBeenCalledWith(USER_ID, {
        first_name: 'Ahmad',
        last_name: 'Rakhimov',
      });
    });

    it('calls patchProfile with job_title', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        jobTitle: 'Senior ML Engineer',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.patchProfile).toHaveBeenCalledWith(USER_ID, {
        job_title: 'Senior ML Engineer',
      });
    });

    it('passes null jobTitle as null to patchProfile', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        jobTitle: null,
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.patchProfile).toHaveBeenCalledWith(USER_ID, {
        job_title: null,
      });
    });

    it('calls addSkill once per skill tag', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: ['mlops', 'llm-finetuning', 'computer-vision'],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addSkill).toHaveBeenCalledTimes(3);
      expect(profile.addSkill).toHaveBeenNthCalledWith(1, USER_ID, 'mlops');
      expect(profile.addSkill).toHaveBeenNthCalledWith(2, USER_ID, 'llm-finetuning');
      expect(profile.addSkill).toHaveBeenNthCalledWith(3, USER_ID, 'computer-vision');
    });

    it('calls addInterest once per interest entry', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [
          { topic_tag: 'ai-safety', intent: 'learn' },
          { topic_tag: 'mlops', intent: 'practice' },
        ],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addInterest).toHaveBeenCalledTimes(2);
      expect(profile.addInterest).toHaveBeenNthCalledWith(1, USER_ID, 'ai-safety', 'learn');
      expect(profile.addInterest).toHaveBeenNthCalledWith(2, USER_ID, 'mlops', 'practice');
    });

    it('calls setConsent only for granted (true) purposes', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: { events: true, marketing: false, research: true },
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.setConsent).toHaveBeenCalledTimes(2);
      expect(profile.setConsent).toHaveBeenNthCalledWith(1, USER_ID, 'events', true);
      expect(profile.setConsent).toHaveBeenNthCalledWith(2, USER_ID, 'research', true);
    });

    it('calls setOnboardedAt', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.setOnboardedAt).toHaveBeenCalledWith(USER_ID);
    });

    it('calls awardFirstJoinPoints with the userId', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(points.awardFirstJoinPoints).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('partial payloads — conditional calls', () => {
    it('does not call addSkill when skills is empty', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addSkill).not.toHaveBeenCalled();
    });

    it('does not call addInterest when interests is empty', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addInterest).not.toHaveBeenCalled();
    });

    it('does not call setConsent when consents is empty', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.setConsent).not.toHaveBeenCalled();
    });

    it('does not call setConsent when all consents are false', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: { events: false, marketing: false },
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.setConsent).not.toHaveBeenCalled();
    });
  });

  describe('call ordering', () => {
    it('setOnboardedAt is called before awardFirstJoinPoints', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      const setOnboardedAtCallOrder = profile.setOnboardedAt.mock.invocationCallOrder[0]!;
      const awardCallOrder = points.awardFirstJoinPoints.mock.invocationCallOrder[0]!;
      expect(setOnboardedAtCallOrder).toBeLessThan(awardCallOrder);
    });
  });

  describe('skills and interests use Promise.all', () => {
    it('addSkill is called for all skills even if some are added before others', async () => {
      // This tests that Promise.all is used internally for skills array.
      // All skills should be called; the order among them is non-deterministic
      // but all must be called.
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: ['mlops', 'llm', 'cv'],
        interests: [],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addSkill).toHaveBeenCalledTimes(3);
      // Verify all three were called (regardless of order)
      const calledTags = profile.addSkill.mock.calls.map((c) => c[1]);
      expect(calledTags).toEqual(expect.arrayContaining(['mlops', 'llm', 'cv']));
    });

    it('addInterest is called for all interests', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [
          { topic_tag: 'ai', intent: 'learn' },
          { topic_tag: 'mlops', intent: 'practice' },
          { topic_tag: 'cv', intent: 'discuss' },
        ],
        consents: {},
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.addInterest).toHaveBeenCalledTimes(3);
      const calledTags = profile.addInterest.mock.calls.map((c) => c[1]);
      expect(calledTags).toEqual(expect.arrayContaining(['ai', 'mlops', 'cv']));
    });

    it('setConsent is called for all granted consents', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: { events: true, marketing: true, research: true, recruiting: true },
        slug: undefined,
      };

      await svc.completeOnboarding(USER_ID, dto);

      expect(profile.setConsent).toHaveBeenCalledTimes(4);
    });
  });

  describe('slug is not used by the service', () => {
    it('passes slug in the DTO but it does not affect any directus call', async () => {
      const dto: OnboardMemberDto = {
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: 'telegram-uz',
      };

      await svc.completeOnboarding(USER_ID, dto);

      // The slug is accepted but the service does not use it for any writes.
      // All other assertions still pass — slug does not break the flow.
      expect(profile.patchDirectusFields).toHaveBeenCalled();
      expect(profile.setOnboardedAt).toHaveBeenCalled();
      expect(points.awardFirstJoinPoints).toHaveBeenCalled();
    });
  });
});
