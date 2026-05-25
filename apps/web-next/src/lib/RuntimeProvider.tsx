// L1 runtime — Astro-friendly composition of the AuthProvider + the
// TanStack QueryClientProvider. Astro hydrates React islands with a
// single component, so we bundle the two providers here.
//
// Usage from Layout.astro:
//
//   import RuntimeProvider from '../lib/RuntimeProvider';
//   const ssrAuth = Astro.locals.auth;
//   <RuntimeProvider client:load initial={ssrAuth}>
//     <slot />
//   </RuntimeProvider>
//
// `initial` is the SSR auth blob — null = anon, undefined = SSR didn't
// run (prerendered page). AuthProvider treats both as anon for v2.

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getQueryClient } from './query-client';
import { AuthProvider, type AuthSnapshot } from './use-auth';

interface RuntimeProviderProps {
  initial: AuthSnapshot | null | undefined;
  children: ReactNode;
}

export default function RuntimeProvider({ initial, children }: RuntimeProviderProps): ReactNode {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initial={initial}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
