import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DirectusClient } from '../directus/directus.client';

// FR-MIG-021: public endpoint for the check-in operator dropdown.
// Returns events where startsAt <= now <= endsAt + 24h buffer.
// No auth required — the check-in page is open by design.
// Country scoping via query param or X-Tenant middleware.

// Schema for optional filter params.
const ActiveEventsQuerySchema = z.object({
  buffer_hours: z.coerce.number().int().min(0).max(168).optional().default(24),
  country: z.string().length(2).optional(),
});

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
}

@Controller('v1/events')
export class CheckinEventsController {
  constructor(private readonly directus: DirectusClient) {}

  @Get('checkin/active')
  async activeEvents(
    @Query() raw: unknown,
    @Req() req: Request,
  ): Promise<{
    events: Array<{
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      location: string | null;
    }>;
  }> {
    const parsed = ActiveEventsQuerySchema.safeParse(raw);
    const bufferHours = parsed.success ? parsed.data.buffer_hours : 24;
    // Prefer explicit query param; fall back to X-Tenant middleware value.
    const country = parsed.success ? parsed.data.country : req.tenant?.code;

    const now = new Date();
    const nowISO = now.toISOString();
    const bufferMs = bufferHours * 60 * 60 * 1000;
    const upperBound = new Date(now.getTime() + bufferMs).toISOString();

    // Build filters: published, within time window, scoped to country.
    const filterParts: Record<string, unknown>[] = [
      { status: { _eq: 'published' } },
      { starts_at: { _lte: nowISO } },
      { ends_at: { _gte: upperBound } },
    ];

    if (country) {
      filterParts.push({ country: { _eq: country.toLowerCase() } });
    }

    const filter = encodeURIComponent(
      JSON.stringify({
        _and: filterParts,
      }),
    );

    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=id,title,starts_at,ends_at,location&sort=-starts_at&limit=50`,
    );

    return {
      events: res.data.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        location: e.location,
      })),
    };
  }
}
