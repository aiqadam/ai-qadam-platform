# 03-code-summary.md — CodeDeveloper

## Requirement Implemented

FR-MIG-011: `/workspace/announce` — full announcement composer with Tiptap rich-text editor, ActionBar with Preview/Send actions, and confirmation dialog on Send.

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/web-next/package.json` | Modified | Added Tiptap and DOMPurify dependencies |
| `apps/web-next/src/blocks/workspace/AnnounceComposer.tsx` | Modified | Replaced `<textarea>` with Tiptap editor; wired ActionBar for Preview/Send with confirm dialog |
| `apps/web-next/src/blocks/workspace/AnnounceComposer.test.tsx` | Modified | Fixed TypeScript errors (10) and Biome lint issues (4); all 67 tests now pass |
| `docs/03-requirements/FR-MIG-011.md` | Modified | Fixed wrong endpoints: `/v1/admin/cohorts` → `/v1/workspace/cohorts` and `/v1/admin/announcements` → `/v1/workspace/announce` |

## Key Design Decisions

### Tiptap Editor Integration
- Used `@tiptap/react` with `StarterKit` (bold, italic, code) + `Link` + `CodeBlockLowlight` extensions
- Configured Link extension with `openOnClick: false` for security
- Created toolbar with Bold, Italic, Link, and Code buttons using Lucide icons
- Styled the editor to match the design system with proper focus states

### ActionBar Wiring
- Preview action: No confirm dialog, directly calls preview mutation
- Send action: Shows confirmation dialog with `estimatedRecipients` count from last preview
- Used the existing `ActionBar` component's `confirm` prop with `title`, `description`, and `confirmLabel`

### Security: XSS Prevention
- Used `isomorphic-dompurify` to sanitize HTML before sending to API
- Configured DOMPurify with `ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'code']` for Telegram-safe HTML
- Preview pane continues to use `preview.text` (plain text from API) in a `<pre>` block, avoiding `dangerouslySetInnerHTML`

### Test Fixes Applied
1. **MockChain._calls type error**: Extended `MockChain` interface to include `_calls: string[]`
2. **cohorts[1] possibly undefined**: Added null check with optional chaining
3. **Type assertion issue**: Removed `undefined as unknown[]` and updated function signature
4. **Non-null assertions**: Created `getAction()` helper returning `undefined` instead of using `!`
5. **forEach → for...of**: Replaced two `forEach` loops with `for...of` for Biome compliance
6. **Cognitive complexity**: Extracted `parseAttributeList()` and `extractAllowedAttr()` helper functions
7. **Unused imports**: Removed unused `beforeEach` import
8. **Unused variables**: Changed `m` to `_m` for unused parameter

## Architecture Rule Compliance

| Rule | Status | Notes |
|------|--------|-------|
| Service methods: typed I/O, no `any` | Pass | All mutations typed via TanStack Query generics |
| Custom typed errors | N/A | API errors handled via mutation error state |
| All promises awaited | Pass | All async operations properly awaited |
| DB queries: Drizzle only | N/A | No DB changes required |
| Cross-module calls via service interface | Pass | Uses existing `usePreviewAnnounce`, `useSendAnnounce`, `useCohorts` hooks |
| New React component: functional only | Pass | All components are functional React components |
| New React component: no dangerouslySetInnerHTML | Pass | Preview pane uses `<pre>` with text content; body HTML sanitized before API call |

## Formatter Check

- **TypeScript typecheck**: Passed (0 errors)
- **Biome lint**: Passed (no issues in AnnounceComposer.test.tsx)
- **Biome apply**: Clean (all formatting issues resolved)
- **Unit tests**: Passed (169 tests, including 67 in AnnounceComposer.test.tsx)

## Known Limitations

1. **Chunk size warning**: The workspace bundle is 642KB (gzip: 198KB). This is a pre-existing issue and not introduced by this change.
2. **Inline `<style>` tag**: Used for Tiptap placeholder styling. Alternative would be to add CSS to a global stylesheet, but inline style keeps the component self-contained.
3. **No async loading indicator for cohorts**: The `useCohorts` hook already handles loading states.

## Gate Result

```yaml
gate: code-development
agent: code-developer
status: passed
workflow_id: wf-20260623-feat-010
requirement_ref: FR-MIG-011
files_changed:
  - apps/web-next/package.json
  - apps/web-next/src/blocks/workspace/AnnounceComposer.tsx
  - apps/web-next/src/blocks/workspace/AnnounceComposer.test.tsx
  - docs/03-requirements/FR-MIG-011.md
validation_results:
  typecheck: passed (0 errors)
  lint: passed (no issues in test file)
  tests: passed (169 tests, 67 in AnnounceComposer.test.tsx)
architecture_checks:
  module_boundaries: passed
  no_directly_set_inner_html: passed
  html_sanitization: passed (isomorphic-dompurify)
  functional_components: passed
test_fixes_applied:
  - MockChain._calls type added to interface
  - cohorts[1] null check with optional chaining
  - Type assertion fixed (undefined → proper param)
  - Non-null assertions replaced with getAction helper
  - forEach loops converted to for...of
  - Cognitive complexity reduced via helper functions
  - Unused imports/variables removed
next_agent: security-reviewer
```
