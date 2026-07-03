import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Doc-coverage regression for ISS-UAT-009-1 (BP-UAT-009 Step 004, 2026-07-02).
//
// The `buildLogoutUrl` comment block in `auth.service.ts` historically
// asserted that a valid id_token_hint would cause Authentik to "skip the
// user-confirmation step and run the invalidation flow silently" —
// treating OIDC RP-Initiated Logout 1.0 §2's "MAY" as if it were "MUST".
// BP-UAT-009 Step 004 proved the assertion false: Authentik 2024.x's
// default-provider-invalidation-flow always renders a confirmation
// interstitial even when a valid hint is present, and the user must
// click "Log out of authentik" to complete the invalidation and reach
// /auth/signed-out.
//
// This test pins the comment so future "optimisations" don't reintroduce
// the false guarantee. It does NOT modify runtime behaviour; it only
// asserts the doc-block accurately describes what Authentik does.
//
// Note: this file intentionally does NOT import anything from
// `src/modules/auth/*` — it is a pure string-grep over the source file.
// That keeps it runnable under ISS-TEST-WEB-001's vitest + vite 8 SSR
// skew (which currently blocks any test that imports a sibling module
// via the `__vite_ssr_exportName__` ReferenceError). Once
// `wf-20260703-fix-066-vitest-bump` lands and vitest can again
// transpile the service module, the three behavioural tests in
// `auth-logout-url.spec.ts` will resume running; this doc-coverage test
// remains the durable regression for the ISS-UAT-009-1 trade-off.
//
// Reference: .copilot/issues/ISS-UAT-009-1.md
//            .copilot/tasks/active/wf-20260704-fix-073/02-impact-analysis.md

describe('auth.service.ts — ISS-UAT-009-1 doc-coverage regression', () => {
  const servicePath = resolve(__dirname, '../src/modules/auth/auth.service.ts');
  const source = readFileSync(servicePath, 'utf8');

  it('does NOT promise silent confirmation skip on valid id_token_hint', () => {
    // The pre-fix comment asserted OIDC RP-Initiated Logout 1.0 §2's "MAY"
    // as if it were a guarantee Authentik would skip the confirmation
    // page. If this phrase returns, the comment has regressed.
    expect(source).not.toMatch(
      /MAY skip the user-confirmation step and run the invalidation flow silently/,
    );
  });

  it('explicitly documents the Authentik confirmation interstitial UX', () => {
    // The fixed comment must mention the actual observed UX so future
    // readers see the trade-off without having to read the issue file.
    expect(source).toMatch(/confirmation interstitial/i);
  });

  it('cites the date and PR that made the trade-off (2026-05-23, PR #234)', () => {
    // Anchors the comment in historical context so the rationale survives
    // any future refactor of the surrounding code.
    expect(source).toMatch(/Trade-off made on 2026-05-23/);
    expect(source).toMatch(/PR #234/);
  });

  it('cites ISS-UAT-009-1 so the trade-off is traceable from the comment alone', () => {
    expect(source).toMatch(/ISS-UAT-009-1/);
  });
});