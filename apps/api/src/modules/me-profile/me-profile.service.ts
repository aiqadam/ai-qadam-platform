import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// F-S3.6 — member self-service backend per ADR-0033 cabinet #5.
//
// Reads + writes:
//   - directus_users core profile fields (job_title, seniority,
//     industry_tags, is_student, bio_md, appear_in_directory)
//   - member_consents per-purpose toggles (the 7 purposes from
//     ADR-0033 Part 1: events/marketing/research/recruiting/
//     sponsor_share/content/paid_premium). Distinct from
//     consent_records (Sprint 5.5/2) which keys off
//     actor-class × intent — both schemas coexist.
//   - member_skills add/remove (one row per (member, skill_tag))
//
// F-S3.6b extension:
//   - member_interests add/remove (topic_tag + intent)
//   - member_employments add/remove with find-or-create company by slug
//     (is_employer auto-set on creation; status defaults to pending so
//     operators can review member-created orgs before they leak elsewhere)
//   - directus_users.employer FK update — still deferred; the existing
//     patchProfile covers it once the schema field flips writable, and
//     "current employer" is derivable from member_employments.is_current

// The 7 purposes from ADR-0033 Part 1 + bootstrap.sh member_consents
// schema. Adding a new purpose here requires the schema enum to also
// list it; out-of-list values are rejected at the controller layer.
export const MEMBER_CONSENT_PURPOSES = [
  'events',
  'marketing',
  'research',
  'recruiting',
  'sponsor_share',
  'content',
  'paid_premium',
] as const;
export type MemberConsentPurpose = (typeof MEMBER_CONSENT_PURPOSES)[number];

export const SENIORITY_KEYS = [
  'ic',
  'senior',
  'lead',
  'manager',
  'director',
  'vp',
  'c_level',
] as const;
export type SeniorityKey = (typeof SENIORITY_KEYS)[number];

export interface MemberProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: SeniorityKey | null;
  industry_tags: string[];
  is_student: boolean;
  bio_md: string | null;
  appear_in_directory: boolean;
  appear_in_matches: boolean;
}

export interface MemberConsentSummary {
  purpose: MemberConsentPurpose;
  granted: boolean;
  // The granted_at of the row that determined the current state, or
  // null when no row exists yet (default deny).
  lastChangedAt: string | null;
}

export interface MemberSkill {
  id: string;
  skill_tag: string;
  endorsement_count: number;
  verified_by_event: string | null;
}

export const INTEREST_INTENTS = ['learn', 'practice', 'mentor', 'discuss'] as const;
export type InterestIntent = (typeof INTEREST_INTENTS)[number];

export interface MemberInterest {
  id: string;
  topic_tag: string;
  intent: InterestIntent;
}

export interface MemberEmployment {
  id: string;
  employer: { id: string; name: string; slug: string };
  role: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_current: boolean;
  share_with_sponsors: boolean;
}

interface DirectusUserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: SeniorityKey | null;
  industry_tags: string[] | null;
  is_student: boolean | null;
  bio_md: string | null;
  appear_in_directory: boolean | null;
  appear_in_matches: boolean | null;
}

interface MemberConsentRow {
  id: string;
  purpose: MemberConsentPurpose;
  granted_at: string;
  revoked_at: string | null;
}

interface MemberSkillRow {
  id: string;
  skill_tag: string;
  endorsement_count: number | null;
  verified_by_event: string | null;
}

interface MemberInterestRow {
  id: string;
  topic_tag: string;
  intent: InterestIntent;
}

interface MemberEmploymentRow {
  id: string;
  employer: { id: string; name: string; slug: string };
  role: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_current: boolean;
  share_with_sponsors: boolean;
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
}

export interface AddEmploymentInput {
  employer_name: string;
  role?: string | null | undefined;
  started_at?: string | null | undefined;
  ended_at?: string | null | undefined;
  is_current?: boolean | undefined;
  share_with_sponsors?: boolean | undefined;
}

const PROFILE_FIELDS =
  'id,email,first_name,last_name,job_title,seniority,industry_tags,is_student,bio_md,appear_in_directory,appear_in_matches';

@Injectable()
export class MeProfileService {
  private readonly logger = new Logger(MeProfileService.name);

  constructor(private readonly directus: DirectusClient) {}

  async getProfile(userId: string): Promise<MemberProfile> {
    const row = await this.directus.get<{ data: DirectusUserRow | null }>(
      `/users/${encodeURIComponent(userId)}?fields=${PROFILE_FIELDS}`,
    );
    if (!row.data) {
      throw new NotFoundException('user not found');
    }
    return this.toProfile(row.data);
  }

  async patchProfile(
    userId: string,
    patch: {
      job_title?: string | null | undefined;
      seniority?: SeniorityKey | null | undefined;
      industry_tags?: string[] | undefined;
      is_student?: boolean | undefined;
      bio_md?: string | null | undefined;
      appear_in_directory?: boolean | undefined;
      appear_in_matches?: boolean | undefined;
    },
  ): Promise<MemberProfile> {
    // Pass through exactly the fields the caller set; PATCHing
    // null is meaningful (clearing a field).
    await this.directus.patch(`/users/${encodeURIComponent(userId)}`, patch);
    return this.getProfile(userId);
  }

  async listConsents(userId: string): Promise<MemberConsentSummary[]> {
    // One query for all the member's rows. Group client-side by
    // purpose, take the most recent (granted_at DESC) per purpose,
    // check revoked_at IS NULL for the current state.
    const filter = encodeURIComponent(JSON.stringify({ member: { _eq: userId } }));
    const res = await this.directus.get<{ data: MemberConsentRow[] }>(
      `/items/member_consents?filter=${filter}&sort=-granted_at&fields=id,purpose,granted_at,revoked_at&limit=200`,
    );
    const byPurpose = new Map<MemberConsentPurpose, MemberConsentRow>();
    for (const row of res.data) {
      // Sort is -granted_at so the FIRST row per purpose wins.
      if (!byPurpose.has(row.purpose)) {
        byPurpose.set(row.purpose, row);
      }
    }
    return MEMBER_CONSENT_PURPOSES.map((purpose) => {
      const row = byPurpose.get(purpose);
      if (!row) {
        return { purpose, granted: false, lastChangedAt: null };
      }
      return {
        purpose,
        granted: row.revoked_at == null,
        lastChangedAt: row.granted_at,
      };
    });
  }

  async setConsent(
    userId: string,
    purpose: MemberConsentPurpose,
    granted: boolean,
  ): Promise<MemberConsentSummary> {
    // Append-only: every toggle inserts a new row (matches the
    // existing consent_records pattern in PreferencesService). Most-
    // recent row wins on read.
    const now = new Date().toISOString();
    await this.directus.post('/items/member_consents', {
      member: userId,
      purpose,
      granted_at: now,
      revoked_at: granted ? null : now,
      source: 'preferences_page',
    });
    return { purpose, granted, lastChangedAt: now };
  }

  async listSkills(userId: string): Promise<MemberSkill[]> {
    const filter = encodeURIComponent(JSON.stringify({ member: { _eq: userId } }));
    const res = await this.directus.get<{ data: MemberSkillRow[] }>(
      `/items/member_skills?filter=${filter}&sort=skill_tag&fields=id,skill_tag,endorsement_count,verified_by_event&limit=100`,
    );
    return res.data.map((row) => ({
      id: row.id,
      skill_tag: row.skill_tag,
      endorsement_count: row.endorsement_count ?? 0,
      verified_by_event: row.verified_by_event,
    }));
  }

  async addSkill(userId: string, skillTag: string): Promise<MemberSkill> {
    // Deduplicate client-side: if the tag already exists for this
    // user, return the existing row instead of creating a second one.
    const existing = await this.listSkills(userId);
    const match = existing.find((s) => s.skill_tag === skillTag);
    if (match) return match;
    const res = await this.directus.post<{ data: MemberSkillRow }>('/items/member_skills', {
      member: userId,
      skill_tag: skillTag,
      endorsement_count: 0,
    });
    return {
      id: res.data.id,
      skill_tag: res.data.skill_tag,
      endorsement_count: 0,
      verified_by_event: null,
    };
  }

  async removeSkill(userId: string, skillId: string): Promise<void> {
    // Confirm the row belongs to the caller before deletion — a
    // small belt-and-braces check on top of the eventual Directus
    // permission policy.
    const filter = encodeURIComponent(
      JSON.stringify({ id: { _eq: skillId }, member: { _eq: userId } }),
    );
    const owned = await this.directus.get<{ data: MemberSkillRow[] }>(
      `/items/member_skills?filter=${filter}&fields=id&limit=1`,
    );
    if (owned.data.length === 0) {
      throw new NotFoundException('skill not found for this member');
    }
    await this.directus.delete(`/items/member_skills/${encodeURIComponent(skillId)}`);
  }

  async listInterests(userId: string): Promise<MemberInterest[]> {
    const filter = encodeURIComponent(JSON.stringify({ member: { _eq: userId } }));
    const res = await this.directus.get<{ data: MemberInterestRow[] }>(
      `/items/member_interests?filter=${filter}&sort=topic_tag&fields=id,topic_tag,intent&limit=200`,
    );
    return res.data;
  }

  async addInterest(
    userId: string,
    topicTag: string,
    intent: InterestIntent,
  ): Promise<MemberInterest> {
    // Dedupe on (member, topic_tag, intent) — same intent on the same
    // topic is meaningless; return existing.
    const existing = await this.listInterests(userId);
    const match = existing.find((i) => i.topic_tag === topicTag && i.intent === intent);
    if (match) return match;
    const res = await this.directus.post<{ data: MemberInterestRow }>('/items/member_interests', {
      member: userId,
      topic_tag: topicTag,
      intent,
    });
    return { id: res.data.id, topic_tag: res.data.topic_tag, intent: res.data.intent };
  }

  async removeInterest(userId: string, interestId: string): Promise<void> {
    const filter = encodeURIComponent(
      JSON.stringify({ id: { _eq: interestId }, member: { _eq: userId } }),
    );
    const owned = await this.directus.get<{ data: { id: string }[] }>(
      `/items/member_interests?filter=${filter}&fields=id&limit=1`,
    );
    if (owned.data.length === 0) {
      throw new NotFoundException('interest not found for this member');
    }
    await this.directus.delete(`/items/member_interests/${encodeURIComponent(interestId)}`);
  }

  async listEmployments(userId: string): Promise<MemberEmployment[]> {
    const filter = encodeURIComponent(JSON.stringify({ member: { _eq: userId } }));
    const fields =
      'id,role,started_at,ended_at,is_current,share_with_sponsors,employer.id,employer.name,employer.slug';
    const res = await this.directus.get<{ data: MemberEmploymentRow[] }>(
      `/items/member_employments?filter=${filter}&sort=-is_current,-started_at&fields=${fields}&limit=50`,
    );
    return res.data.map((row) => ({
      id: row.id,
      employer: row.employer,
      role: row.role,
      started_at: row.started_at,
      ended_at: row.ended_at,
      is_current: row.is_current,
      share_with_sponsors: row.share_with_sponsors,
    }));
  }

  async addEmployment(userId: string, input: AddEmploymentInput): Promise<MemberEmployment> {
    const employer = await this.findOrCreateEmployer(input.employer_name);
    const body: Record<string, unknown> = {
      member: userId,
      employer: employer.id,
      is_current: input.is_current ?? false,
      share_with_sponsors: input.share_with_sponsors ?? false,
    };
    if (input.role !== undefined) body.role = input.role;
    if (input.started_at !== undefined) body.started_at = input.started_at;
    if (input.ended_at !== undefined) body.ended_at = input.ended_at;
    const res = await this.directus.post<{ data: { id: string } }>(
      '/items/member_employments',
      body,
    );
    // Re-fetch with the employer expansion so the response shape matches list().
    const single = encodeURIComponent(JSON.stringify({ id: { _eq: res.data.id } }));
    const fields =
      'id,role,started_at,ended_at,is_current,share_with_sponsors,employer.id,employer.name,employer.slug';
    const settled = await this.directus.get<{ data: MemberEmploymentRow[] }>(
      `/items/member_employments?filter=${single}&fields=${fields}&limit=1`,
    );
    const row = settled.data[0];
    if (!row) throw new NotFoundException('employment created but not retrievable');
    return {
      id: row.id,
      employer: row.employer,
      role: row.role,
      started_at: row.started_at,
      ended_at: row.ended_at,
      is_current: row.is_current,
      share_with_sponsors: row.share_with_sponsors,
    };
  }

  async removeEmployment(userId: string, employmentId: string): Promise<void> {
    const filter = encodeURIComponent(
      JSON.stringify({ id: { _eq: employmentId }, member: { _eq: userId } }),
    );
    const owned = await this.directus.get<{ data: { id: string }[] }>(
      `/items/member_employments?filter=${filter}&fields=id&limit=1`,
    );
    if (owned.data.length === 0) {
      throw new NotFoundException('employment not found for this member');
    }
    await this.directus.delete(`/items/member_employments/${encodeURIComponent(employmentId)}`);
  }

  private async findOrCreateEmployer(rawName: string): Promise<CompanyRow> {
    const name = rawName.trim();
    if (!name) throw new NotFoundException('employer name required');
    const slug = slugifyEmployer(name);
    const filter = encodeURIComponent(JSON.stringify({ slug: { _eq: slug } }));
    const existing = await this.directus.get<{ data: CompanyRow[] }>(
      `/items/companies?filter=${filter}&fields=id,name,slug&limit=1`,
    );
    const found = existing.data[0];
    if (found) return found;
    // Status=pending so an operator can review member-created orgs
    // before they appear on /workspace/members aggregations.
    const created = await this.directus.post<{ data: CompanyRow }>('/items/companies', {
      name,
      slug,
      is_employer: true,
      status: 'pending',
    });
    return created.data;
  }

  private toProfile(row: DirectusUserRow): MemberProfile {
    return {
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      job_title: row.job_title,
      seniority: row.seniority,
      industry_tags: row.industry_tags ?? [],
      is_student: row.is_student ?? false,
      bio_md: row.bio_md,
      appear_in_directory: row.appear_in_directory ?? false,
      appear_in_matches: row.appear_in_matches ?? true,
    };
  }
}

function slugifyEmployer(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `org-${Date.now()}`
  );
}
