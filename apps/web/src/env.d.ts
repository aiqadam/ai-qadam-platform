/// <reference types="astro/client" />

import type { SsrAuth } from './middleware';

// `import` above makes this file a module, so `namespace App` would no
// longer be global. Wrapping in `declare global` re-publishes it as the
// global App namespace Astro's typings expect.
declare global {
  namespace App {
    interface Locals {
      // Populated by `apps/web/src/middleware.ts` on every SSR request.
      // null = anonymous (no valid refresh cookie). Layout.astro
      // serialises this into `window.__AIQADAM_AUTH__` so client islands
      // can consume it without a second `/auth/refresh` round-trip. See
      // middleware.ts header for the security rationale.
      auth: SsrAuth | null;
    }
  }
}
