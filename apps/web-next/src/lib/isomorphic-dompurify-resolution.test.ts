// Regression test for ISS-WEB-NEXT-SSR-JSDOM-001.
//
// jsdom@28.1.0 (a transitive dependency of isomorphic-dompurify, used
// by AnnounceComposer.tsx) requires undici@^7.21.0. The repo's root
// pnpm.overrides.undici (">=7.28.0", open-ended) previously resolved
// jsdom's copy to undici@8.8.0 — a breaking major-version jump that
// removed the internal file (lib/handler/wrap-handler.js) jsdom
// requires directly, crashing every SSR route that shared Astro's
// server bundle with AnnounceComposer.tsx, not just the announce page
// itself. Fixed via a selector-scoped override
// ("jsdom>undici": "7.29.0") in package.json.
//
// This test exercises the REAL installed node_modules resolution path
// (no mocking of isomorphic-dompurify or jsdom) so a future dependency
// bump that reintroduces a similar mismatch fails here in CI, not only
// as a live 500 in production.

import { describe, expect, it } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';

describe('isomorphic-dompurify module resolution (regression)', () => {
  it('imports and sanitizes without throwing a module-resolution error', () => {
    const result = DOMPurify.sanitize('<b>safe</b><script>alert(1)</script>');
    expect(result).toBe('<b>safe</b>');
  });
});
