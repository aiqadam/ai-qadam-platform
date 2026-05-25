/// <reference types="astro/client" />

import type { SsrAuth } from './middleware';

// `import` above makes this file a module, so `namespace App` would no
// longer be global. Wrapping in `declare global` re-publishes it as the
// global App namespace Astro's typings expect.
declare global {
  namespace App {
    interface Locals {
      // Populated by apps/web-next/src/middleware.ts on every SSR request.
      // null = anonymous (no valid refresh cookie). Mirrors the v1 shape so
      // L1 useAuth() (PR-0d) can read either codebase. The cookie name is
      // intentionally distinct from v1's (aiqadam-next-refresh vs
      // aiqadam-refresh) — see web-migration-plan.md §Cookie isolation.
      auth: SsrAuth | null;
    }
  }
}
