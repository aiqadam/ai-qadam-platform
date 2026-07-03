// OnboardingForm.helpers.ts — Pure helpers for OnboardingForm that can be
// imported from `environment: 'node'` vitest tests without dragging the
// JSX component graph into the SSR pipeline.
//
// The web app's vitest config uses `environment: 'node'`, which means jsdom
// is NOT available and any `import` chain that reaches a `.tsx` file fails
// to load. Putting the pure helper in a sibling `.ts` file lets the test
// exercise the empty-`role_groups` fallback logic without rendering the
// component.

const ROLE_GROUPS_EMPTY_FALLBACK = 'an operator';

// ISS-UAT-013-13: pure helper extracted from the inline
// `role_groups.join(', ')` expression in OnboardingForm.tsx so the
// empty-`role_groups` fallback is testable without rendering the
// component. `null` is accepted alongside `undefined` because JSON
// payloads commonly represent missing arrays as `null`.
export function roleGroupsText(groups: string[] | null | undefined): string {
  return groups && groups.length > 0 ? groups.join(', ') : ROLE_GROUPS_EMPTY_FALLBACK;
}
