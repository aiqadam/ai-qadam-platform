import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// ISS-EVT-005-1: public registration-count read for the event-detail page
// (apps/web-next's fetchEvent()). registrations has no Public Directus
// read grant — deliberately, per ISS-RBAC-PERMS-001/ISS-SEC-PUBLIC-UNMANAGED-001
// — so an anonymous visitor cannot enumerate who registered for an event.
// This route runs the aggregate query server-side with apps/api's own
// authenticated DirectusClient and returns only a derived integer, never
// row data, matching the existing public-count precedent in
// event-speaker-briefs.service.ts's registeredCountOf() (same status set).
type AggRow = Array<{ count: { id: number | string } }>;

@Controller('v1/events')
export class EventRegistrationCountController {
  constructor(private readonly directus: DirectusClient) {}

  @Get(':id/registration-count')
  async registrationCount(
    @Param('id', new ParseUUIDPipe()) eventId: string,
  ): Promise<{ registeredCount: number }> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _in: ['registered', 'attended'] } }],
      }),
    );
    const res = await this.directus.get<{ data: AggRow }>(
      `/items/registrations?filter=${filter}&aggregate[count]=id`,
    );
    return { registeredCount: Number(res.data[0]?.count?.id ?? 0) };
  }
}
