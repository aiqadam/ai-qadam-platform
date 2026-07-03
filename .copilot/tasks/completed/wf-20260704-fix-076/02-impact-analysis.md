# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-076
**Issue:** ISS-UAT-009-3
**Date:** 2026-07-04

## Validated Requirement

ISS-UAT-009-3 — Leaderboard self-row renders the signed-in user's
display name and the `You` self-indicator concatenated with no visible
space, separator, or badge boundary (`UAT MemberYou`). Visual-only
design-system FAIL surfaced by the BP-UAT-009 step-006 screenshot review
(`wf-20260702-uat-058/02b-visual-review.md`). DOM assertion for the step
already passes — only the visual rendering of the self-indicator is
broken.

**Resolution path:** Path A — fix at the source. The leaderboard page
already has a self-highlighting script (`apps/web/src/pages/leaderboard.astro`)
that injects a `.me-chip` span into the `.name` / `.pname` text container.
The chip is being placed **inside** the same element that has
`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. Inside
that overflow-clipped container, the inline-block chip's `margin-left: 8px`
collapses and the chip renders flush against the truncated display name.
Move the chip **out of the text-overflow container** and render it as a
**sibling** to `.name` / `.pname`, wrapped in the design-system
`.badge.mono` pattern so it is visually consistent with the rank label
chips already used elsewhere on the same row.

## Affected Layers

| Layer | Change? | Details |
|---|---|---|
| API (NestJS) | No | Not in scope — no backend behaviour change. |
| DB | No | No schema, migration, or seed change. |
| Shared Types | No | No new types. |
| Frontend `apps/web` (leaderboard page) | **Yes (1 file)** | `apps/web/src/pages/leaderboard.astro` — two changes inside the same file: (1) inject the self-chip as a sibling of `.name` (and `.pname` for podium) instead of appending it as a child inside the ellipsis-clipped text node; (2) add the `badge mono` class to the chip so it picks up the canonical badge pattern. The injected element becomes `<span class="badge mono me-chip">You</span>` — three classes, no new CSS variables, no new colour tokens. |
| Frontend design-system CSS | **Maybe (1 file)** | `design-system/components.css` — only if `.lb-user` needs a flex `gap` adjustment to make the chip sit cleanly to the right of the truncated name. Decision deferred to CodeDeveloper; if the inline `margin-left` on `.me-chip` already produces correct spacing once the chip is moved out of the ellipsis container, no design-system change is needed. **No new tokens, no raw hex, no gradients.** |
| Documentation | **Yes (1 file)** | `docs/02-business-processes/uat/BP-UAT-009.md` — Step 006 expected state re-scoped to explicitly cover the visual assertion (self-row shows `You` chip with clear badge boundary, not concatenated). |

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| _(none)_ | — | No endpoint contract change. | — |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| _(none)_ | — | No service call changes. |

## Component / File Targets (CodeDeveloper scope)

| File | Change | Lines (est.) | Reason |
|---|---|---|---|
| `apps/web/src/pages/leaderboard.astro` | (a) Move the self-chip injection from `nameEl.appendChild(chip)` to `nameEl.insertAdjacentElement('afterend', chip)` (or wrap name + chip in a `display: inline-flex; gap: 6px;` container). (b) Replace `chip.className = 'me-chip'` with `chip.className = 'badge mono me-chip'`. (c) Add `.me-chip` size override (`height: 18px; font-size: 9px`) so the chip stays compact next to the 14px display name. | ~10–15 LOC changed | Root-cause fix: chip must live outside the ellipsis-clipped `.name` container, and must use the canonical badge pattern. |
| `design-system/components.css` (optional) | Add a `.lb-user .me-chip` rule that adds a small left margin if the inline-flex container approach is chosen. **Only if needed.** | ~5 LOC if needed | Polish; defer to CodeDeveloper judgement. |
| `docs/02-business-processes/uat/BP-UAT-009.md` | Step 006: extend expected-state wording from "lands at `/leaderboard`" to also mention "self-row shows `You` badge with visible separation from display name". | ~2–3 LOC | Makes the visual contract explicit for the next UAT runner. |

**Total:** 2 files definitely, 3 files possibly. Well under the §4 PR budget (5 files / 400 LOC).

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Inline `<style>` on `leaderboard.astro` (around the `.me-chip` block) defines `.me-chip` with scoped Astro hashing; dynamically created elements do NOT inherit the scoped hash. | **Medium** | **Confirmed safe.** Astro scopes `<style>` selectors by adding `data-astro-cid-*` attributes to elements, but dynamically created elements inserted via `document.createElement` do NOT inherit the scoped hash. CodeDeveloper must either (a) move `.me-chip` styling to `design-system/components.css` (preferred — keeps the chip globally styled), or (b) add `is:global` directive on the `<style>` block, or (c) use `class:list` on a pre-existing element. |
| Widening Step 006 expected state could mask a future regression where the chip text is correct but the badge boundary breaks. | Low | The visual-review sub-step is already responsible for catching this; the wording change just makes it explicit. AC-2 ("self-row chip renders with clear separation") is unambiguous. |
| `is:global` on the `<style>` block would expose `.lb-row.is-me` and `.podium-card.is-me` to global scope, potentially conflicting with future styles. | Low | These classes are already prefixed with `.lb-row` / `.podium-card` (specific to leaderboard). Renaming `.me-chip` global is fine because it is also leaderboard-specific. Keep the `.is-me` selectors scoped or move them to `components.css` if CodeDeveloper chooses the `components.css` route. |
| The `.badge` class has `height: 22px` which is taller than the 14px display name, so the chip may push the row's vertical alignment. | Low | The `.me-chip` size override (`height: 18px; font-size: 9px`) addresses this; podium's `.pname` already has `margin: 14px 0 2px 0` so a slightly taller chip doesn't break layout. |
| Visual re-verification requires the live stack (`apps/web` + Authentik) to be running for an authenticated session. | Medium | Per AGENTS.md §6.1, Orchestrator pre-flight: `docker compose up -d` + `curl -fsS http://localhost:4321/leaderboard` must return 200, and the Authentik OIDC flow must be live so the signed-in user's row can render. Same pattern used by `wf-20260702-uat-058`. |

### Security Review Required?

**No.** This is a UI-only CSS/DOM change.

- No code paths handling secrets, tokens, cookies, or auth are modified.
- The Authentik flow is unchanged; only the rendering of the post-auth
  `.me-chip` changes.
- No tenant-isolation boundaries touched.
- No new endpoints, no new dependencies.

### Architecture Review Required?

**No.**

- No module boundaries crossed. The change is contained to one Astro page
  + (optionally) one CSS file.
- No cross-schema queries.
- No new dependencies.
- No new colour tokens. The chip reuses the canonical `.badge` + `.mono`
  pattern with `var(--primary)` accent — closed palette per AGENTS.md §11.

## Test Scope

| Level | What | Where |
|---|---|---|
| Unit | None | UI-only; no logic to unit-test. |
| Integration | None | No API / DB change. |
| E2E (Playwright) | Visual-only assertion extension | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` Step 006 — add a DOM-level assertion that the `.me-chip` is a **sibling** of `.name` (i.e. `nameEl.parentElement.querySelector('.me-chip')` not `nameEl.querySelector('.me-chip')`). The screenshot-review sub-step remains the primary visual gate. **Optional** — CodeDeveloper may skip if the DOM assertion is too brittle; the live UAT re-run + visual review is the authoritative check. |
| Live UAT re-run | Full BP-UAT-009 Step 006 | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` against the updated `BP-UAT-009.md` expected state — same orchestration as `wf-20260702-uat-058`. The signed-in user's `me-chip` must render as a badge with visible separation from the display name. |
| Visual screenshot review | `uat-visual-check.sh` + manual pixel inspection | `apps/e2e/uat-results/<run>/step-006-next-param-redirect.png` — `.me-chip` is positioned to the right of the display name with at least 6px gap and a visible 1px border. |

## Architectural Alignment

- Module boundaries: unaffected. Change stays inside `apps/web` (page +
  design-system CSS).
- Cross-schema queries: unaffected.
- Approved stack: unaffected.
- No new dependencies. No new colour tokens.
- Lucide-icon policy: not affected — no icons added or changed.
- Closed palette: chip uses `var(--primary)` only via existing
  `.badge-primary` accent — or plain `.badge` background if teal
  accent on `.is-me` row is desired (both use existing tokens).
- Branch scope: 2–3 files, ≤20 LOC changed. Well under the §4 PR budget.

## Gate Result

gate_result:
  status: passed
  summary: "UI-only fix at one Astro page (and optionally one CSS file); root cause is the `.me-chip` being injected inside the ellipsis-clipped `.name` text container. Move chip to a sibling element with `.badge.mono` classes; no DB, no API, no security, no new tokens."
  findings:
    - "Root cause located at apps/web/src/pages/leaderboard.astro — `nameEl.appendChild(chip)` puts the chip inside the `.name` div which has `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, causing the chip's 8px left margin to collapse against the truncated display name"
    - "The `.badge` + `.badge.mono` pattern is the canonical solution per AGENTS.md §11 and already used for the rank-label chips `01 · GOLD` / `02 · SILVER` / `03 · BRONZE` on the podium — reusing it for the `You` self-indicator keeps the design language consistent"
    - "The `<style>` block on leaderboard.astro uses Astro's scoped CSS by default — dynamically created elements do NOT inherit the scope, so `.me-chip` styling only works if the class is registered globally OR moved to design-system/components.css. CodeDeveloper must handle this (move to components.css, or add `is:global` directive)"
    - "Documentation tightening: BP-UAT-009.md Step 006 expected state should explicitly cover the visual self-row chip rendering so the next UAT runner catches a regression"
    - "Live UAT re-run requires full stack (apps/web + Authentik OIDC) — Orchestrator pre-flight per AGENTS.md §6.1 before marking verified"
    - "No new colour tokens, no raw hex, no gradients, no emoji in product copy — design-system constraints respected"