import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { type MemberSearchResult, MembersService } from './members.service';

// F-S3.2 — search/filter the member directory.
//
// Auth: standard AuthGuard. Per ADR-0033 + ADR-0021 (Proposed) the
// finer-grained operator/super_admin gate lands with S2.2 RBAC sync.
// Today: any authenticated user accessing /workspace MUST also be in
// the operator+ Authentik group; that group enforcement is the
// workspace-shell front-door (NOT this endpoint). See runbook.

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  filter: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

@Controller('v1/workspace/members')
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  async search(@Req() req: Request, @Query() query: unknown): Promise<MemberSearchResult> {
    requireUser(req);
    const parsed = searchSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    let filterObject: Record<string, unknown> | undefined;
    if (parsed.data.filter) {
      try {
        const obj = JSON.parse(parsed.data.filter);
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
          throw new Error('filter must be a JSON object');
        }
        filterObject = obj as Record<string, unknown>;
      } catch (err) {
        throw new BadRequestException(
          `filter is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const result = await this.members.search({
      filter: filterObject,
      query: parsed.data.q,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return result;
  }
}

function requireUser(req: Request): void {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
}
