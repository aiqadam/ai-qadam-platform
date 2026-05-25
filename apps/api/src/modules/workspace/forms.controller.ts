import {
  BadRequestException,
  Body,
  Controller,
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
import { AuthGuard } from '../auth/auth.guard';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import {
  type FormAggregate,
  type FormRow,
  type SubmissionRow,
  WorkspaceFormsService,
  createFormSchema,
  patchFormSchema,
} from './forms.service';

// Forms-builder PR-D — operator cabinet endpoints for the in-house
// forms library. AuthGuard-gated; per-country scoping rides on the
// existing operator policy (forms.country = operator's country_codes
// claim).
//
// `created_by` MUST be set via the DirectusUsersBridgeService — the
// platform's users.id is NOT the same as directus_users.id, and the
// forms.created_by FK is to directus_users (per memory
// feedback_directus_fk_uses_bridge, learned from F-S2.7 PR #193).

@Controller('v1/workspace/forms')
@UseGuards(AuthGuard)
export class WorkspaceFormsController {
  constructor(
    private readonly forms: WorkspaceFormsService,
    private readonly directusBridge: DirectusUsersBridgeService,
  ) {}

  @Get()
  async list(@Req() req: Request): Promise<{ forms: FormRow[] }> {
    requireUser(req);
    return { forms: await this.forms.list() };
  }

  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string): Promise<{ form: FormRow }> {
    requireUser(req);
    return { form: await this.forms.getById(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: unknown): Promise<{ form: FormRow }> {
    const userId = requireUser(req);
    const parsed = createFormSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const directusId = await this.directusBridge.resolveDirectusId(userId);
    if (!directusId) {
      throw new UnauthorizedException({ error: 'operator_not_bridged' });
    }
    const form = await this.forms.create(parsed.data, directusId);
    return { form };
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ form: FormRow }> {
    requireUser(req);
    const parsed = patchFormSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { form: await this.forms.update(id, parsed.data) };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Req() req: Request, @Param('id') id: string): Promise<{ form: FormRow }> {
    requireUser(req);
    return { form: await this.forms.archive(id) };
  }

  // PR-D2 — operator inbox for collected responses + per-field aggregates.
  // Both endpoints AuthGuard-gated; per-country scoping rides on the
  // existing Directus policy filter via the operator's bridge token.
  //
  // /submissions — raw response list. Caps at 500/page; UI paginates.
  // /aggregate   — computed stats (NPS mean, distribution histogram,
  //                yes/no counts, select counts, text response counts).

  @Get(':id/submissions')
  async submissions(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('event_id') eventId?: string,
  ): Promise<{ submissions: SubmissionRow[] }> {
    requireUser(req);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
    const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
    const submissions = await this.forms.listSubmissions(id, {
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
      eventId: eventId ?? null,
    });
    return { submissions };
  }

  @Get(':id/aggregate')
  async aggregate(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ aggregate: FormAggregate }> {
    requireUser(req);
    return { aggregate: await this.forms.aggregateForm(id) };
  }
}

function requireUser(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
