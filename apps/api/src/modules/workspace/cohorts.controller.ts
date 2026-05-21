import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { type CohortDetail, type CohortRow, CohortsService } from './cohorts.service';

// F-S3.2 — cohort CRUD + sample preview.
//
// All endpoints AuthGuard-gated. Cohort reads + samples emit audit
// trail events (per ADR-0033 sponsor PII boundary — cohorts ARE the
// units sponsors get entitled to; we want a record of every read).
// Audit-event wiring lands with S2.5 audit module; placeholder marker
// in comments here so the integration point is obvious.

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  filter_query: z.record(z.string(), z.unknown()),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  filter_query: z.record(z.string(), z.unknown()).optional(),
});

@Controller('v1/workspace/cohorts')
@UseGuards(AuthGuard)
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get()
  async list(@Req() req: Request): Promise<{ cohorts: CohortRow[] }> {
    requireUser(req);
    const cohorts = await this.cohorts.list();
    return { cohorts };
  }

  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string): Promise<{ cohort: CohortDetail }> {
    requireUser(req);
    // TODO(S2.5): emit audit_events row { actor: req.user.sub, action: 'cohort.read', target: id }
    const cohort = await this.cohorts.getById(id);
    return { cohort };
  }

  @Get(':id/sample')
  async sample(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ members: unknown[] }> {
    requireUser(req);
    const limit = limitRaw ? Math.min(50, Math.max(1, Number.parseInt(limitRaw, 10) || 20)) : 20;
    // TODO(S2.5): emit audit_events row { actor: req.user.sub, action: 'cohort.sampled', target: id }
    return this.cohorts.sample(id, limit);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: unknown): Promise<{ cohort: CohortRow }> {
    const userId = requireUser(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const cohort = await this.cohorts.create({
      ...parsed.data,
      created_by: userId,
    });
    return { cohort };
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ cohort: CohortRow }> {
    requireUser(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const cohort = await this.cohorts.update(id, parsed.data);
    return { cohort };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: Request, @Param('id') id: string): Promise<void> {
    requireUser(req);
    await this.cohorts.delete(id);
  }
}

function requireUser(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
