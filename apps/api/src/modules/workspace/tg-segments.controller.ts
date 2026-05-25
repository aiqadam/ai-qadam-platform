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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  type SegmentDetail,
  type SegmentPreview,
  type SegmentSummary,
  TgSegmentsService,
} from './tg-segments.service';

// #294 PR-c — workspace cabinet endpoints for tg_segments.

const listQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase')
    .optional(),
});

const idParamSchema = z.string().uuid();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  country: z.string().regex(/^[a-z]{2}$/),
  // criteria is validated structurally by the service so we only check
  // it's an object here. The service throws BadRequestException on
  // shape violations with a "supported fields" hint.
  criteria: z.record(z.unknown()),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    criteria: z.record(z.unknown()).optional(),
  })
  .strict();

// #393 — preview-draft body. Same loose criteria shape as create
// (service validates structurally); country needed for scope intersection.
const previewDraftSchema = z.object({
  country: z.string().regex(/^[a-z]{2}$/),
  criteria: z.record(z.unknown()),
});

@Controller('v1/workspace/tg-segments')
@UseGuards(AuthGuard)
export class TgSegmentsController {
  constructor(private readonly segments: TgSegmentsService) {}

  @Get()
  async list(@Query() query: unknown): Promise<{ items: SegmentSummary[] }> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.segments.list({ country: parsed.data.country ?? null });
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<SegmentDetail> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.segments.get(parsed.data);
  }

  // Match-count + 5 anonymized sample names. Reuses the resolver the
  // PR-d dispatcher will use; lets operator preview before saving.
  @Get(':id/preview')
  async preview(@Param('id') id: string): Promise<SegmentPreview> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.segments.preview(parsed.data);
  }

  // #393 — preview a draft criteria block without persisting first.
  // Used by the cabinet builder's live-preview as operators tweak chips
  // before saving. Validation errors come back as 400 with the
  // supported-fields hint (same shape as create).
  //
  //   200: { match_count, sample[5 anonymized names] }
  //   400: { error: 'invalid_criteria', reason, supported? }
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async previewDraft(@Body() body: unknown): Promise<Omit<SegmentPreview, 'segment_id'>> {
    const parsed = previewDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.segments.previewDraft(parsed.data.criteria, parsed.data.country);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<SegmentDetail> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // Cast through SegmentCriteria — service's validateCriteria does
    // the structural check; throws BadRequest on shape violations.
    return this.segments.create({
      name: parsed.data.name,
      country: parsed.data.country,
      criteria: parsed.data.criteria as never,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<SegmentDetail> {
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      throw new BadRequestException(parsedId.error.flatten());
    }
    const parsedBody = updateSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.flatten());
    }
    const input: Parameters<TgSegmentsService['update']>[1] = {};
    if (parsedBody.data.name !== undefined) input.name = parsedBody.data.name;
    if (parsedBody.data.criteria !== undefined) {
      input.criteria = parsedBody.data.criteria as never;
    }
    return this.segments.update(parsedId.data, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.segments.delete(parsed.data);
  }
}
