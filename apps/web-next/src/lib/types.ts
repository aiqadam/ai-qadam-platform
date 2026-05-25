// Shared cross-layer types.
//
// Lives outside lib/api-* deliberately so L3 blocks can import the
// shape of data they receive without tripping ADR-0038 §Locks #1
// (which blocks runtime imports of lib/api-*). The intent of the
// lock — "blocks must receive data via props, not fetch their own" —
// is preserved: this file exports interfaces only, no fetchers.
//
// Each new endpoint adds its public payload type here. The fetcher
// in lib/api-ssr.ts or the hook in lib/api-queries.ts re-exports
// for back-compat at the call site.

// ---------------------------------------------------------------------------
// apps/api — events
// ---------------------------------------------------------------------------

export interface ApiEvent {
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
  shortDescription?: string | null;
  slug?: string | null;
  venue?: string | null;
  heroImageUrl?: string | null;
}
