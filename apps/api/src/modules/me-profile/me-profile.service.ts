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
// Out of scope for v1:
//   - member_interests (similar tag shape; v2 follow-up)
//   - member_employments (FK to companies; v2 follow-up)
//   - directus_users.employer FK update (same scope cut as above)

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

const PROFILE_FIELDS =
  'id,email,first_name,last_name,job_title,seniority,industry_tags,is_student,bio_md,appear_in_directory';

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
    };
  }
}
