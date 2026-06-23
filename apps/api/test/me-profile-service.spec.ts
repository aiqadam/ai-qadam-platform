import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { MeProfileService } from '../src/modules/me-profile/me-profile.service';

// F-S3.6b — interests + employments coverage. F-S3.6 v1 (#171) shipped
// the service without unit tests; these focus on the new paths +
// dedupe/owned-check invariants that share the same shape.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: MeProfileService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new MeProfileService(dx as unknown as DirectusClient);
});

describe('MeProfileService.addInterest', () => {
  it('inserts when no duplicate exists', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    dx.post.mockResolvedValueOnce({
      data: { id: 'i-1', topic_tag: 'computer-vision', intent: 'learn' },
    });

    const result = await svc.addInterest('u-1', 'computer-vision', 'learn');

    expect(result).toEqual({ id: 'i-1', topic_tag: 'computer-vision', intent: 'learn' });
    expect(dx.post.mock.calls[0]?.[0]).toBe('/items/member_interests');
  });

  it('dedupes on (member, topic_tag, intent) — returns existing', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'i-existing', topic_tag: 'mlops', intent: 'practice' }],
    });

    const result = await svc.addInterest('u-1', 'mlops', 'practice');

    expect(result.id).toBe('i-existing');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('allows different intent on the same topic', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'i-learn', topic_tag: 'mlops', intent: 'learn' }],
    });
    dx.post.mockResolvedValueOnce({
      data: { id: 'i-mentor', topic_tag: 'mlops', intent: 'mentor' },
    });

    const result = await svc.addInterest('u-1', 'mlops', 'mentor');
    expect(result.id).toBe('i-mentor');
  });
});

describe('MeProfileService.removeInterest', () => {
  it('rejects when row does not belong to user', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await expect(svc.removeInterest('u-1', 'i-other')).rejects.toThrow(/not found/);
    expect(dx.delete).not.toHaveBeenCalled();
  });

  it('deletes when owned', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'i-mine' }] });
    dx.delete.mockResolvedValueOnce({});
    await svc.removeInterest('u-1', 'i-mine');
    expect(dx.delete.mock.calls[0]?.[0]).toBe('/items/member_interests/i-mine');
  });
});

describe('MeProfileService.addEmployment', () => {
  it('creates the company when one with the same slug does not exist', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // findOrCreateEmployer lookup
      .mockResolvedValueOnce({
        data: [
          {
            id: 'emp-1',
            role: 'Engineer',
            started_at: '2024-01-01',
            ended_at: null,
            is_current: true,
            share_with_sponsors: false,
            employer: { id: 'co-1', name: 'Acme Robotics', slug: 'acme-robotics' },
          },
        ],
      });
    dx.post
      .mockResolvedValueOnce({
        data: { id: 'co-1', name: 'Acme Robotics', slug: 'acme-robotics' },
      })
      .mockResolvedValueOnce({ data: { id: 'emp-1' } });

    const result = await svc.addEmployment('u-1', {
      employer_name: 'Acme Robotics',
      role: 'Engineer',
      is_current: true,
    });

    expect(result.employer.slug).toBe('acme-robotics');
    expect(result.is_current).toBe(true);
    const companyInsert = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(companyInsert.slug).toBe('acme-robotics');
    expect(companyInsert.is_employer).toBe(true);
    expect(companyInsert.status).toBe('pending');
  });

  it('reuses an existing company on a slug match (case + whitespace tolerant)', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [{ id: 'co-existing', name: 'Acme Robotics', slug: 'acme-robotics' }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'emp-2',
            role: null,
            started_at: null,
            ended_at: null,
            is_current: false,
            share_with_sponsors: false,
            employer: { id: 'co-existing', name: 'Acme Robotics', slug: 'acme-robotics' },
          },
        ],
      });
    dx.post.mockResolvedValueOnce({ data: { id: 'emp-2' } });

    const result = await svc.addEmployment('u-1', { employer_name: '  ACME   Robotics  ' });

    expect(result.employer.id).toBe('co-existing');
    // Only one post → the employment insert (no company POST)
    expect(dx.post).toHaveBeenCalledTimes(1);
  });

  it('rejects when employer_name is empty/whitespace', async () => {
    await expect(svc.addEmployment('u-1', { employer_name: '   ' })).rejects.toThrow(
      /employer name required/,
    );
  });
});

describe('MeProfileService.removeEmployment', () => {
  it('rejects when not owned', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await expect(svc.removeEmployment('u-1', 'emp-other')).rejects.toThrow(/not found/);
  });

  it('deletes when owned', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'emp-mine' }] });
    dx.delete.mockResolvedValueOnce({});
    await svc.removeEmployment('u-1', 'emp-mine');
    expect(dx.delete.mock.calls[0]?.[0]).toBe('/items/member_employments/emp-mine');
  });
});

// F-S5.6 — visibility preference round-trip on getProfile + patchProfile.
describe('MeProfileService — F-S5.6 visibility fields', () => {
  const baseRow = {
    id: 'u-1',
    email: 'u@example.com',
    first_name: 'A',
    last_name: 'B',
    job_title: null,
    seniority: null,
    industry_tags: null,
    is_student: false,
    bio_md: null,
    appear_in_directory: false,
    appear_in_matches: true,
  };

  it('getProfile applies schema-aligned defaults when the new columns are null', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        ...baseRow,
        appear_on_attendee_list: null,
        appear_on_public_leaderboard: null,
        show_company_on_public_profile: null,
      },
    });
    const p = await svc.getProfile('u-1');
    expect(p.appear_on_attendee_list).toBe(true); // default ON
    expect(p.appear_on_public_leaderboard).toBe(true); // default ON
    expect(p.show_company_on_public_profile).toBe(false); // default OFF (privacy-first)
  });

  it('getProfile returns stored values when the columns are populated', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        ...baseRow,
        appear_on_attendee_list: false,
        appear_on_public_leaderboard: false,
        show_company_on_public_profile: true,
      },
    });
    const p = await svc.getProfile('u-1');
    expect(p.appear_on_attendee_list).toBe(false);
    expect(p.appear_on_public_leaderboard).toBe(false);
    expect(p.show_company_on_public_profile).toBe(true);
  });

  it('patchProfile forwards only the new visibility fields when only those are set', async () => {
    // patchProfile re-fetches after writing; queue the GET response too.
    dx.patch.mockResolvedValueOnce({});
    dx.get.mockResolvedValueOnce({
      data: {
        ...baseRow,
        appear_on_attendee_list: false,
        appear_on_public_leaderboard: true,
        show_company_on_public_profile: true,
      },
    });
    const p = await svc.patchProfile('u-1', {
      appear_on_attendee_list: false,
      show_company_on_public_profile: true,
    });
    const patchBody = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody).toEqual({
      appear_on_attendee_list: false,
      show_company_on_public_profile: true,
    });
    expect(p.appear_on_attendee_list).toBe(false);
    expect(p.show_company_on_public_profile).toBe(true);
  });

  it('PROFILE_FIELDS includes the three new columns in the GET request', async () => {
    dx.get.mockResolvedValueOnce({ data: baseRow });
    await svc.getProfile('u-1');
    const url = dx.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('appear_on_attendee_list');
    expect(url).toContain('appear_on_public_leaderboard');
    expect(url).toContain('show_company_on_public_profile');
  });
});

// FR-MIG-020 — onboarding: getOnboardedAt / setOnboardedAt
describe('MeProfileService.getOnboardedAt', () => {
  it('returns the ISO timestamp string when onboarded_at is set', async () => {
    dx.get.mockResolvedValueOnce({
      data: { onboarded_at: '2026-01-01T00:00:00Z' },
    });

    const result = await svc.getOnboardedAt('u-1');

    expect(result).toBe('2026-01-01T00:00:00Z');
  });

  it('returns null when onboarded_at field is null', async () => {
    dx.get.mockResolvedValueOnce({
      data: { onboarded_at: null },
    });

    const result = await svc.getOnboardedAt('u-1');

    expect(result).toBeNull();
  });

  it('returns null when the user row does not exist', async () => {
    dx.get.mockResolvedValueOnce({ data: null });

    const result = await svc.getOnboardedAt('u-nonexistent');

    expect(result).toBeNull();
  });

  it('queries directus with the userId and onboarded_at field', async () => {
    dx.get.mockResolvedValueOnce({ data: { onboarded_at: null } });

    await svc.getOnboardedAt('u-123');

    const url = dx.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/users/');
    expect(url).toContain('fields=onboarded_at');
  });
});

describe('MeProfileService.setOnboardedAt', () => {
  it('PATCHes directus_users with onboarded_at set to current ISO timestamp', async () => {
    dx.patch.mockResolvedValueOnce({});

    await svc.setOnboardedAt('u-1');

    expect(dx.patch).toHaveBeenCalledTimes(1);
    const call = dx.patch.mock.calls[0];
    expect(call?.[0]).toBe('/users/u-1');
    const body = call?.[1] as Record<string, unknown>;
    expect(body).toHaveProperty('onboarded_at');
    // Verify it's an ISO-8601 timestamp ending with Z
    const ts = body.onboarded_at as string;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it('calls patch with the correct userId', async () => {
    dx.patch.mockResolvedValueOnce({});

    await svc.setOnboardedAt('11111111-1111-4000-8000-000000000001');

    expect(dx.patch.mock.calls[0]?.[0]).toContain(
      '11111111-1111-4000-8000-000000000001',
    );
  });
});

// FR-MIG-020 — onboarding: PROFILE_FIELDS includes onboarded_at
describe('MeProfileService — onboarded_at in PROFILE_FIELDS', () => {
  it('getProfile includes onboarded_at in the fields query', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        id: 'u-1',
        email: 'a@b.com',
        first_name: null,
        last_name: null,
        job_title: null,
        seniority: null,
        industry_tags: null,
        is_student: false,
        bio_md: null,
        appear_in_directory: false,
        appear_in_matches: true,
        appear_on_attendee_list: true,
        appear_on_public_leaderboard: true,
        show_company_on_public_profile: false,
        onboarded_at: null,
      },
    });

    await svc.getProfile('u-1');

    const url = dx.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('onboarded_at');
  });

  it('toProfile passes through onboarded_at as-is', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        id: 'u-1',
        email: 'a@b.com',
        first_name: null,
        last_name: null,
        job_title: null,
        seniority: null,
        industry_tags: null,
        is_student: false,
        bio_md: null,
        appear_in_directory: false,
        appear_in_matches: true,
        appear_on_attendee_list: true,
        appear_on_public_leaderboard: true,
        show_company_on_public_profile: false,
        onboarded_at: '2026-06-20T12:00:00Z',
      },
    });

    const profile = await svc.getProfile('u-1');

    expect(profile.onboarded_at).toBe('2026-06-20T12:00:00Z');
  });

  it('toProfile defaults onboarded_at to null when field is null', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        id: 'u-1',
        email: 'a@b.com',
        first_name: null,
        last_name: null,
        job_title: null,
        seniority: null,
        industry_tags: null,
        is_student: false,
        bio_md: null,
        appear_in_directory: false,
        appear_in_matches: true,
        appear_on_attendee_list: true,
        appear_on_public_leaderboard: true,
        show_company_on_public_profile: false,
        onboarded_at: null,
      },
    });

    const profile = await svc.getProfile('u-1');

    expect(profile.onboarded_at).toBeNull();
  });
});
