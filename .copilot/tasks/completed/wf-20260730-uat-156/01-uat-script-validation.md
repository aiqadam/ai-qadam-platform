## UAT Script Validation — BP-UAT-010

**Script file:** docs/02-business-processes/uat/BP-UAT-010.md
**Process ref:** docs/03-requirements/FR-REG-001.md

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| process_ref file exists | PASS | `docs/03-requirements/FR-REG-001.md` exists, status `Shipped`. |
| environment URL present | PASS | `http://localhost:4321` — confirmed matches `apps/api/.env` (`WEB_BASE_URL`) and `apps/e2e/.env.uat` (`UAT_BASE_URL`). Still correct post-FR-EVT-004; the page moved implementation but not host/port. |
| seed_required declared | PASS | `seed_required: true` |
| seed_fixture non-empty (if required) | PASS | 4 fixtures listed: `uat-member`, `uat-event-open-uz`, `uat-event-full-uz`, `uat-member-points-baseline` |
| all steps have action + expected + label | PASS | All 6 steps + 3 negative scenarios have all three fields. |
| negative scenarios present | PASS | 3 negative scenarios (Neg-001, Neg-002, Neg-003). |
| ACs mapped to steps | PASS | AC-1..AC-7 each have at least one step/scenario reference (AC-1: 002,003,Neg-002; AC-2: 003; AC-3: none — see Finding 5; AC-4: 005; AC-5: 001,Neg-001; AC-6: 006,Neg-003; AC-7: 003,004). |
| manifest matches doc fixture table (if `scripts/uat-fixtures/<NNN>.json` exists) | N/A | No `scripts/uat-fixtures/BP-UAT-010.json` exists (only `BP-UAT-001.json`, `BP-UAT-013.json`, `BP-UAT-020.json` exist) — see Finding 4, pre-existing gap not introduced by FR-EVT-004. |

### Task-Specific Findings (against current `apps/web-next` code post-FR-EVT-004)

**1. Step 001 (unauth visitor) — sidebar visibility across tabs: CONFIRMED STILL CORRECT, but component name has drifted.**

Read `apps/web-next/src/blocks/customer/EventDetail.astro` and `apps/web-next/src/pages/events/[id].astro`:

- The `sidebar` slot (containing `RegistrationCTA` + `ShareButtons`) is rendered in the block's `<aside class="lg:sticky lg:top-4 self-start"><slot name="sidebar" /></aside>` **outside** the `<div role="tabpanel">` that gates content by `activeTab`. It renders unconditionally regardless of which lifecycle tab (`upcoming`/`live`/`finished`/`forum`) is active. So the script's implicit assumption — that the registration CTA is always visible regardless of tab state — **holds**.
- However, the component is no longer named `RegistrationSidebar`. It is `RegistrationCTA` (`apps/web-next/src/blocks/customer/RegistrationCTA.tsx`), a client-hydrated (`client:load`) React island rendered inside a plain `<div class="rounded-xl border ...">` card, not inside anything literally called a "sidebar" component (only the surrounding `<aside>` wrapper is sidebar-like, and that's the `EventDetail` block's own layout, unnamed as such in the DOM). BP-UAT-010.md refers to `RegistrationSidebar` by name in Steps 001, 002, 003, 004(implicitly), 005, 006 and both AC-2/AC-4 wording. The Playwright spec (`apps/e2e/tests/uat/BP-UAT-010.spec.ts`) also references "RegistrationSidebar" in comments (lines 9, 136, 142) — this predates FR-EVT-004 and was already stale before this PR (the rename to `RegistrationCTA` is not attributed to FR-EVT-004's diff based on the PR's stated scope of only touching lifecycle tabs/gating/404/venue/photos/recap/livestream — this looks like an earlier, unrelated rename). This is a naming/documentation drift, not a functional break: the spec's actual assertions use text content (`/you're registered/i`, `/sign in to register/i`) and ARIA roles, not a component-name selector, so **the spec will still pass mechanically**. But the script's prose is inaccurate and should be corrected for clarity in future maintenance.
- **This is not a blocking functional gap** — Step 001's expected UI state (Sign-in CTA visible, no Register button, title/description/date/location visible) is still accurate. `AnonCta` in `RegistrationCTA.tsx` renders exactly `t.sign_in_to_register` as a link when `!auth.isAuthenticated`, matching AC-5.

**2. Selector/structure drift from the new tab strip: NO BREAKING CHANGE, but one new consideration.**

- The lifecycle tab strip (`role="tablist"`, 4 tabs: upcoming/live/finished/forum) is new UI on the page that did not exist when BP-UAT-010.md was authored. The script does not mention tabs at all, which is fine since Steps 001–006 all operate in the sidebar (tab-independent) — but Step 001's action ("Navigate to the event detail page... Expected: event title, description, date, and location are visible") implicitly assumes the **default tab is `upcoming`**, which is where date/venue/about content renders (`EventDetail.astro`'s `activeTab === 'upcoming'` block).
- The new page computes `defaultTab` from event timing: `now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming'` (page lines 119-120). For `uat-event-open-uz` (`starts_at` = 7 days from now per the fixture table) and `uat-event-full-uz` (`starts_at` = 14 days from now), `now < startsAtMs` in both cases, so `defaultTab` resolves to `'upcoming'` — the tab where date/venue/description render. **This still matches Step 001's expectation**, but only because both fixtures are far-future events. This is fragile: if a future re-seed changes `starts_at` to be in the past or "now," the default tab would silently become `live` or `finished`, and the event title/date/location assertions in Step 001 (which live in the `upcoming` tab body) would no longer be visible without an explicit `?tab=upcoming` navigation. Recommend the script state the tab assumption explicitly (e.g. "Navigate to `/events/<id>` — relies on default-tab resolution landing on `upcoming` because `uat-event-open-uz`'s `starts_at` is in the future") so a future seed-data change doesn't silently break this step without an obvious diagnosis path.

**3. `environment: "http://localhost:4321"` — CONFIRMED CORRECT**, unaffected by FR-EVT-004 (only page internals changed, not host/port/routing prefix).

**4. Seed fixture compatibility — CONFIRMED functionally compatible for rendering, but the underlying seed mechanism does not exist at all (pre-existing gap, independent of FR-EVT-004).**

- `ApiEvent`'s new fields read by the FR-EVT-004 additions (`latitude`, `longitude`, `mapUrl`, `recapMd`, `livestreamUrl` — see `apps/web-next/src/lib/types.ts` lines 43-57) are all optional/nullable. `VenueMap`, `EventRecap`, `LivestreamPanel` are all designed to render an empty/absent state gracefully when these fields are missing (per the page's own header comment: "Fully empty content... still falls back to the tab's own empty state so the page never looks broken"). So even if `uat-event-open-uz`/`uat-event-full-uz` have none of these fields set, **Step 001 will not break** — the `upcoming` tab's venue-map slot and the (non-default, non-visited-in-this-script) `finished`/`live` tabs will simply render their empty states.
- **However**: neither `uat-event-open-uz`, `uat-event-full-uz`, `uat-member`, nor `uat-member-points-baseline` exist in any seed script or fixture manifest in this repo. `scripts/uat-seed.sh`'s own header comment (lines 1-26) states it seeds only: Directus collections/RBAC bootstrap, two Authentik users (`uat-member@example.com`, `uat-operator@example.com` — note: **different email domain**, `@example.com` not `@aiqadam.test` as BP-UAT-010.md's fixture table and the Playwright spec's defaults assume), and `operator_invites` rows for BP-UAT-013. No `events` domain fixtures are created for BP-UAT-010 anywhere. There is also no `scripts/uat-fixtures/BP-UAT-010.json` manifest (only `BP-UAT-001.json`, `BP-UAT-013.json`, `BP-UAT-020.json` exist), so `pnpm uat:seed --reset BP-UAT-010` has nothing to reset either.
- This means BP-UAT-010 as written **cannot currently be executed against a freshly-seeded stack** — the named events and the points baseline do not exist, and even the member email domain used in the script/spec's defaults (`uat-member@aiqadam.test`) mismatches the one `uat-seed.sh` actually provisions (`uat-member@example.com`). **This gap predates FR-EVT-004 and is not something FR-EVT-004 introduced or worsened** — it's an orthogonal, pre-existing seed-authoring gap. I flag it because my brief specifically asked whether fixtures are "compatible with the new page," and the honest answer is: the fixtures as currently seedable don't exist at all, so compatibility with the new page's optional fields is moot until the fixtures themselves are authored.

**5. AC-3 (confirmation email) mapping — pre-existing softness, unrelated to FR-EVT-004.**

The AC table maps AC-3 nowhere explicitly in a step (Step 003's AC ref line doesn't list AC-3; only the `## Notes` section mentions email verification requires a mail-catcher, deferred if absent). This is a minor pre-existing template gap independent of the FR-EVT-004 trigger for this re-verification; not a new regression, but noting it since the checklist requires "each AC has a step reference."

### Summary

BP-UAT-010's script content is **still structurally and functionally accurate** against the current `apps/events/[id].astro` + `EventDetail.astro` + `RegistrationCTA.tsx` implementation post-FR-EVT-004: the registration CTA renders unconditionally in the sidebar slot regardless of the new lifecycle-tab state, and Step 001's unauthenticated-visitor expectations (Sign-in CTA, no Register button, title/description/date/location visible) still hold because both seed events' `starts_at` values keep the page's computed default tab at `upcoming`. FR-EVT-004 did not break the script. Two non-blocking documentation-accuracy issues were found (stale `RegistrationSidebar` naming; unstated dependency on default-tab resolution) and one pre-existing, more serious gap unrelated to this PR: the seed fixtures BP-UAT-010 depends on (`uat-event-open-uz`, `uat-event-full-uz`, `uat-member-points-baseline`, and the `uat-member@aiqadam.test` email domain) are not actually produced by `scripts/uat-seed.sh` or any `scripts/uat-fixtures/*.json` manifest, so the script cannot be executed end-to-end as written without first authoring that seed data. Per protocol, gaps found here go to `failed-retry` rather than being silently patched by this agent — the script needs correction (or the seed gap needs a companion fix) before UATRunner is invoked.

## Gate Result

gate_result:
  status: failed-retry
  summary: "BP-UAT-010's script survives FR-EVT-004's page changes structurally, but cannot actually run: its event/points seed fixtures do not exist in scripts/uat-seed.sh or scripts/uat-fixtures/, and its member email domain mismatches what uat-seed.sh provisions."
  findings:
    - "No seed mechanism produces uat-event-open-uz, uat-event-full-uz, or uat-member-points-baseline anywhere in the repo (scripts/uat-seed.sh only seeds Directus/RBAC bootstrap, 2 Authentik users, and operator_invites for BP-UAT-013) — BP-UAT-010 cannot be executed as written until this seed gap is closed (pre-existing, not introduced by FR-EVT-004)."
    - "Fixture table's uat-member@aiqadam.test does not match the email domain scripts/uat-seed.sh actually creates (uat-member@example.com) — needs reconciliation regardless of the FR-EVT-004 trigger."
    - "No scripts/uat-fixtures/BP-UAT-010.json manifest exists, so `pnpm uat:seed --reset BP-UAT-010` has no declared fixtures to reset either."
    - "Non-blocking: script and BP-UAT-010.spec.ts still refer to the sidebar component as 'RegistrationSidebar'; actual component is RegistrationCTA (apps/web-next/src/blocks/customer/RegistrationCTA.tsx). Cosmetic only — spec assertions use text/role, not component name, so this does not affect pass/fail."
    - "Non-blocking: Step 001's expectation that event title/date/location render depends on the page's computed defaultTab resolving to 'upcoming', which in turn depends on uat-event-open-uz/uat-event-full-uz's starts_at staying in the future. True today (fixtures spec +7d/+14d) but undocumented as an assumption — recommend stating it explicitly in the script."
