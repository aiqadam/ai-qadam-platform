import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';

// C-4b-3 — read-only API for the /me badge strip.
//
// Returns the calling member's earned badges, each pre-joined with its
// badge_definition so the client gets display_label + icon + category
// without a second fetch. Sort: newest first. No pagination — a member's
// badge cap is small (≤30 in practice).
//
// Auth: standard AuthGuard. Members only see their own row.

interface BadgeDefRow {
  key: string;
  display_label: string;
  description_md: string | null;
  icon: string | null;
  category: 'role' | 'achievement' | 'special';
}

interface MemberBadgeRow {
  id: string;
  badge_type: string;
  source_ref: string | null;
  date_created: string;
}

export interface MyBadge {
  id: string;
  awardedAt: string;
  sourceRef: string | null;
  key: string;
  displayLabel: string;
  descriptionMd: string | null;
  icon: string | null;
  category: BadgeDefRow['category'];
}

@Controller('v1/me/badges')
@UseGuards(AuthGuard)
export class BadgesController {
  constructor(
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
  ) {}

  @Get()
  async listMine(@Req() req: Request): Promise<{ badges: MyBadge[] }> {
    if (!req.user) throw new UnauthorizedException('no claims attached');
    const directusUserId = await this.bridge.resolveDirectusId(req.user.sub);
    if (!directusUserId) {
      throw new NotFoundException('no directus user mapping');
    }

    // Fetch in parallel: the member's badge rows + the active taxonomy.
    // Joining client-side keeps the perm model simple (member_badges
    // is per-user; badge_definitions is public-read).
    const [memberBadges, definitions] = await Promise.all([
      this.fetchMemberBadges(directusUserId),
      this.fetchActiveDefinitions(),
    ]);

    const byKey = new Map(definitions.map((d) => [d.key, d]));
    const badges: MyBadge[] = [];
    for (const row of memberBadges) {
      const def = byKey.get(row.badge_type);
      if (!def) continue; // definition retired or missing — skip
      badges.push({
        id: row.id,
        awardedAt: row.date_created,
        sourceRef: row.source_ref,
        key: row.badge_type,
        displayLabel: def.display_label,
        descriptionMd: def.description_md,
        icon: def.icon,
        category: def.category,
      });
    }
    return { badges };
  }

  private async fetchMemberBadges(directusUserId: string): Promise<MemberBadgeRow[]> {
    const params = new URLSearchParams({
      'filter[user][_eq]': directusUserId,
      fields: 'id,badge_type,source_ref,date_created',
      sort: '-date_created',
      limit: '100',
    });
    const body = await this.directus.get<{ data: MemberBadgeRow[] }>(
      `/items/member_badges?${params.toString()}`,
    );
    return body.data;
  }

  private async fetchActiveDefinitions(): Promise<BadgeDefRow[]> {
    const params = new URLSearchParams({
      'filter[active][_eq]': 'true',
      fields: 'key,display_label,description_md,icon,category',
      limit: '100',
    });
    const body = await this.directus.get<{ data: BadgeDefRow[] }>(
      `/items/badge_definitions?${params.toString()}`,
    );
    return body.data;
  }
}
