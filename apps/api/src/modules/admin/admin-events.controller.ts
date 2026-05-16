import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import {
  CapacityTooLowError,
  EventsService,
  type NewEventInput,
  type UpdateEventInput,
} from '../events/events.service';
import type { Event } from '../events/schema';

interface AdminEventResponse {
  id: string;
  title: string;
  description: string;
  format: Event['format'];
  status: Event['status'];
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
}

interface CreateBody {
  title?: string;
  description?: string;
  format?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  capacity?: number | null;
  location?: string | null;
}

interface PatchBody extends CreateBody {}

const FORMATS: ReadonlySet<Event['format']> = new Set([
  'meetup',
  'workshop',
  'hackathon',
  'conference',
  'online',
]);
const STATUSES: ReadonlySet<Event['status']> = new Set(['draft', 'published', 'cancelled']);

function parseCreate(body: CreateBody): NewEventInput {
  const required = ['title', 'description', 'format', 'startsAt', 'endsAt'] as const;
  for (const k of required) {
    if (!body[k]) throw new BadRequestException(`missing required field '${k}'`);
  }
  if (!FORMATS.has(body.format as Event['format'])) {
    throw new BadRequestException(`invalid format '${body.format}'`);
  }
  const status = body.status ?? 'draft';
  if (!STATUSES.has(status as Event['status'])) {
    throw new BadRequestException(`invalid status '${body.status}'`);
  }
  const startsAt = new Date(body.startsAt as string);
  const endsAt = new Date(body.endsAt as string);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new BadRequestException('startsAt / endsAt must be ISO timestamps');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new BadRequestException('endsAt must be after startsAt');
  }
  if (body.capacity != null && body.capacity < 0) {
    throw new BadRequestException('capacity must be >= 0');
  }
  return {
    countryCode: '_unset_', // controller overwrites with tenant
    title: body.title as string,
    description: body.description as string,
    format: body.format as Event['format'],
    status: status as Event['status'],
    startsAt,
    endsAt,
    capacity: body.capacity ?? null,
    location: body.location ?? null,
  };
}

function parsePatch(body: PatchBody): UpdateEventInput {
  const out: UpdateEventInput = {};
  if (body.title !== undefined) out.title = body.title;
  if (body.description !== undefined) out.description = body.description;
  if (body.format !== undefined) {
    if (!FORMATS.has(body.format as Event['format'])) {
      throw new BadRequestException(`invalid format '${body.format}'`);
    }
    out.format = body.format as Event['format'];
  }
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status as Event['status'])) {
      throw new BadRequestException(`invalid status '${body.status}'`);
    }
    out.status = body.status as Event['status'];
  }
  if (body.startsAt !== undefined) {
    const d = new Date(body.startsAt);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('startsAt invalid');
    out.startsAt = d;
  }
  if (body.endsAt !== undefined) {
    const d = new Date(body.endsAt);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('endsAt invalid');
    out.endsAt = d;
  }
  if (body.capacity !== undefined) {
    if (body.capacity != null && body.capacity < 0) {
      throw new BadRequestException('capacity must be >= 0');
    }
    out.capacity = body.capacity;
  }
  if (body.location !== undefined) out.location = body.location;
  return out;
}

function toResponse(event: Event, registeredCount: number): AdminEventResponse {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    format: event.format,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    capacity: event.capacity,
    registeredCount,
    location: event.location,
    countryCode: event.countryCode,
  };
}

@Controller('v1/admin/events')
@UseGuards(AuthGuard, AdminGuard)
@Roles('country_admin', 'super_admin')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(@Req() req: Request): Promise<{ events: AdminEventResponse[] }> {
    const tenant = req.tenant;
    if (!tenant) throw new NotFoundException('tenant not resolved');
    const rows = await this.events.listAllForTenant(tenant.code);
    return { events: rows.map((r) => toResponse(r, r.registeredCount)) };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: CreateBody): Promise<AdminEventResponse> {
    const tenant = req.tenant;
    if (!tenant) throw new NotFoundException('tenant not resolved');
    const input = parseCreate(body);
    input.countryCode = tenant.code;
    const created = await this.events.createForTenant(input);
    return toResponse(created, 0);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Body() body: PatchBody,
  ): Promise<AdminEventResponse> {
    const tenant = req.tenant;
    if (!tenant) throw new NotFoundException('tenant not resolved');
    const patch = parsePatch(body);
    try {
      const updated = await this.events.updateForTenant({ id, countryCode: tenant.code, patch });
      if (!updated) throw new NotFoundException(`event ${id} not found`);
      return toResponse(updated, 0);
    } catch (err) {
      if (err instanceof CapacityTooLowError) {
        throw new BadRequestException(
          `cannot lower capacity to ${err.requested}: ${err.registered} already registered`,
        );
      }
      throw err;
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request): Promise<void> {
    const tenant = req.tenant;
    if (!tenant) throw new NotFoundException('tenant not resolved');
    const ok = await this.events.deleteForTenant({ id, countryCode: tenant.code });
    if (!ok) throw new NotFoundException(`event ${id} not found`);
  }
}
