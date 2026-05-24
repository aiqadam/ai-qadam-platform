import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';

interface PublicProfileResponse {
  handle: string;
  displayName: string | null;
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
  // F-WebU15 — enrichment surfaced on /u/[handle]. Always present;
  // individual fields are nullable and the page hides sections whose
  // source is null. `recentEvents` is capped at 50 server-side.
  bioMd: string | null;
  jobTitle: string | null;
  employerName: string | null;
  recentEvents: Array<{
    eventId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
}

interface HandlesResponse {
  handles: Record<string, string>;
}

// Cap the batch so the endpoint can't be used to enumerate the whole
// user table. F-S3.10-c surfaces only event-speaker handles (≤50 per
// event in practice), so 50 is the natural upper bound.
const MAX_DIRECTUS_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public profile endpoint backing the /u/[handle] page. Tenant-scoped:
// the counts + points reflect activity in the requesting country only.
// Email is intentionally NOT in the response — handles are the public
// identifier per ADR-0016-style minimal exposure.
@Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // F-S3.10-c handle bridge — public endpoint that resolves a batch of
  // directus_user_id UUIDs to local handles, so the SSR layer can render
  // /u/{handle} links for speakers on the event page. Returns only
  // already-public handles (private profiles have handle=null); no other
  // PII is exposed.
  @Get('handles')
  async handles(@Query('directusIds') raw?: string): Promise<HandlesResponse> {
    const ids = (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return { handles: {} };
    if (ids.length > MAX_DIRECTUS_IDS) {
      throw new BadRequestException(`directusIds capped at ${MAX_DIRECTUS_IDS}`);
    }
    for (const id of ids) {
      if (!UUID_RE.test(id)) {
        throw new BadRequestException(`invalid directusId: ${id}`);
      }
    }
    const handles = await this.users.findHandlesByDirectusIds(ids);
    return { handles };
  }

  @Get(':handle/profile')
  async profile(
    @Param('handle') handle: string,
    @Req() req: Request,
  ): Promise<PublicProfileResponse> {
    const tenant = req.tenant;
    if (!tenant) {
      throw new NotFoundException('tenant not resolved');
    }
    const profile = await this.users.getPublicProfile(handle, tenant.code);
    if (!profile) {
      throw new NotFoundException(`no profile for handle '${handle}'`);
    }
    return {
      handle: profile.user.handle ?? handle,
      displayName: profile.user.displayName,
      attendedCount: profile.attendedCount,
      registeredCount: profile.registeredCount,
      totalPoints: profile.totalPoints,
      bioMd: profile.extras.bioMd,
      jobTitle: profile.extras.jobTitle,
      employerName: profile.extras.employerName,
      recentEvents: profile.extras.recentEvents,
    };
  }
}
