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
