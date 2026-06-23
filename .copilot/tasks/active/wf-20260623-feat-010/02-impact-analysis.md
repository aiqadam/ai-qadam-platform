# 02-impact-analysis.md — ImpactAnalyzer

## Validated Requirement

**FEAT-MIG-011** — `/workspace/announce` full announcement composer (L3 block). Replaces a plain `<textarea>` with a Tiptap rich-text editor and wires the existing `<ActionBar>` block for Preview/Send actions with a confirmation dialog.

---

## Affected Layers

### API (NestJS)

| Module | Status | Notes |
|--------|--------|-------|
| `apps/api/src/modules/workspace/announce.controller.ts` | **No change** | Already implements `POST /v1/workspace/announce/preview` + `POST /v1/workspace/announce` with Zod validation. Body field accepts any string up to 20,000 chars — rich-text HTML fits within that limit. |
| `apps/api/src/modules/workspace/announce.service.ts` | **No change** | Same shapes; no server-side HTML sanitization of the body field (API treats it as an opaque string, Listmonk handles rendering). |
| `apps/api/src/modules/workspace/cohorts.controller.ts` | **No change** | Already serves `GET /v1/workspace/cohorts`. |

### DB Changes Required

**No.** Neither the `cohorts` table (already exists via Directus) nor any announcements table needs schema changes. No Drizzle migrations required.

### Shared Types

**No change.** `AnnouncePreview`, `AnnounceSent`, `CohortRow`, and `ConsentBasis` are already defined in `apps/web-next/src/lib/types.ts` and re-exported via `apps/web-next/src/lib/use-announce.ts`.

### Frontend

| File | Change | Scope |
|------|--------|-------|
| `apps/web-next/package.json` | Add `tiptap`, `@tiptap/react`, and Telegram-safe HTML extensions | New dependency |
| `apps/web-next/src/blocks/workspace/AnnounceComposer.tsx` | Replace `<textarea>` with Tiptap editor; add `<ActionBar>` with Preview (no confirm) + Send (confirm dialog showing estimated recipients) | Core implementation |
| `apps/web-next/src/blocks/workspace/ActionBar.tsx` | **No change** | Already supports `confirm` prop with dialog; already has `ActionButton` that wraps in `ConfirmDialog` |

### Bot

**No change.** The bot has no role in announcement composition.

### Workers

**No change.** Dispatch is handled synchronously by `AnnounceService` calling `InteractionsService` — no new queue jobs introduced.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| `GET /v1/workspace/cohorts` | GET | None — already exists | No |
| `POST /v1/workspace/announce/preview` | POST | None — already validates and returns `AnnouncePreview` | No |
| `POST /v1/workspace/announce` | POST | None — already validates and returns `AnnounceSent` | No |

The frontend body field changes from plain text to HTML string, but the API's `z.string().trim().min(1).max(20_000)` schema already accepts any string. No contract change required.

---

## Cross-Module Calls

| Caller | Called | Via | Notes |
|--------|--------|-----|-------|
| `AnnounceComposer.tsx` (web-next) | `usePreviewAnnounce`, `useSendAnnounce` hooks | TanStack Query | Already wired; no change |
| `AnnounceComposer.tsx` (web-next) | `useCohorts` hook | TanStack Query | Already wired; no change |
| `AnnounceComposer.tsx` (web-next) | `<ActionBar>` block | Direct import | Already exists at `src/blocks/workspace/ActionBar.tsx` |

**No cross-module service calls introduced.** All data flows through existing service interfaces.

---

## Risk Flags

### Security Review Required

**Yes — XSS prevention for rich-text HTML.**

The Tiptap editor outputs HTML. The current `PreviewCard` renders `preview.text` as plain text inside a `<pre>` block, which is safe. However:

1. **The editor body stored in React state is HTML**, not plain text. When sent to `POST /v1/workspace/announce`, it is the raw HTML string.
2. **The API does not sanitize the body field** — it passes it as an opaque string to `InteractionsService` and Listmonk. Listmonk handles email rendering, which has its own HTML sanitization. This is acceptable for the email channel but means any future consumer of the body field must sanitize.
3. **The preview pane currently shows `preview.text` (plain text from API)** — safe. If the implementation ever tries to render the raw body HTML from state in the preview, it must use DOMPurify.
4. **No `dangerouslySetInnerHTML` is currently used in `AnnounceComposer.tsx`** for the body field. This invariant must be preserved — any rendered HTML preview must go through `DOMPurify.sanitize()`.

**Recommendation:** Add `isomorphic-dompurify` to `apps/web-next/package.json` alongside Tiptap. If the preview pane ever needs to render rich-text output (not the API's plain-text fallback), use:

```tsx
import DOMPurify from 'isomorphic-dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(richTextHtml) }} />
```

The security baseline (`docs/04-development/security/security.md`) explicitly requires `DOMPurify.sanitize()` for any `dangerouslySetInnerHTML` usage.

### Architecture Rule Risks

| Rule | Assessment |
|------|-----------|
| **Module boundaries** | PASS. All changes confined to `apps/web-next/`. No reaching into API internals. |
| **No cross-schema queries** | PASS. Cohorts come from Directus via API; dispatch uses `InteractionsService` — all through explicit interfaces. |
| **No new NestJS modules** | PASS. Controller and service already exist. |
| **Stack deviation** | ACCEPTABLE. Tiptap is a standard React rich-text editor, widely used with React 19 and Astro. `@tiptap/react` is the canonical integration. No exotic packages. |
| **ADR-0038 locks** | PASS. Changes stay within L3 blocks + L1 hooks. `AnnounceComposer.tsx` is an L3 block using existing L1 hooks. No violations of the "no runtime API calls in blocks" rule. |

---

## Test Scope

| Layer | Type | Scope |
|-------|------|-------|
| Tiptap editor | Unit | Test that bold/italic/link/inline code toolbar buttons produce correct HTML output. Mock `usePreviewAnnounce` and `useSendAnnounce`. |
| ActionBar wiring | Unit | Test that Preview action calls preview mutation; Send action opens confirm dialog; confirm fires send mutation. |
| Empty cohorts guard | Unit | Already tested implicitly; confirm no regression. |
| Success state | Unit | Test `SentSummary` renders `interactionId` and delivery breakdown. |
| Error state | Unit | Test error renders inline with message. |
| E2E flows | Playwright | Full happy-path: pick cohort → write subject + body with formatting → Preview → confirm dialog shows recipient count → confirm → delivery summary. |
| CI gate | `pnpm lint` + `pnpm typecheck` + `pnpm build` | Required; no new skip flags. |

**No Testcontainers / database integration tests needed** — no DB schema changes, and the existing announce endpoints are exercised via E2E Playwright.

---

## Gate Result

```yaml
gate: impact-analysis
agent: impact-analyzer
status: passed
workflow_id: wf-20260623-feat-010
requirement_ref: FR-MIG-011
files_to_change:
  - apps/web-next/package.json
  - apps/web-next/src/blocks/workspace/AnnounceComposer.tsx
  - docs/03-requirements/FR-MIG-011.md
dependencies_to_add:
  - tiptap
  - "@tiptap/react"
  - "@tiptap/starter-kit"
  - "@tiptap/extension-link"
  - "@tiptap/extension-code-block-lowlight"
  - isomorphic-dompurify
gates_passed:
  - db-migration-author: not-needed
  - no-cross-module-risk
  - no-cross-schema-queries
  - no-new-nestjs-modules
  - xss-mitigated-via-dompurify-recommendation
flagged_issues:
  - type: security-xss
    description: "Tiptap outputs HTML. Any dangerouslySetInnerHTML usage in AnnounceComposer or sibling blocks must be wrapped in DOMPurify.sanitize(). Add isomorphic-dompurify alongside Tiptap."
  - type: documentation-error
    description: "FR-MIG-011.md says cohorts load from /v1/admin/cohorts; actual endpoint is /v1/workspace/cohorts. Fix in requirement doc."
notes:
  - "API layer fully implemented; only L3 block needs work."
  - "ActionBar.tsx already supports confirm dialog with recipient count display via description prop."
  - "PreviewCard currently renders preview.text (API plain-text fallback) — safe, no DOMPurify needed for current render path."
  - "Tiptap Telegram-safe extensions: StarterKit (bold, italic, code) + Link + CodeBlockLowlight cover the required subset (bold, italic, links, inline code)."
next_agent: code-developer
```
