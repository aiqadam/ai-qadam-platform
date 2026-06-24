/**
 * FR-MIG-030 — Lighthouse CI config.
 *
 * Asserts performance score >= 90 on v2 (next.aiqadam.org) for the three
 * pages required by the parity gate before production cutover.
 *
 * Run: npx lhci autorun (called by the parity-check.yml GHA workflow).
 * Requires LHCI_GITHUB_APP_TOKEN (GitHub App) or LHCI_TOKEN (server) in env.
 */

/** @type {import('@lhci/cli').LhciConfig} */
const config = {
  ci: {
    collect: {
      url: [
        'https://next.aiqadam.org/',
        'https://next.aiqadam.org/events',
        'https://next.aiqadam.org/leaderboard',
      ],
      numberOfRuns: 3,
      settings: {
        // Simulate realistic network conditions
        throttlingMethod: 'simulate',
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },
    assert: {
      assertions: {
        // FR-MIG-030 parity gate requirement: perf >= 90 on v2
        'categories:performance': ['error', { minScore: 0.9 }],
        // Accessibility also tracked; warn-only to allow incremental fix
        'categories:accessibility': ['warn', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.85 }],
        'categories:seo': ['warn', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};

export default config;
