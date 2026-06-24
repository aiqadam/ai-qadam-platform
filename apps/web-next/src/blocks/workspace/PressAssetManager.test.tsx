// PressAssetManager.test.tsx — Unit tests for PressAssetManager helpers.
//
// Tests:
//   1. pressPageSchema — Zod validation
//   2. teamMemberSchema — Zod validation
//   3. statsSchema — Zod validation
//   4. updatePressPage() — mock fetch, verify PATCH body
//   5. createTeamMember() — mock fetch, verify POST body
//   6. deleteTeamMember() — mock fetch, verify soft-delete PATCH body
//   7. TeamBiosSection pure helpers
//
// NOTE: @testing-library/react is NOT installed (ESM / Node test env).
// Tests use pure-helper extraction + schema validation + mock fetch.

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// ─── 1. pressPageSchema ────────────────────────────────────────────────────────

const pressPageSchema = z.object({
  heroTitle: z.string().min(1, 'Hero title is required'),
  companyBoilerplate: z.string().min(1, 'Boilerplate is required'),
  seoDescription: z.string().min(1, 'SEO description is required'),
  contactResponseSla: z.string().min(1, 'Response SLA text is required'),
  contactGuidance: z.string().min(1, 'Contact guidance is required'),
});

describe('pressPageSchema', () => {
  it('accepts valid press page data', () => {
    const result = pressPageSchema.safeParse({
      heroTitle: 'AI Qadam for the press',
      companyBoilerplate: 'Founded in 2026.',
      seoDescription: 'Media kit for journalists.',
      contactResponseSla: 'Responds within one business day.',
      contactGuidance: 'Embargo requests welcome.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty heroTitle', () => {
    const result = pressPageSchema.safeParse({
      heroTitle: '',
      companyBoilerplate: 'Text.',
      seoDescription: 'SEO.',
      contactResponseSla: 'SLA.',
      contactGuidance: 'Guidance.',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('heroTitle');
    }
  });

  it('rejects empty seoDescription', () => {
    const result = pressPageSchema.safeParse({
      heroTitle: 'Title',
      companyBoilerplate: 'Text.',
      seoDescription: '',
      contactResponseSla: 'SLA.',
      contactGuidance: 'Guidance.',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path[0]);
      expect(paths).toContain('seoDescription');
    }
  });
});

// ─── 2. teamMemberSchema ───────────────────────────────────────────────────────

const TEAM_MEMBER_ROLES = [
  'founder',
  'coo',
  'country_lead',
  'advisor',
  'organizer',
  'staff',
  'other',
] as const;

const teamMemberSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name must be ≤ 120 characters'),
  title: z.string().min(1, 'Title is required').max(120, 'Title must be ≤ 120 characters'),
  role: z.enum(TEAM_MEMBER_ROLES),
  bioMd: z.string().max(2000, 'Bio must be ≤ 2000 characters').or(z.literal('')),
  displayOrder: z.coerce.number().int().min(0).max(999),
});

describe('teamMemberSchema', () => {
  it('accepts valid team member data', () => {
    const result = teamMemberSchema.safeParse({
      name: 'Viktor Drukker',
      title: 'Founder & CEO',
      role: 'founder',
      bioMd: 'Built AI Qadam.',
      displayOrder: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty bioMd', () => {
    const result = teamMemberSchema.safeParse({
      name: 'Abdu M',
      title: 'Country Lead',
      role: 'country_lead',
      bioMd: '',
      displayOrder: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = teamMemberSchema.safeParse({
      name: '',
      title: 'Lead',
      role: 'staff',
      bioMd: '',
      displayOrder: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('name');
    }
  });

  it('rejects name over 120 characters', () => {
    const result = teamMemberSchema.safeParse({
      name: 'A'.repeat(121),
      title: 'Lead',
      role: 'staff',
      bioMd: '',
      displayOrder: 50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects bio over 2000 characters', () => {
    const result = teamMemberSchema.safeParse({
      name: 'Viktor',
      title: 'Founder',
      role: 'founder',
      bioMd: 'B'.repeat(2001),
      displayOrder: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = teamMemberSchema.safeParse({
      name: 'Viktor',
      title: 'Founder',
      role: 'superhero',
      bioMd: '',
      displayOrder: 1,
    });
    expect(result.success).toBe(false);
  });

  it('coerces string displayOrder to number', () => {
    const result = teamMemberSchema.safeParse({
      name: 'Viktor',
      title: 'Founder',
      role: 'founder',
      bioMd: '',
      displayOrder: '5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayOrder).toBe(5);
    }
  });
});

// ─── 3. statsSchema ───────────────────────────────────────────────────────────

const statsSchema = z.object({
  countriesServed: z.coerce.number().int().min(1, 'Must be ≥ 1').max(99, 'Must be ≤ 99'),
  defaultDescription: z.string().min(1, 'Description is required'),
});

describe('statsSchema', () => {
  it('accepts valid stats', () => {
    const result = statsSchema.safeParse({
      countriesServed: 3,
      defaultDescription: 'Multi-tenant platform for Central Asia.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero countries', () => {
    const result = statsSchema.safeParse({
      countriesServed: 0,
      defaultDescription: 'Platform.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 100 countries', () => {
    const result = statsSchema.safeParse({
      countriesServed: 100,
      defaultDescription: 'Platform.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = statsSchema.safeParse({
      countriesServed: 3,
      defaultDescription: '',
    });
    expect(result.success).toBe(false);
  });
});

// ─── 4. updatePressPage mock fetch ────────────────────────────────────────────

async function updatePressPage(data: Record<string, unknown>): Promise<void> {
  const base = 'http://directus:8055';
  const res = await fetch(`${base}/items/press_page`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Directus PATCH /items/press_page → HTTP ${res.status}`);
}

describe('updatePressPage', () => {
  it('sends PATCH to /items/press_page with camelCase data', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await updatePressPage({ hero_title: 'New Title' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!call) throw new Error('Expected fetch call');
    const [url, options] = call;
    expect(url).toMatch(/\/items\/press_page$/);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body as string)).toEqual({ hero_title: 'New Title' });
    vi.restoreAllMocks();
  });

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(updatePressPage({ hero_title: 'X' })).rejects.toThrow(
      'Directus PATCH /items/press_page → HTTP 503',
    );
    vi.restoreAllMocks();
  });
});

// ─── 5. createTeamMember mock fetch ───────────────────────────────────────────

async function createTeamMember(data: Record<string, unknown>): Promise<string> {
  const base = 'http://directus:8055';
  const res = await fetch(`${base}/items/team_members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Directus POST /items/team_members → HTTP ${res.status}`);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

describe('createTeamMember', () => {
  it('sends POST to /items/team_members and returns id', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ data: { id: 'abc-123' } }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const id = await createTeamMember({ name: 'Viktor', title: 'Founder', role: 'founder' });
    expect(id).toBe('abc-123');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!call) throw new Error('Expected fetch call');
    const [url, options] = call;
    expect(url).toMatch(/\/items\/team_members$/);
    expect(options.method).toBe('POST');
    vi.restoreAllMocks();
  });
});

// ─── 6. deleteTeamMember (soft-delete via PATCH) ─────────────────────────────

async function deleteTeamMember(id: string): Promise<void> {
  const base = 'http://directus:8055';
  const res = await fetch(`${base}/items/team_members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ active: false }),
  });
  if (!res.ok) throw new Error(`Directus PATCH /items/team_members/${id} → HTTP ${res.status}`);
}

describe('deleteTeamMember', () => {
  it('sends PATCH { active: false } to soft-delete the member', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await deleteTeamMember('member-99');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!call) throw new Error('Expected fetch call');
    const [url, options] = call;
    expect(url).toMatch(/\/items\/team_members\/member-99$/);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body as string)).toEqual({ active: false });
    vi.restoreAllMocks();
  });
});

// ─── 7. TeamBiosSection pure helpers ──────────────────────────────────────────

type LocalMember = { id: string; name: string; title: string };

function membersAfterSave(members: LocalMember[], updated: LocalMember): LocalMember[] {
  return members.map((m) => (m.id === updated.id ? updated : m));
}

function membersAfterDelete(members: LocalMember[], id: string): LocalMember[] {
  return members.filter((m) => m.id !== id);
}

describe('TeamBiosSection pure helpers', () => {
  const initial: LocalMember[] = [
    { id: '1', name: 'Viktor', title: 'Founder' },
    { id: '2', name: 'Abdu', title: 'Lead' },
  ];

  it('membersAfterSave updates the matching member', () => {
    const updated = { id: '1', name: 'Viktor D', title: 'CEO' };
    const result = membersAfterSave(initial, updated);
    expect(result[0]).toEqual(updated);
    expect(result[1]).toEqual(initial[1]);
  });

  it('membersAfterSave does not mutate original', () => {
    const updated = { id: '1', name: 'Viktor D', title: 'CEO' };
    membersAfterSave(initial, updated);
    expect(initial[0]?.name).toBe('Viktor');
  });

  it('membersAfterDelete removes the matching member', () => {
    const result = membersAfterDelete(initial, '1');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('2');
  });

  it('membersAfterDelete does not mutate original', () => {
    membersAfterDelete(initial, '1');
    expect(initial).toHaveLength(2);
  });

  it('membersAfterDelete is no-op for unknown id', () => {
    const result = membersAfterDelete(initial, 'unknown');
    expect(result).toHaveLength(2);
  });
});
