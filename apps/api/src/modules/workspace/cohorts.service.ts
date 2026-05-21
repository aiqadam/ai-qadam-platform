import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { MembersService } from './members.service';

// F-S3.2 — saved-cohort management.
//
// A cohort = a NAMED, REUSABLE filter against members. Same JSON shape
// as the dispatcher's audience resolver consumes, so cohort.filter_query
// → dispatch is a zero-translation hop.
//
// member_count_cached on the cohort row is intentionally denormalised
// (refreshed by cron + on-write); UI reads it without re-evaluating the
// filter on every page load.

export interface CohortRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  filter_query: Record<string, unknown>;
  created_by?: string | null;
  member_count_cached: number;
  member_count_refreshed_at?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
}

export interface CohortDetail extends CohortRow {
  current_member_count: number;
  member_count_delta_7d: number;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

function ensureSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `cohort-${Date.now()}`
  );
}

@Injectable()
export class CohortsService {
  private readonly logger = new Logger(CohortsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly members: MembersService,
  ) {}

  async list(): Promise<CohortRow[]> {
    const res = await this.directus.get<{ data: CohortRow[] }>(
      '/items/cohorts?sort=name&limit=200&fields=*',
    );
    return res.data;
  }

  async getById(id: string): Promise<CohortDetail> {
    const res = await this.directus.get<{ data: CohortRow }>(
      `/items/cohorts/${encodeURIComponent(id)}?fields=*`,
    );
    if (!res.data) {
      throw new NotFoundException(`cohort ${id} not found`);
    }
    const current = await this.members.count(res.data.filter_query);
    return {
      ...res.data,
      current_member_count: current,
      // 7d delta: snapshot - current (positive = grew). Cached snapshot
      // updates on cron; placeholder 0 if unrefreshed.
      member_count_delta_7d: current - res.data.member_count_cached,
    };
  }

  async sample(id: string, limit = 20): Promise<{ members: unknown[] }> {
    const cohort = await this.directus.get<{ data: CohortRow }>(
      `/items/cohorts/${encodeURIComponent(id)}?fields=filter_query`,
    );
    if (!cohort.data) {
      throw new NotFoundException(`cohort ${id} not found`);
    }
    // Sample with PII-light field set — operators see enough to
    // recognise the audience, not enough to dox individuals.
    const fields = encodeURIComponent('id,first_name,city,seniority,industry');
    const filterParam = encodeURIComponent(JSON.stringify(cohort.data.filter_query));
    const res = await this.directus.get<{ data: unknown[] }>(
      `/users?fields=${fields}&filter=${filterParam}&limit=${Math.min(50, limit)}`,
    );
    return { members: res.data };
  }

  async create(input: {
    name: string;
    description?: string | undefined;
    filter_query: Record<string, unknown>;
    created_by: string;
  }): Promise<CohortRow> {
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }
    if (!input.filter_query || typeof input.filter_query !== 'object') {
      throw new BadRequestException('filter_query is required and must be an object');
    }

    const slug = ensureSlug(input.name);
    if (!SLUG_RE.test(slug)) {
      throw new BadRequestException(`derived slug "${slug}" is invalid`);
    }

    // Snapshot count at creation so detail-view delta works from day one.
    const count = await this.members.count(input.filter_query);
    const now = new Date().toISOString();

    const res = await this.directus.post<{ data: CohortRow }>('/items/cohorts', {
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      filter_query: input.filter_query,
      created_by: input.created_by,
      member_count_cached: count,
      member_count_refreshed_at: now,
    });
    return res.data;
  }

  async update(
    id: string,
    patch: {
      name?: string | undefined;
      description?: string | null | undefined;
      filter_query?: Record<string, unknown> | undefined;
    },
  ): Promise<CohortRow> {
    // Re-cache count if filter_query changed.
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      body.name = patch.name.trim();
      body.slug = ensureSlug(patch.name);
    }
    if (patch.description !== undefined) {
      body.description = patch.description;
    }
    if (patch.filter_query !== undefined) {
      body.filter_query = patch.filter_query;
      body.member_count_cached = await this.members.count(patch.filter_query);
      body.member_count_refreshed_at = new Date().toISOString();
    }
    const res = await this.directus.patch<{ data: CohortRow }>(
      `/items/cohorts/${encodeURIComponent(id)}`,
      body,
    );
    return res.data;
  }

  async delete(id: string): Promise<void> {
    await this.directus.delete(`/items/cohorts/${encodeURIComponent(id)}`);
  }
}
