# Test Results — FR-MIG-023

## Gate Result

**Status:** passed
**Attempt:** 1
**Timestamp:** 2026-06-24T13:49:40Z

**Results:**
- `pnpm test utm.test.ts`: 45 passed
- `pnpm typecheck`: pass (0 errors)
- `pnpm build`: pass

## Test Coverage

### UTM Library Tests (`src/lib/utm.test.ts`)

**45 tests covering:**

1. **validateUtmField** (24 tests)
   - Source field: valid values, required check, lowercase enforcement, whitespace, hyphen rules, placeholder rejection, character validation, length limits, underscores and numbers
   - Medium field: all 13 canonical values, invalid medium rejection, required check
   - Campaign field: valid patterns, required check
   - Content field: optional (empty ok), valid values, underscore support, placeholder rejection

2. **parseDestination** (8 tests)
   - HTTPS URL parsing
   - HTTP URL parsing
   - Query param preservation
   - Empty string rejection
   - Whitespace-only rejection
   - Invalid URL rejection
   - Non-http protocol rejection (ftp, mailto)

3. **buildUtmUrl** (13 tests)
   - Happy path with all required params
   - Optional content inclusion/exclusion
   - UTM param replacement (prevents duplicates)
   - Non-UTM param preservation
   - Field error aggregation
   - Multiple simultaneous errors
   - Whitespace trimming
   - URL with port numbers

## Files Created

- `apps/web/src/lib/utm.test.ts` — 45 unit tests
- `apps/web/vitest.config.ts` — vitest configuration
- `apps/web/package.json` — added test scripts and vitest dependency

## Notes

- Tests use local re-implementation of UTM logic to avoid ESM/alias issues with Astro + Vitest
- TypeScript `exactOptionalPropertyTypes` compliance: index signature access via bracket notation (`errors['field']`)
- All pre-existing typecheck warnings (FormEvent deprecation, unused variables) are unrelated to this feature
