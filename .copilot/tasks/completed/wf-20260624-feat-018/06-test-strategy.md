# Test Strategy — FR-MIG-023

## Overview

FR-MIG-023 introduces UTM URL building for the marketing team. Three components are testable:

1. `src/lib/utm.ts` — Pure validation + URL composition functions
2. `src/components/UtmUrlBuilder.tsx` — React island (integration tests via React Testing Library)
3. Static pages (`press.astro`, `global.astro`, `marketing/url-builder.astro`) — Build verification only

## Unit Test Scope

### `src/lib/utm.ts`

**Functions to test:**

1. `validateUtmField(name, value)` — Per-field validation
   - Required fields: source, medium, campaign reject empty strings
   - Optional field: content accepts empty/null, returns null
   - Case sensitivity: lowercase only
   - Allowed characters: a-z 0-9 - _
   - Forbidden: leading/trailing hyphens, consecutive hyphens, whitespace, {placeholder} syntax
   - Max length: 64 characters
   - Medium special case: must be one of UTM_MEDIUMS values

2. `buildUtmUrl(input)` — Full URL composition
   - Happy path: valid input produces correct URL with all UTM params
   - Optional content: omitted when not provided
   - Error cases: field errors returned as structured errors
   - Existing UTM params: replaced cleanly (not duplicated)
   - Non-UTM params: preserved

3. `parseDestination(value)` — URL parsing
   - Empty string rejected
   - Invalid URL rejected
   - Non-http(s) protocols rejected
   - Valid URLs parsed correctly

### Constants

- `UTM_MEDIUMS` — array of 13 canonical medium values
- `UTM_SOURCE_SUGGESTIONS` — 11 suggestions
- `UTM_MEDIUM_LABELS` — labels for each medium
- `UTM_CAMPAIGN_SUGGESTIONS` — 6 campaign patterns

## Integration Test Scope

### `UtmUrlBuilder.tsx`

- Form renders all fields
- Validation errors display under correct fields
- Success state shows URL when form is valid
- Reset clears all fields
- Copy button uses clipboard API

## What Not to Test

- Astro page routing
- Static page rendering
- CSS/styling
- CMS API calls (would need mock server)

## Test Infrastructure

The `apps/web` project lacks test infrastructure. Will add:
- vitest dependency
- vitest.config.ts
- Basic tsconfig for tests

## Test Execution

```bash
pnpm --filter @aiqadam/web test
pnpm --filter @aiqadam/web typecheck
pnpm --filter @aiqadam/web build
```
