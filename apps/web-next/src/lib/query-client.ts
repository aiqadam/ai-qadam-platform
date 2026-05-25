// L1 runtime — TanStack Query 5 client factory.
//
// Two creation modes per the standard TanStack SSR pattern:
//
//   * Client: ONE global QueryClient per page load (singleton). Cached
//     entries survive island re-mounts and tab focus, which is what
//     we want for the 30-second freshness window.
//
//   * Server: a NEW QueryClient per SSR render. Sharing a server-side
//     client across requests would leak data between users (one user
//     SSRs a profile, another user's request reads the cached row).
//     With Astro's server output, every render gets its own JS realm
//     anyway — this factory just makes the contract explicit.
//
// Defaults:
//
//   staleTime   30_000   Reads stay fresh 30s — matches v1's
//                        ROUTER_TTL_MS and keeps tab-switching cheap.
//   gcTime      5 * 60_000  Garbage-collected 5 min after the last
//                           subscriber unmounts. Standard TanStack
//                           recommendation.
//   refetchOnWindowFocus  false   v1 doesn't refetch on focus; doing
//                                 so triggered visible flicker on
//                                 every tab switch.
//   retry       false   apiClient already retries on 401; any other
//                       error is a real failure and should bubble.
//                       Hooks can opt-in per-query if they want.

import { QueryClient } from '@tanstack/react-query';

const DEFAULT_STALE_MS = 30_000;
const DEFAULT_GC_MS = 5 * 60_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_MS,
        gcTime: DEFAULT_GC_MS,
        refetchOnWindowFocus: false,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Browser-side singleton. Holds the cache across island re-mounts.
let browserClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: one per render. The caller (RuntimeProvider.tsx) creates
    // it inside the component body so each SSR render gets a fresh
    // instance.
    return createQueryClient();
  }
  if (!browserClient) {
    browserClient = createQueryClient();
  }
  return browserClient;
}
