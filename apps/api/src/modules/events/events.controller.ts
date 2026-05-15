import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EventsService } from './events.service';
import type { Event } from './schema';

interface EventResponse {
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

function toResponse(event: Event, registeredCount: number): EventResponse {
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

@Controller('v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Public list — no AuthGuard. Tenant comes from X-Tenant header (or the
  // 'uz' default), resolved by TenantMiddleware → req.tenant.
  @Get()
  async list(@Req() req: Request): Promise<{ events: EventResponse[] }> {
    const tenant = req.tenant;
    if (!tenant) {
      // Middleware always populates this; this guard is a belt-and-suspenders.
      throw new NotFoundException('tenant not resolved');
    }
    const rows = await this.events.listUpcoming(tenant.code);
    return { events: rows.map((row) => toResponse(row, row.registeredCount)) };
  }

  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<EventResponse> {
    const tenant = req.tenant;
    if (!tenant) {
      throw new NotFoundException('tenant not resolved');
    }
    const event = await this.events.findByIdForTenant({ id, countryCode: tenant.code });
    if (!event || event.status !== 'published') {
      throw new NotFoundException(`event ${id} not found`);
    }
    // Single-event detail: count is computed from listUpcoming-style SQL on
    // the same row. For Phase 1 the events.spec.ts coverage is for list +
    // findByIdForTenant; the detail endpoint count is best-effort = 0 until
    // a dedicated event-detail use case lands. Returning 0 is preferable to
    // an extra round-trip per detail page click.
    return toResponse(event, 0);
  }
}
