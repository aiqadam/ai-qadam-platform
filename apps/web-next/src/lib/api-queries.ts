// L1 runtime — TanStack Query hooks for the three reference data
// surfaces called out in docs/architecture/web-migration-plan.md row
// 0d acceptance:
//
//   useMyProfile()    GET /v1/auth/me           — the signed-in user
//   useEvent(id)      GET /v1/events/:id        — public event detail
//   useRegistrations() GET /v1/registrations    — current user's regs
//
// Each hook is intentionally thin — fetch → typed shape, that's it.
// Pages compose these into L4 props that L3 blocks render. Blocks
// MUST NOT import this file (ADR-0038 §Locks #1, enforced by
// packages/biome-config/biome.json overrides).
//
// Adding a new hook? Update docs/architecture/wiring-map.md in the
// SAME PR — the arch-check looks for that touch when the
// wiring-map.md gets cross-referenced from blocks/.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';

// ---------------------------------------------------------------------------
// useMyProfile — /v1/auth/me
// ---------------------------------------------------------------------------

export interface MyProfile {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useMyProfile(): UseQueryResult<MyProfile, Error> {
  return useQuery<MyProfile, Error>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient<MyProfile>('/v1/auth/me'),
  });
}

// ---------------------------------------------------------------------------
// useEvent — /v1/events/:id
// ---------------------------------------------------------------------------

export interface EventDetail {
  id: string;
  title: string;
  description: string;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
  // The full v1 shape lives in apps/web/src/lib/api.ts → ApiEvent. We
  // only declare the fields the v2 reference-block consumers will
  // need today; later PRs extend this interface as Phase-1 blocks
  // come online. Optional everywhere → safe to forward to a card.
  shortDescription?: string | null;
  slug?: string | null;
  venue?: string | null;
  heroImageUrl?: string | null;
}

export function useEvent(id: string | undefined): UseQueryResult<EventDetail, Error> {
  return useQuery<EventDetail, Error>({
    queryKey: ['events', 'detail', id ?? null] as const,
    queryFn: () => {
      if (!id) {
        // useQuery should be disabled via `enabled` when id is empty,
        // but if a consumer fires it anyway we fail loud rather than
        // hitting `/v1/events/undefined`.
        throw new Error('useEvent: id is required');
      }
      return apiClient<EventDetail>(`/v1/events/${encodeURIComponent(id)}`);
    },
    enabled: typeof id === 'string' && id.length > 0,
  });
}

// ---------------------------------------------------------------------------
// useRegistrations — /v1/registrations
// ---------------------------------------------------------------------------

export interface RegistrationRow {
  id: string;
  eventId: string;
  status: 'registered' | 'waitlisted' | 'cancelled' | 'attended';
  registeredAt: string;
}

interface RegistrationsResponse {
  registrations: RegistrationRow[];
}

const REGISTRATIONS_QUERY_KEY = ['registrations', 'me'] as const;

export function useRegistrations(): UseQueryResult<RegistrationRow[], Error> {
  return useQuery<RegistrationRow[], Error>({
    queryKey: REGISTRATIONS_QUERY_KEY,
    queryFn: async () => {
      const body = await apiClient<RegistrationsResponse>('/v1/registrations');
      return body.registrations;
    },
  });
}
