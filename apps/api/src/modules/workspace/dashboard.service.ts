import { Injectable } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// F-S2.4 — country-scoped operator dashboard metrics. Per ADR-0033
// data model. Reads from Directus directly (no Metabase iframe in v1
// — that ships in a Phase 4 ad-hoc-query work item).
//
// Range semantics: `now - days` to `now` for inclusive window. Default
// 30 days. Country filter applied at the events level; registrations
// joined via events.

export type CountryCode = 'uz' | 'kz' | 'tj' | 'xx';

export interface CountryMetrics {
  country: CountryCode;
  range_days: number;
  events_count: number;
  registrations_count: number;
  attended_count: number;
  csat_avg: number | null;
  csat_count: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly directus: DirectusClient) {}

  async countryMetrics(country: CountryCode, rangeDays = 30): Promise<CountryMetrics> {
    const now = new Date();
    const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

    // Events in country, started within range.
    const evFilter = encodeURIComponent(
      JSON.stringify({
        country: { _eq: country },
        starts_at: { _gte: since },
      }),
    );
    const eventsRes = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/events?filter=${evFilter}&fields=id&limit=500`,
    );
    const eventIds = eventsRes.data.map((e) => e.id);

    if (eventIds.length === 0) {
      return {
        country,
        range_days: rangeDays,
        events_count: 0,
        registrations_count: 0,
        attended_count: 0,
        csat_avg: null,
        csat_count: 0,
      };
    }

    // Registrations + attendance for those events.
    const regFilter = encodeURIComponent(JSON.stringify({ event: { _in: eventIds } }));
    const regsRes = await this.directus.get<{
      data: Array<{ id: string; checked_in_at: string | null }>;
    }>(`/items/registrations?filter=${regFilter}&fields=id,checked_in_at&limit=5000`);
    const registrations_count = regsRes.data.length;
    const attended_count = regsRes.data.filter((r) => r.checked_in_at != null).length;

    // CSAT averages from interaction_responses with response_intent=csat_score
    // joined via the event FK landed in F-S1.2 (interaction_responses.event).
    const csatFilter = encodeURIComponent(
      JSON.stringify({
        response_intent: { _eq: 'csat_score' },
        event: { _in: eventIds },
      }),
    );
    const csatRes = await this.directus.get<{
      data: Array<{ payload: { rating?: number } | null }>;
    }>(`/items/interaction_responses?filter=${csatFilter}&fields=payload&limit=2000`);
    const ratings = csatRes.data
      .map((r) => r.payload?.rating)
      .filter((n): n is number => typeof n === 'number');
    const csat_count = ratings.length;
    const csat_avg =
      csat_count > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / csat_count) * 10) / 10
        : null;

    return {
      country,
      range_days: rangeDays,
      events_count: eventIds.length,
      registrations_count,
      attended_count,
      csat_avg,
      csat_count,
    };
  }

  async crossCountryMetrics(rangeDays = 30): Promise<CountryMetrics[]> {
    const countries: CountryCode[] = ['uz', 'kz', 'tj', 'xx'];
    return Promise.all(countries.map((c) => this.countryMetrics(c, rangeDays)));
  }
}
