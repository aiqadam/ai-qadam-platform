// L1 runtime — per-island provider root.
//
// THE fix for the foundational island bug: Astro hydrates every
// `client:load` component as its OWN React root, and React context does
// NOT cross roots. A single <RuntimeProvider> mounted in Layout.astro
// therefore reached NONE of the page/cabinet islands — every island
// calling useQuery()/useAuth() threw on hydrate ("No QueryClient set" /
// "useAuth outside AuthProvider"). The Layout-level provider was dead.
//
// Each island must instead carry its OWN provider in its OWN root.
// `withRuntime` wraps an island's public export so the thing Astro
// mounts via `client:load` is `<RuntimeProvider><Island/></RuntimeProvider>`
// — provider and consumer in the same React tree, no cross-root
// assumption. getQueryClient() is a browser-wide singleton (query-client.ts),
// so N islands each with their own RuntimeProvider still share ONE
// QueryClient cache + dedup; AuthProvider is cheap to instantiate per root.
//
// The SSR auth blob is read from window.__AIQADAM_AUTH__ (injected once
// by Layout.astro). On the server (Astro's first render of the island)
// window is absent → initial=null; data islands render their
// auth-independent loading state, so server + client first paint match.

import { type ReactElement, type ReactNode } from 'react';
import RuntimeProvider from './RuntimeProvider';
import type { AuthSnapshot } from './use-auth';

function readSsrAuth(): AuthSnapshot | null {
  if (typeof window === 'undefined') return null;
  const blob = (window as unknown as { __AIQADAM_AUTH__?: AuthSnapshot | null }).__AIQADAM_AUTH__;
  return blob ?? null;
}

// Each island's PUBLIC export inline-wraps its inner component in
// <IslandRoot> so the thing Astro mounts via `client:load` carries its
// own RuntimeProvider in its own React root:
//
//   function FooInner(props: Props) { ...useQuery/useAuth... }
//   export function Foo(props: Props): ReactElement {
//     return <IslandRoot><FooInner {...props} /></IslandRoot>;
//   }
export function IslandRoot({ children }: { children: ReactNode }): ReactElement {
  return <RuntimeProvider initial={readSsrAuth()}>{children}</RuntimeProvider>;
}
