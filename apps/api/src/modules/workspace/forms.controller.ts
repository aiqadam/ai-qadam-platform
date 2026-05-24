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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import {
  type FormRow,
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
}

function requireUser(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
