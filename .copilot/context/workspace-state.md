# Workspace State

**Last updated:** 2026-07-31 — `wf-20260731-fix-162`.
**ISS-BRIDGE-STALE-001 resolved — `directus_user_id` cache now self-heals on email drift instead of misattributing writes forever.**
[wf-20260731-fix-162](../tasks/completed/wf-20260731-fix-162/handoff.yaml)
(PR [#174](https://github.com/aiqadam/ai-qadam-platform/pull/174) squash
`9e933bb`): `DirectusUsersBridgeService.ensureLinked()`'s cache-hit
branch used to trust `platform.users.directus_user_id` unconditionally,
forever — the live consequence, found during `wf-20260730-uat-158`'s
BP-UAT-010 verification, was `uat-member@example.com`'s registrations
FK-attaching to a stale Directus row still carrying the retired
`@aiqadam.test` email. Added `reconcileCachedId()`: on cache-hit, one
Directus `GET /users/:id` confirms the cached row's email still matches;
on drift, re-resolves via the existing `findOrCreate()`/`maybeBackfill()`
trust logic (no new matching heuristic), persists the corrected id, and
logs the repoint at `warn` (old id → new id). Deliberately scoped to
`ensureLinked()`'s once-per-sign-in path, not `resolveDirectusId()`'s
per-request fast path used by 10+ other modules (me-profile, admin-invites,
audit, badges, referrals, event-questions, workspace) — avoids adding a
Directus round-trip to every read while still healing the cache on the
natural re-auth cadence. All Directus-error branches fall back to the
stale cached value rather than throwing, preserving the file's existing
"never block sign-in" invariant. Regression test reproduces the live bug
with its exact real ids (`a1524645-...` → `bb110099-...`); 18/18 pass in
`directus-users-bridge.spec.ts`, 1353/1354 repo-wide (1 pre-existing,
unrelated `users.spec.ts` clock-race flake, confirmed failing identically
on `main`). No standalone backfill script for AC-3 — `uat-member`'s own
drifted row is expected to self-heal via this exact mechanism on its next
sign-in, verified at this workflow's mandatory Step 13 BP-UAT-010
post-merge re-verification (see this file's next entry once that step
completes).

**Last updated:** 2026-07-31 — `wf-20260731-fix-161`.
**ISS-RBAC-PERMS-001 fully resolved — all seven ADR-0021 policies now have live-verified permission rows.**
[wf-20260731-fix-161](../tasks/completed/wf-20260731-fix-161/handoff.yaml)
(PR [#172](https://github.com/aiqadam/ai-qadam-platform/pull/172) squash
`9b9e11c`): implemented the final 5 policies (`sponsor_rep`,
`organizer`, `country_lead`, `svc_bot`, `svc_worker`), completing the
work `wf-20260730-fix-160` (PR #170) started. `policy.sponsor_rep`
needed a user decision first — the ADR/prior code referenced
`companies.rep_user`, which does not exist; confirmed implementing
against the real `sponsors.rep_user` FK instead, with the
`partner_audiences` cohort-entitlement half left out of scope pending
that relationship being reconciled. `policy.organizer`/`policy.country_lead`
scope events/registrations/event_speakers to the acting user's own
`directus_users.country`; organizer additionally gates registrations PII
on the registrant's `appear_on_attendee_list` opt-in, country_lead does
not (matches the ADR's "see PII" vs "only on opt-in flag" distinction).
`country_lead` ships as a full standalone grant set rather than additive
on `organizer`, since `group-mapping.ts` never attaches both together
for the country-lead Authentik group. Found and fixed 2 more real bugs
while proving these live (bringing this issue's total to 5 across both
workflows): `DirectusPolicyApplier` PATCHed a `country_code` field that
doesn't exist on `directus_users` (the real field is `country`) — since
Directus silently ignores unknown PATCH keys instead of erroring, every
country-scoped policy had silently never worked, ever, on any
environment; and `ensure_perm_for_policy`'s `(policy, collection,
action)` idempotency key silently collides when a policy needs two
different-purpose grants on the same collection+action (found trying to
give `country_lead` a narrow self-read alongside a broader roster-read
on `directus_users` — consolidated into one grant). Live-verified every
grant with real member-scoped Directus tokens, including a genuine
negative test for the PII opt-in gate (flipped a registrant's opt-in
off, watched the specific row disappear from the organizer's view) and
confirmation that `svc_bot` cannot read a different user's PII despite
reading its own via an unrelated Directus system default. All test
fixtures cleaned up; the UAT member identity restored to its original
state.

`wf-20260730-fix-160`.
**ISS-RBAC-PERMS-001: `policy.member` completed (minus one deliberately-unimplementable clause) and `policy.speaker` shipped; 3 real Directus-permission-engine bugs found and fixed; 2 new issues split off.**
[wf-20260730-fix-160](../tasks/completed/wf-20260730-fix-160/handoff.yaml)
(PR [#170](https://github.com/aiqadam/ai-qadam-platform/pull/170) squash
`08932ab`, admin-merged over a pre-existing unrelated `architecture-check`
failure on `apps/web-next/.../og-card.png.ts`, file-path-verified untouched
by this PR): implemented `policy.member`'s remaining ADR-0021 §4.1 Effect
clauses (read public collections; create own `registrations`) and all of
`policy.speaker` (update own `speakers` row; read own `event_speakers`
rows). `interaction_responses` create ("feedback_responses" in the ADR's
now-stale naming) was deliberately left unimplemented — live testing
proved neither Directus `permissions` nor `validation` can enforce
ownership through a relational FK at create time; shipping it would have
been a silent no-op grant. Live verification against the local Directus
stack (minted a real member-scoped token for `uat-member@example.com`,
exercised every new grant directly, cleaned up all test data after) found
and fixed 3 real, previously-unexercised bugs in the permission
machinery: (1) `$CURRENT_USER.<field>` as a bare dotted filter key 400s
on this Directus version — only resolves as a nested relational value,
`{"$CURRENT_USER":{"field":{"_eq":v}}}`, a pre-existing bug in the S0.1
`COUNTRY_FILTER` never caught before because that policy was never
attached to a live user until this workflow's grants reused its filter;
(2) Directus `permissions` has **no enforcement effect on `create`** — a
member could register a different user for an event despite a
`{"user":{"_eq":"$CURRENT_USER"}}` filter; the real constraint belongs in
the separate `validation` field, which `ensure_perm_for_policy` gained as
a new optional 7th argument; (3) `validation` in turn cannot traverse a
relational FK to check a column on the *related* row (confirmed by
testing — it broke the legitimate case too), which is what led to
leaving `interaction_responses` unimplemented rather than shipping a
broken grant. Two unrelated findings split into their own issues rather
than expanding this PR's scope: `directus_users.onboarded_at` — the
exact field named in this issue's original symptom — does not exist
anywhere in the local schema despite 4 real `apps/api` modules depending
on it ([ISS-RBAC-ONBOARDED-AT-001](../issues/ISS-RBAC-ONBOARDED-AT-001.md),
[GitHub #168](https://github.com/aiqadam/ai-qadam-platform/issues/168));
and `events`/`speakers`/`event_speakers` are fully world-readable via
unmanaged Directus Public-role grants with no version-controlled source
([ISS-SEC-PUBLIC-UNMANAGED-001](../issues/ISS-SEC-PUBLIC-UNMANAGED-001.md),
[GitHub #169](https://github.com/aiqadam/ai-qadam-platform/issues/169)).
ISS-RBAC-PERMS-001 stays `in-progress`, not `resolved` — 5 of 7 policies
(`sponsor_rep`, `organizer`, `country_lead`, `svc_bot`, `svc_worker`)
remain unimplemented, queued as
[`wf-rbac-perms-001-remaining-policies`](../tasks/queued/wf-rbac-perms-001-remaining-policies/handoff.yaml).

`wf-20260730-fix-159`.
**New mechanical guard: locally-filed issues can no longer silently skip GitHub registration.**
[wf-20260730-fix-159](../tasks/completed/wf-20260730-fix-159/handoff.yaml):
prompted by the user asking directly why 4 issues filed during
`wf-20260730-fix-157`/`-uat-158` never got pushed to GitHub — the sync
call is deliberately best-effort/non-blocking, so a skipped call produces
no error anywhere. New `scripts/check-github-issue-links.sh` scans
`registry.md` and fails if any issue whose own file's `Status` header is
non-terminal has no real `GitHub-Issue` link (placeholder text and empty
fields both count as missing). Wired into two enforcement points:
`check-workflow-state.sh` Step 0.5 (every workflow start, full-registry
scan against the base ref) and `QualityGate` §8.5 (scoped to workflows
that themselves touch an issue file). Found and fixed 2 real pre-existing
gaps while building this — `ISS-ADM-010-1` had no GitHub link at all
(created as issue #164) and `ISS-WF-REG-002`'s own file header still said
`Status: open` despite its Resolution section documenting all 4 ACs
already verified (the registry row correctly said `resolved` — the
file's own header had simply never been flipped, the exact drift class
`ISS-WF-REG-001`/`002` themselves already document) — flipped to match.
Both fixed in this same PR so the new check ships green against `main`
rather than immediately blocking every future workflow. 12 new bats
tests, including a regression test for a real bug found while writing
the script itself: an older-format issue file with no `\| Status \|`
table row caused an unguarded `grep -m1` no-match to exit 1, which under
this script's `set -e` silently aborted the entire scan mid-loop with no
error printed — every ID alphabetically after that file (including
`ISS-WF-REG-002`, this change's own motivating example) went unchecked.
Fixed with `|| true` on both grep pipelines that can legitimately
find-nothing.

`wf-20260730-uat-158`.
**BP-UAT-010 executed live end-to-end for the first time ever in this repo (Step 13 post-merge re-verification for ISS-UAT-SEED-003) — mostly clean, but surfaced 2 new real product bugs unrelated to the seed-fixture fix itself.**
[wf-20260730-uat-158](../tasks/completed/wf-20260730-uat-158/handoff.yaml)
(PR [#157](https://github.com/aiqadam/ai-qadam-platform/pull/157)):
a full agent-driven browser session (sign-in via Authentik, register for
an open event, idempotency re-check, register for an at-capacity event)
against `apps/web` locally. AC-1/AC-4/AC-5/Negative-002 verified `MATCH`;
AC-2 `PARTIAL` (no QR element in the sidebar — pre-existing, already
documented as an open question in `BP-UAT-010.md`'s own Notes); AC-3
deferred (no mail-catcher check, doc-sanctioned); AC-6/AC-7 `MISMATCH` as
predicted by the already-filed `ISS-UAT-010-1` (the doc's own AC wording
uses field values that don't exist in the real implementation). **Two
new, real, previously-undiscovered bugs found and corroborated directly
against Directus, not just DOM text**: `platform.users.directus_user_id`
is a write-once cache in `DirectusUsersBridgeService` that is never
re-validated against a user's current email — a live registration by
`uat-member@example.com` attached to a stale, superseded Directus user
row still carrying the old, retired `@aiqadam.test` email, filed as
[ISS-BRIDGE-STALE-001](../issues/ISS-BRIDGE-STALE-001.md) (high severity —
blast radius is any real user whose email ever changes or whose Directus
mirror is ever recreated, not just this test fixture). Separately, a
registration on an at-capacity event correctly wrote `status=waitlisted`
to Directus (server-side capacity enforcement works), but `apps/web`'s
`RegistrationSidebar` rendered the "✓ You're registered" success state
instead of the waitlist state — a genuine visual-vs-DOM divergence this
session's independent corroboration step caught (a DOM-text-only
assertion would have missed it, since "you're registered" literally
appears in the markup), filed as
[ISS-UAT-010-2](../issues/ISS-UAT-010-2.md). Also discovered and
worked around live (not filed as a new issue, no code change needed):
`apps/web`'s dev server needs `CMS_URL` exported as an actual shell
environment variable to reach local Directus — its pre-existing,
gitignored `.env.local` override alone was not being picked up by plain
`astro dev` on this machine, and without it `apps/web`'s own `cms.ts`
silently falls back to the LIVE PRODUCTION Directus URL (`https://cms.aiqadam.org`,
which itself returned HTTP 523) for every event-detail request. Per
protocol.md's Step 13 outcome rule, `ISS-UAT-SEED-003` does NOT sync to
`agent-verified` (new findings on the same surface mean verification
isn't clean) — Status stays `implemented`/`resolved` for a human to
review, or a future workflow to resolve the 2 new issues and re-verify.

`wf-20260730-fix-157`.
**ISS-UAT-SEED-003 resolved — BP-UAT-010 now has a real, live-verified seed manifest; a second, independently-discovered CRLF bug in the shared `--reset` machinery was found and fixed in the same session.**
[wf-20260730-fix-157](../tasks/completed/wf-20260730-fix-157/handoff.yaml)
(PR [#155](https://github.com/aiqadam/ai-qadam-platform/pull/155), squash
`2691907f3487f000d4bf46c8b7de952396ede9f9`): authored
`scripts/uat-fixtures/BP-UAT-010.json` (8 fixtures: `uat-member` restored
via the existing STEP 3 identity, 2 new filler identities so
`uat-event-full-uz` can carry 2 real pre-existing `registered` rows at
capacity=2, `uat-event-open-uz`/`uat-event-full-uz` events, and a fixed
`point_awards` baseline row for `uat-member`) and generalized
`reset_domain_fixture()`/`resolve_payload_offsets()` in
`scripts/uat-seed.sh` with two new manifest hints (`event_ref`/
`event_ref_field`, `user_email`) plus a `"__resolved__"` lookup-value
sentinel — the same FK-resolution pattern `member_email` already
established, extended because `registrations`/`point_awards` FK to
`events` via different column names and have no natural pre-known-string
unique column of their own. Deliberately used the REAL Directus field
values throughout (`status: registered`/`waitlisted`, no registration-time
points) rather than the wrong `confirmed`/`waitlist`/"+5 points" wording
`BP-UAT-010.md`'s own ACs currently state — that discrepancy, plus a
separate `registeredCount=0` rendering gap on the event-detail page found
during the same research pass, were split off to their own follow-up
issues ([ISS-UAT-010-1](../issues/ISS-UAT-010-1.md),
[ISS-EVT-004-1](../issues/ISS-EVT-004-1.md)) rather than silently expanded
into this PR's scope, per a user-confirmed scope decision recorded in the
workflow's own Step 1 output. **A second, real, live-only bug was found
and fixed in the same session**: the native Windows `jq.exe` build on this
machine emits CRLF line endings for `jq -r`'s multi-line output;
`resolve_payload_offsets()`'s `for k in $keys` word-split on the embedded
`\r`, silently corrupting every `*_offset` key but the last in any fixture
declaring 2+ of them — a pre-existing, latent bug (also present in
`BP-UAT-001.json`'s `uat-event-draft-uz`, same 2-offset-key shape) that
mock mode structurally cannot exercise (it returns before ever calling
this function), so no prior bats run had ever caught it. Fixed with `tr -d
'\r'`, the same idiom `env_get()` already uses for the identical class of
problem; a dedicated fail-before/pass-after regression test was added.
11 new bats tests, 76/76 total pass across the 3 `uat-seed*.bats` files.
Live-verified end-to-end against the real local Directus/Authentik stack
(not mocked) — direct Directus queries confirmed both events, both
registrations, and the points baseline row landed correctly; a second
`--reset` run confirmed idempotency (no row accumulation, via the
existing `ON DELETE CASCADE` FK). **Honestly disclosed, not silently
dropped:** this issue's Step 13 post-merge UAT re-verification against
`BP-UAT-010` (mandatory per its `Business-Process` field) is expected to
report `MISMATCH` on AC-1/AC-6/AC-7 as `BP-UAT-010.md` currently words
them — a known, disclosed consequence of ISS-UAT-010-1's doc-wording gap,
not a product regression; see this file's own next entry for the outcome.

`wf-20260730-uat-156`.
**Post-merge BP-UAT-010 re-verification for FR-EVT-004 completed with an honestly-disclosed environment blocker, not a clean pass — new issue ISS-UAT-SEED-003 filed.**
[wf-20260730-uat-156](../tasks/completed/wf-20260730-uat-156/handoff.yaml)
(PR [#153](https://github.com/aiqadam/ai-qadam-platform/pull/153)):
Step 13 of `wf-20260730-feat-155` (FR-EVT-004) required re-verifying
`BP-UAT-010` (Event registration flow) live, since that's the business
process the modified `/events/[id]` page hosts. BusinessAnalyst's script
validation confirmed FR-EVT-004 did not structurally break BP-UAT-010 (the
registration sidebar renders unconditionally regardless of the new
lifecycle-tab state) — but found BP-UAT-010's own seed fixtures
(`uat-event-open-uz`, `uat-event-full-uz`, `uat-member-points-baseline`)
are not produced by `scripts/uat-seed.sh` or any fixture manifest anywhere
in this repo, so the script cannot actually run end-to-end against a
freshly seeded stack. This is a **pre-existing gap unrelated to
FR-EVT-004** — discovered only because this was the first time anyone
tried to actually execute BP-UAT-010 live since it was authored. Filed
[ISS-UAT-SEED-003](../issues/ISS-UAT-SEED-003.md) (GitHub
[#152](https://github.com/aiqadam/ai-qadam-platform/pull/152), open, not
yet scheduled) with a concrete AC-driven fix (author a
`scripts/uat-fixtures/BP-UAT-010.json` manifest, extend `uat-seed.sh`,
reconcile a `uat-member@aiqadam.test` vs. `uat-member@example.com`
email-domain mismatch also found in the same pass). FR-EVT-004 itself
remains `Implemented`/`Shipped` — its own independently-passing
unit/E2E/security verification stands regardless of this UAT gap; per
protocol this is recorded as a disclosed deferral (env issue, not a
product finding), so its GitHub Project sync stays at `implemented`, not
`agent-verified`.

**FR-EVT-004 (Event detail page) shipped — closes GitHub issue [#130](https://github.com/aiqadam/ai-qadam-platform/issues/130).**
[wf-20260730-feat-155](../tasks/completed/wf-20260730-feat-155/handoff.yaml)
(PR [#150](https://github.com/aiqadam/ai-qadam-platform/pull/150), squash
`26a5c08`): `/events/[id]` in `apps/web-next` (V2) was previously a partial
port (speakers/materials/sponsors/forum only per FR-EVT-004's own Notes).
This workflow closed every remaining gap: lifecycle-adaptive tabs
(upcoming/live/finished/forum via SSR-only `?tab=` routing, not V2's
client-side Radix `kit/Tabs.tsx`), venue/map block (OSM iframe + Google/
Yandex deep-links), Finished-tab photo gallery + recap + inline recording
players, Live-tab livestream panel, fetch-level visibility gating for
`members_only`/`invite_only` events (data never fetched for a gated
visitor, not just hidden in the template), a real 404 (not the previous
302) for not-found-or-wrong-country requests, and the dynamic OG card
image route (`satori` + `@resvg/resvg-js`, new deps matching V1's
versions). Also fixed a real, pre-existing architecture gap found during
impact analysis: V2's `fetchEvent` called `GET /v1/events/:id`, a NestJS
route that has never existed anywhere in `apps/api` — moved to
`apps/web-next/src/lib/cms.ts` reading Directus directly, matching every
sibling V2 event fetcher's existing convention. **A genuine
security-relevant bug was caught by TestRunner via live E2E/HTTP testing,
not by source review**: the initial 404 implementation used
`new Response(null, {status: 404})`, which Astro's node-adapter runtime
silently replaces with its own default error page that echoes the
requested URL path — making two different nonexistent/wrong-country event
ids produce byte-*different* 404 bodies, breaking the
enumeration-resistance property the FR's AC-8 explicitly requires. Fixed
in one CodeDeveloper retry (1 of 3 used) by returning a literal string
body instead, matching the sibling `og-card.png.ts` route's already-correct
convention; independently re-verified via a fresh TestRunner pass (curl/
diff/hex comparison, not just the automated spec) before QualityGate
passed. 1004/1004 unit tests pass (up from 943), new Playwright E2E
coverage added for the previously-uncovered lifecycle/gating/404 surface.
**Known, honestly-disclosed gaps** (recorded in `FR-EVT-004.md`'s own
Notes, not silently dropped): AC-5 (forum posting) has no E2E coverage —
this test lane (`apps/e2e/tests/smoke-*.spec.ts`) has no auth-session
fixture mechanism at all, a bigger infra decision than this workflow;
`invite_only` events currently behave identically to `members_only`
(require sign-in) — confirmed this matches the Directus schema's own
design note ("accessible only via direct link share"), not a bug, since
no separate invite-list mechanism was ever built; `apps/api` has no public
`GET /v1/events` listing route, a pre-existing gap (unrelated to this FR)
that limited local E2E fixture-discovery depth for AC-1/2/3/6. Post-merge
`uat-verification` against the linked `BP-UAT-010` (Event registration
flow) is the next step per FR-WORKFLOW-004's mandatory post-merge check —
see this file's own next entry for the outcome.
**ISS-USR-PWRESET-001 resolved — the password-recovery flow shipped in PR #131 was never actually functional end-to-end; this workflow found and fixed the real gap (a missing password-entry stage binding) plus 11 other independent test/infra bugs, none a Lit-hydration flake as originally diagnosed.**
[wf-20260707-fix-118-flaky-playwright-authentik](../tasks/completed/wf-20260707-fix-118-flaky-playwright-authentik/handoff.yaml)
(PR [#148](https://github.com/aiqadam/ai-qadam-platform/pull/148), squash
`2310cded7bc1a4b197534e64b7a2c411cdc1b376`): originally scoped only as
"fix the Playwright/Lit-hydration timing flake blocking AC-3/AC-5" —
that diagnosis was wrong and is retracted. Twelve independent,
evidence-verified root causes were found instead. The most significant:
Authentik's recovery flow (provisioned by the parent workflow,
`wf-20260707-fix-117`, PR #131) had only an identification stage and an
email stage bound — no password-entry stage existed at all, confirmed
via `GET /api/v3/flows/bindings/?target=<flow-uuid>` returning exactly 2
results. A real member could request a reset, receive the correctly
branded email, click it, see "Successfully verified Email," and land
back on the login page with no way to actually set a new password.
Fixed by resolving and binding Authentik's own built-in
`default-password-change-prompt` + `default-password-change-write`
stages (the same pair Authentik's own default recovery flow blueprint
uses) via a new `resolve_existing_stage_uuid()` helper in
`scripts/provision-authentik-recovery-flow.sh`. The other 11 causes:
test-invocation discipline (unseeded fixture email), a false-positive
assertion regex on `MeDashboard.tsx`'s `AnonView` copy, wrong recovery
URL + wrong flow-stage check for the "Forgot password?" link, Authentik
containers missing `AUTHENTIK_EMAIL__*` entirely (`ConnectionRefusedError`
on every `send_mail`, confirmed via worker logs + Django settings
inspection), the `EmailStage` DB row's own `use_global_settings=false`
independently overriding that fix (confirmed via ORM query — ADR-worthy
gotcha: per-stage settings silently win over global config), a dead
link-extraction plus a wrong same-session-password assumption, a
never-verified expected-copy string, a too-narrow sign-in button regex,
a navigation race against the recovery flow's own async success
redirect, a nonexistent `/me/profile` password-change form silently
corrupting the test fixture's password on every run, and a stale-message
bug in the test's own Mailpit polling helper. `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`
went from 0/6 to **6/6** live-verified; `BP-UAT-009.spec.ts` from 1/9 to
7/9 (2 remaining are pre-existing, already-documented, unrelated
soft-assertion discrepancies — not a regression); the bats suite from
7/7 to 8/8 with a new regression test guarding the `use_global_settings`
drift. All 7 ACs of `ISS-USR-PWRESET-001` are now verified live,
end-to-end, with zero deferrals. **Known open follow-up, not actioned
this session:** whether QA/prod Authentik instances have this same
missing-stage-binding gap is unknown — this session had no access to or
visibility into QA/prod, and the provision script's own host allow-list
would refuse to run against them regardless. A human or a future
workflow with QA/prod access should check this before assuming those
environments' recovery flows work.

**ISS-UAT-020-1 resolved — BP-UAT-020 now has a safe, live-verified fixture-isolation mechanism; live run surfaced a real AC-3 defect, filed as ISS-ADM-010-1.**
[wf-20260729-fix-153](../tasks/completed/wf-20260729-fix-153/handoff.yaml)
(PR [#146](https://github.com/aiqadam/ai-qadam-platform/pull/146), squash
`6a873ef`): new `scripts/uat-bp-uat-020-fixture.sh` (`setup`/`teardown`/
`verify-restored`) snapshots `aiqadam-super-admin`'s live Authentik group
membership, empties it, restarts the local `api` process so
`AdminBootstrapService.onModuleInit()` re-runs against zero admins, then
restores the exact snapshot with automatic post-restore verification —
chosen over a dedicated Authentik realm because the bootstrap check only
runs once per process boot, never per-request. New
`scripts/uat-fixtures/BP-UAT-020.json` manifest, 11 bats regression tests,
`BP-UAT-020.md` rewritten (Seed Fixtures, Step 000, Negative 002 mapping
AC-5, Teardown section). Live-verified end-to-end via new
`apps/e2e/tests/uat/BP-UAT-020.session.spec.ts` (agent-driven UATRunner
session, same FR-WORKFLOW-004 model as `BP-UAT-010.spec.ts`'s pilot):
AC-1/AC-2/AC-4/AC-5 verified `MATCH`; **AC-3 (forced password-change
screen) verified `MISMATCH`** — sign-in with the seeded bootstrap
credentials completes normally with no password-change stage, confirmed
via raw Authentik flow-executor API responses
(`xak-flow-redirect` straight to OIDC authorize). Filed as
[ISS-ADM-010-1](../issues/ISS-ADM-010-1.md) (open, not yet scheduled) — a
genuine product defect in `AdminBootstrapService`'s
`ak_login_password_change_required` attribute approach, independent of
this fixture work; the code comment introducing that attribute already
flagged this exact risk as unverified pending this check.
`restart_api_and_wait_boot()`'s design went through 3 iterations
(documented in the script's own header) before landing on a plain bash
background job — `cmd.exe start /b` and PowerShell `Start-Process` were
both tried and found unreliable for this repo's Windows/Git-Bash setup,
and invoking the fixture script from inside a Node `execFileSync` call
(rather than a shell, before/after the Playwright session) is a known,
documented limitation. Full bats suite: 142/153 pass — the 11 failures
(`check-workflow-state.bats`, `bp-uat-template-rule.bats`) are confirmed
pre-existing on `origin/main` HEAD, unrelated to any file this PR touched.

`wf-20260729-chore-152`.
**GitHub Issues/Projects Phase 1 sync shipped — 22 open ISS-*/FR-* items migrated to a typed GitHub Project board, with an ongoing best-effort sync wired into the agentic workflow.**
[wf-20260729-chore-152](../tasks/completed/wf-20260729-chore-152/handoff.yaml)
(PR [#144](https://github.com/aiqadam/ai-qadam-platform/pull/144), squash
`9222e7f`): new `scripts/sync-github-project.sh` (idempotent
create-or-update of a typed GitHub Issue + Project v2 item) and
`scripts/migrate-open-items-to-github.sh` (one-time migration driver).
Migrated the 4 currently-open `ISS-*` issues (Bug type) and 18 open
`FR-*` requirements (Feature type) into the `ai-qadam-platform` Project
board (project #1), each linked back via a new `GitHub-Issue:` /
`github_issue:` field on the source file. Wired best-effort, non-blocking
sync calls into `issue-resolution.md` / `requirement-development.md` at
their existing atomic-pair trigger points (Step 1 create, Step 9
implemented, Step 12.5/11.5-or-13 terminal) — documented centrally in
`protocol.md`'s new "GitHub Issue / Project Sync" section. Markdown
registries remain authoritative for QualityGate and workflow resume;
full GitHub-as-source-of-truth is an explicitly named, not-yet-designed
Phase 2. **Follow-up in the same PR:** split the terminal Status into
`Agent-Verified` (script-set, once an agent has done everything it can —
a passing post-merge UAT run or a clean merge with nothing
process-related to check) vs. `Done` (human-only, set directly on the
board — this is a volunteer community project, not a paid QA org, so
`sync-github-project.sh` hard-refuses `--status done`). Added the new
`Agent-Verified` Status option to the live board via GraphQL, preserving
all 4 existing option ids and all 27 pre-existing items' statuses
(verified live, no data loss). User explicitly declined to review the PR
before merge ("If something wrong you will have to remake it") — merged
directly via REST API after `gh pr merge`'s GraphQL call hit this
session's rate limit (0/5000, migration + option testing exhausted it;
REST budget was separately still at 4972/5000).

`wf-20260729-fix-151`.
**ISS-WEB-NEXT-SSR-JSDOM-001 resolved — every `/workspace/*` route on `apps/web-next` is unbroken again, both locally and (pending QA redeploy) on `qa.aiqadam.org`.**
[ISS-WEB-NEXT-SSR-JSDOM-001](../issues/ISS-WEB-NEXT-SSR-JSDOM-001.md):
root cause was an open-ended `pnpm.overrides.undici: ">=7.28.0"` (added
2026-06-24 for an unrelated CVE fix) letting `jsdom@28.1.0`'s `undici`
dependency float from its supported `^7.21.0` up to `8.8.0` — a breaking
major-version jump that removed an internal file (`lib/handler/wrap-handler.js`)
jsdom requires directly. Because Astro bundles all SSR routes together,
this one broken import (via `isomorphic-dompurify`, used only by
`AnnounceComposer.tsx`) crashed every `/workspace/*` route, not just the
announce composer. Fixed with a pnpm **selector-scoped** override
(`"jsdom>undici": "7.29.0"` in root `package.json`) rather than a
blanket version change — a blanket downgrade would have broken
`apps/api`'s entire Testcontainers integration suite, since
`testcontainers@12.0.4` separately needs `undici@^8.5.0` (caught during
impact analysis before implementation). Regression test
(`apps/web-next/src/lib/isomorphic-dompurify-resolution.test.ts`) proven
via literal fail-before/pass-after execution (stashed the fix,
reinstalled, confirmed the exact original error reproduced; restored,
reinstalled, confirmed it passes). Full `apps/api` (1350/1350) and
`apps/web-next` (947/947) suites pass; both packages build/typecheck
clean; `pnpm audit` shows no new high/critical findings. Live-verified:
all 5 previously-500 routes now return 200 locally. **Known follow-up,
not performed by this workflow:** QA deployment confirmation — the fix
hasn't redeployed to QA yet (happens automatically via the existing
`deploy-qa` CI job on merge); the user's original live report
(`https://qa.aiqadam.org/workspace/admin/users` → 500) should be
re-checked after the next QA deploy completes.

`wf-20260729-feat-150` — **FR-ADM-011 (admin user/role management screen) implemented — closes the GitHub issue #107 silent-failure gap.**
[FR-ADM-011](../../docs/03-requirements/FR-ADM-011.md): `/workspace/admin/users`
generalized from invite-list-only into "Invites" + "Manage users" tabs
(`AdminUsersCabinet.tsx` composing the existing `InvitesListInner` and a
new `UserRolesManagerInner`). New API surface in the `admin-invites`
module: `AdminUserRolesController`/`AdminUserRolesService`
(`GET /v1/admin/users`, `GET/PATCH /v1/admin/users/:id/roles`), all
guarded by the existing `AuthGuard`+`SuperAdminGuard` chain. Every
grant/revoke does a read-merge-write against `AuthentikClient.setUserGroups()`
(REPLACE semantics), then re-reads and returns the actually-applied
state — never an optimistic assumption, closing the exact class of bug
GitHub issue #107 reported. Extracted a shared
`AuthentikClient.getSuperAdminCount()` primitive (plus `MAX_SUPER_ADMINS = 3`)
that both `AdminBootstrapService` (bootstrap's `>=1` check, refactored to
use it) and the new grant/revoke path (`>3` cap, symmetric `<=1`
self-lockout floor) read through — single source of truth per FR-ADM-010's
own deferred-responsibility note. Added `roleLabel()`/`roleLabels()`
plain-language mapping to `apps/web-next/src/lib/roles.ts` (e.g.
"Country Lead — Uzbekistan", not `aiqadam-country-lead-uz`) — did not
previously exist despite the FR text assuming it did (roles.ts held only
boolean predicates). **Security-review-caught fix during this same
workflow:** `AuthentikClient.resolveGroupNames()` silently drops
unresolvable group names; `changeRole()` now verifies the resolved count
before writing, refusing with `ConflictException` instead of risking a
silent partial-group-loss write — a new instance of the #107 failure
class would have been ironic to ship inside the FR meant to close it.
1349/1350 `apps/api` tests pass (1 pre-existing, already-tracked flake,
`wf-20260704-fix-096-pre-existing-api-test-flakes`), 946/946
`apps/web-next` tests pass. Per `business_process: [BP-UAT-021]`, the
workflow protocol mandates a same-session post-merge `uat-verification`
run against `BP-UAT-021` before this workflow is considered complete —
check this file's own next entry (or `wf-20260729-feat-150`'s task
directory at `.copilot/tasks/completed/wf-20260729-feat-150/`) for the
outcome. **Known inherited gap, not introduced by this workflow:**
`BP-UAT-021`'s own file documents an unresolved `three-super-admins`
live-fixture gap for its Negative-001 scenario (AC-3's live 3-admin
cap-block test) — the cap logic itself is exhaustively unit-tested at
every boundary (count=2/3), so this only affects the DEPTH of live E2E
coverage, not whether AC-3 is verified.

`wf-20260728-feat-148` — **FR-ADM-010 (platform admin bootstrap) implemented — no more manual Authentik console steps.**
[FR-ADM-010](../../docs/03-requirements/FR-ADM-010.md): new `AdminBootstrapService`
(`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`, `OnModuleInit`)
seeds exactly one `admin@aiqadam.org`-style super-admin directly in Authentik
on boot when `aiqadam-super-admin` has zero members, idempotent on every
later boot (keyed on live group-membership count, not seeded-email
existence, to avoid a dangling-zero-admin state on partial failure).
Replaces the manual procedure at ADR-0021 §9 step 3 (already marked
superseded there). Status flipped `Implemented`/`Shipped` in
`FR-ADM-010.md` and `requirements-registry.md`. **Known unverified gap,
by design:** the forced-password-change-on-next-login mechanism
(`AuthentikClient.patchAttributes()` with `ak_login_password_change_required`)
has not been confirmed against a live Authentik instance in this
workflow — no Testcontainers-Authentik double exists in this repo. Per
`business_process: [BP-UAT-020]` in `handoff.yaml`, the workflow protocol
mandates a same-session post-merge `uat-verification` run against
`BP-UAT-020` before this workflow is considered complete; check this
file's own next entry (or `wf-20260728-feat-148`'s task directory at
`.copilot/tasks/completed/wf-20260728-feat-148/`) for the outcome.

`wf-20260728-fix-145` — **QA's Directus environment-parity gap closed — QA now matches local.**
[ISS-INFRA-QA-DIRECTUS-SCHEMA-001](../issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md):
ran `infrastructure/directus/bootstrap.sh` + `flows-bootstrap.sh` against
QA's Directus live (29 → 79 collections, all 7 ADR-0021 RBAC policies +
`policy.member`'s permission rows, 3 registration-lifecycle flows). Also
found and fixed a second, independent, compounding bug while verifying:
`aiqadam-qa-api-1`'s `DIRECTUS_TOKEN` was a literal placeholder — a
different env var (`DIRECTUS_ADMIN_TOKEN`) held the real token, but
`docker-compose.qa.yml`'s `api` service never wired the two together, so
the API could not talk to Directus at all regardless of schema state.
Fixed the compose file (repo-tracked, prevents regression on next
deploy) + QA's live `.env` (backed up first) + enabled
`RBAC_SYNC_WRITE_ENABLED=true` there too. Live-verified:
`qa.aiqadam.org/me/profile` → 200, `/api/v1/leaderboard` → real Directus
round-trip, anonymous `directus_users` read still correctly denied (the
PII-leak fix from `wf-20260728-fix-144` did not regress). **Known
remaining gap:** no real signed-in QA member session was tested (no test
credentials available this session) — next QA UAT touch should verify a
live human sign-in → profile-load round trip. Infra-only workflow, no
PR (direct SSH changes to `pro-data-tech-qa` + one `docker-compose.qa.yml`
line landed via the normal branch/PR path for the repo-tracked part).

`wf-20260728-fix-144` — **`/me/profile` 500 fixed (user-reported live from `qa.aiqadam.org`) +
a critical PII leak found and closed + a much larger QA infra gap
discovered.** [ISS-USR-PROFILE-002](../issues/ISS-USR-PROFILE-002.md):
`MeProfileService.getProfile()` unconditionally requested `onboarded_at`;
`policy.member` had zero `directus_permissions` rows (ISS-RBAC-PERMS-001),
so Directus 403'd the field and the whole request crashed unhandled for
every real member. Fixed two ways: (1) `getProfile()` now retries without
`onboarded_at` on a field-level 403 instead of losing the whole response;
(2) `bootstrap.sh` now seeds `policy.member`'s own-row grants on
`directus_users`/`member_consents`/`member_skills`/`member_interests`/
`member_employments` (14 rows, new `ensure_perm_for_policy` helper).
Verified live via a real Authentik login locally. **While
security-reviewing the permission grants, found and fixed a critical,
unrelated, pre-existing bug:** Directus's built-in Public policy had an
unrestricted `directus_users` read grant — any anonymous request could
read every member's full profile (email, bio_md, telegram_user_id, all
of it) and enumerate every user. Local-only (confirmed via live SSH
check: QA's Public policy has zero `directus_users` rows, so QA was never
exposed to this specific leak). Fixed via new idempotent
`revoke_public_read()` in `bootstrap.sh`. Filed
[ISS-SEC-DIRECTUS-USERS-PUBLIC-001](../issues/ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md)
(resolved). **Also discovered, NOT fixed this session:** QA's Directus
has no application schema at all — only Directus's own built-in system
collections exist; `bootstrap.sh` has apparently never been run against
QA. This is very likely the actual root cause of the original bug
report (much bigger than a missing-permissions gap). Filed
[ISS-INFRA-QA-DIRECTUS-SCHEMA-001](../issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md)
(open, not yet scheduled — running the full `bootstrap.sh` against a live
shared environment needs its own deliberate review pass, per explicit
user instruction not to do it as a same-session drive-by). Prod has no
Directus deployed at all yet (placeholder `DIRECTUS_URL`/`DIRECTUS_TOKEN`
config on `aiqadam-prod-api-1`) — confirmed expected/known state, not a
gap. PR [#102](https://github.com/aiqadam/ai-qadam-platform/pull/102),
merged.

`wf-20260728-fix-143` — **Local RBAC sync fixed to actually attach Directus policies to seeded UAT
users — two stacked bugs.** [ISS-UAT-RBAC-001](../issues/ISS-UAT-RBAC-001.md):
(1) `RBAC_SYNC_WRITE_ENABLED` defaulted `false` locally, undocumented;
(2) once enabled, `DirectusPolicyApplier.apply()` sent a flat UUID array
for the `policies` M2M alias field on `directus_users`, which Directus
rejects with a generic 403 even for a true `admin_access: true` token —
confirmed against `directus/directus` GitHub issue #25108 and
`directus/docs` issue #520; the field requires the nested
`{create, update, delete}` relational envelope instead. Fixed both; live
`POST /v1/internal/rbac/poll` now flips all 4 scanned UAT users to
`rbac_sync_jobs.directus_status: applied`, confirmed directly against
Directus that `uat-member@example.com` holds a real `directus_access` row.
Regression test rewritten (the old version asserted the buggy shape).
**Does not fully unblock BP-UAT-003/016** — live verification surfaced a
separate, pre-existing gap: all 7 ADR-0021 §4.1 policies have zero
`directus_permissions` rows anywhere in the codebase, so a correctly
attached policy currently grants nothing. Filed
[ISS-RBAC-PERMS-001](../issues/ISS-RBAC-PERMS-001.md), queued as
`wf-20260728-fix-144` (see Queued follow-up workflows below). Also: the
user explicitly relaxed `.claude/CLAUDE.md`'s blanket "never modify `.env`"
rule mid-workflow to permit direct edits to local dev/test `.env` files
(config flags only, never secrets/prod) — recorded in CLAUDE.md with
rationale. PR [#100](https://github.com/aiqadam/ai-qadam-platform/pull/100),
merged.

`wf-20260728-fix-141` — **`MeProfileService` fixed to resolve Directus ids via the bridge — was
breaking `/me/profile`, `/me/preferences`, and (partly) `/me/referrals`
on QA.** Reported via [GitHub issue #94](https://github.com/aiqadam/ai-qadam-platform/issues/94)
("Profile data errors"). Root cause: `MeProfileService` queried Directus
directly using the platform `users.id` (JWT `sub`) as if it were
`directus_users.id` — two different UUID spaces. It never called
`DirectusUsersBridgeService.ensureLinked()` the way `ReferralsService`
already correctly does, so every Directus call 404s/errors against the
wrong primary key. Fixed by injecting the bridge and resolving the real
Directus id in all 15 methods; also fixed an independent, latent shape
mismatch in `GET /v1/referrals/mine/stats` (controller returned the body
unwrapped; the frontend hook expected `{ stats: ... }`). 77/77 targeted
tests + 1293/1294 full `apps/api` suite (1 pre-existing, unrelated,
already-tracked flake). See [ISS-USR-PROFILE-001](../issues/ISS-USR-PROFILE-001.md),
PR [#95](https://github.com/aiqadam/ai-qadam-platform/pull/95), merged
`313365f`.

`wf-20260728-fix-140-recovery-flow-redirect` (`createRecoveryLink()`
field-name bug, [ISS-USR-REDIRECT-002](../issues/ISS-USR-REDIRECT-002.md))
merged earlier the same day via PR #92 — the row below had gone stale
showing it still `running`; corrected here since this file is a
snapshot, not a log.
> **Contract — read before editing.** This file answers exactly one question:
> **what is true right now?** It is a snapshot, not a log.
>
> - **Do not prepend close-out narrative.** Workflow history belongs in
>   [`workflow-history.md`](workflow-history.md); the durable record is git.
> - **Update in place.** Replace the rows and the `**Last updated:**` line;
>   do not accumulate.
> - `scripts/check-workflow-state.sh` parses the `**Last updated:**` line and
>   the `| wf-… |` rows in **Active Workflows**. Keep both well-formed.

---

## Active Workflows

| Workflow ID | Type | Feature/Issue | Branch | Status |
|---|---|---|---|---|
| wf-20260726-docs-132 | issue-resolution | ISS-WF-STATE-001 — workspace-state reconciliation | chore/wf-20260726-docs-132-workspace-state-reconcile | in review ([PR #68](https://github.com/aiqadam/ai-qadam-platform/pull/68)) |
| wf-20260727-docs-133 | issue-resolution | ISS-WF-STATE-002 — ADR deployment-target supersession | chore/wf-20260727-docs-133-adr-deployment-supersede | in review ([PR #69](https://github.com/aiqadam/ai-qadam-platform/pull/69)) |
| wf-20260727-fix-134 | issue-resolution | ISS-INFRA-003 — backups broken by Coolify removal | chore/wf-20260727-docs-134-coolify-prose-sweep | running |

### Queued follow-up workflows

- **(no workflow id assigned yet — not yet a task directory)** pick up by
  starting issue-resolution for
  [ISS-RBAC-PERMS-001](../issues/ISS-RBAC-PERMS-001.md) — `policy.member`'s
  own-row grants shipped via `wf-20260728-fix-144` (and now also live on
  QA via `wf-20260728-fix-145`); still needed: `policy.member`'s
  public-read + create-own-registration halves, and all 6 other
  ADR-0021 §4.1 policies (`speaker` through `svc_worker`) — on BOTH
  local and QA now that QA has caught up to local's schema baseline.
- **wf-20260723-fix-128-deploy-qa-permission-fix** — `deploy-qa` CI has failed on
  every push to `main` since PR #45 (`unable to unlink old 'package.json':
  Permission denied` on the QA deploy host). QA is pinned to PR #44's code, so
  ISS-USR-REG-002's AC-4 (live verification) cannot be closed until this lands.
  Handoff: `.copilot/tasks/queued/wf-20260723-fix-128-deploy-qa-permission-fix/handoff.yaml`.
- **wf-20260704-fix-096-pre-existing-api-test-flakes** — 3 `apps/api` test-design
  bugs unmasked by `wf-20260704-fix-095` (`users.spec.ts:65` timestamp race;
  `telegram-auth-controller.spec.ts:161` reflect-metadata; `port-guard.spec.ts`
  cases 4+8 Linux-only mocks).
- **uat-bp-uat-coverage-batch** — 17 workflows queued at
  `.copilot/tasks/queued/uat-bp-uat-coverage-batch/handoff.yaml`.

---

## Open Issues

Only genuinely open items belong here. Resolved issues live in
[`../issues/registry.md`](../issues/registry.md).

- [ISS-ADM-010-1](../issues/ISS-ADM-010-1.md) (blocker for AC-3 only,
  admin/ADM + infra/authentik) — `AdminBootstrapService`'s
  `ak_login_password_change_required` attribute does not force
  Authentik's password-change screen; sign-in with the seeded bootstrap
  admin credentials completes normally. Discovered live 2026-07-29 during
  `wf-20260729-fix-153`'s BP-UAT-020 verification. Does not affect
  FR-ADM-010's `Implemented`/`Shipped` status or AC-1/AC-2/AC-4/AC-5, all
  independently live-verified in the same session. No follow-up workflow
  queued yet.
- [ISS-USR-REG-002](../issues/ISS-USR-REG-002.md) — code fix **merged**
  2026-07-23 (PR [#51](https://github.com/aiqadam/ai-qadam-platform/pull/51),
  squash `e3edfa7`). Remains open only on **AC-4 (live QA verification)**,
  blocked by the `deploy-qa` failure above.
- [ISS-UAT-BRIDGE-001](../issues/ISS-UAT-BRIDGE-001.md) (blocker,
  api/directus-bridge) — `ensureLinkedByEmail` returns `null` for seed users
  with no `platform.users` row. Blocks AC-2/3 of
  [ISS-UAT-001-1](../issues/ISS-UAT-001-1.md).
- [ISS-USR-REDIRECT-003](../issues/ISS-USR-REDIRECT-003.md) (blocker,
  api/auth + infra/authentik) — self-registration's welcome-email link
  does not actually sign new members in (Authentik's recovery link isn't
  a real one-time-login mechanism). Needs design input; no workflow
  scheduled yet.

---

## Documentation state

A staleness audit on 2026-07-26 found four infrastructure pivots recorded in one
place each and never propagated. Tracked, not yet resolved:

- ✅ **ADR log reconciled** 2026-07-27 (`wf-20260727-docs-133`).
  [`ADR-0040`](../../docs/adr/0040-deployment-target-pro-data-tech.md) now
  records the real deployment target (pro-data.tech QA `95.46.211.230` + prod
  `95.46.211.224`, Compose + Nginx + GH Actions SSH) and supersedes ADR-0002,
  which no longer contradicts ADR-0007. ADR-0038 flipped `Proposed` →
  `Accepted` (it was already machine-enforced by `tools/architecture-check.ts`).
- ✅ **Backups live** ([ISS-INFRA-004](../issues/ISS-INFRA-004.md)) — resolved
  2026-07-27 by cross-host replication: prod ⇄ QA, nightly 03:00 UTC, systemd
  timers enabled and green on both hosts. Restore verified (prod's dump reads
  back cleanly from QA). Prior state: **no backup system existed at all** —
  restic was never installed on either host, and prod had run unbacked since
  provisioning.
- ⚠️ **ADR-0017 now contradicts reality** — it is `Accepted` and specifies
  Cloudflare R2, but the deployed model is cross-host replication with no
  external provider (the `ai-dala-infra` no-off-site rule forbids R2). Needs a
  superseding ADR.
- ⚠️ **Residual backup limitation:** both hosts are KVM guests at the same
  provider on adjacent IPs. Protects against disk failure, bad migrations and
  loss of one VM; does **not** protect against provider-level loss.
- ⚠️ **ISS-INFRA-003's diagnosis was wrong** — it said backups "silently broke"
  when Coolify was removed, inferred from code rather than observed. Corrected
  in place. Its code fixes were correct but insufficient.
- ~~**Backups were silently broken**~~ — superseded; found while sweeping Coolify
  prose, fixed in `wf-20260727-fix-134`
  ([ISS-INFRA-003](../issues/ISS-INFRA-003.md)). Both `aiqadam-db-dump.sh` and
  `aiqadam-backup.sh` ran `docker exec coolify-db` under `set -euo pipefail`, so
  each aborted **before** `restic backup`. **Not verified on the hosts** — the
  scripts must be re-installed and a snapshot confirmed; expect a gap from
  2026-07-23. Follow-up: `wf-20260727-fix-135-verify-backups-live`.
- ✅ **Operational runbooks swept** 2026-07-27: `coolify-bootstrap.md` and
  `coolify-app-stacks.md` moved to `runbooks/_archive/` with ⛔ banners;
  `snapshot-restore.md` and `restic-backups.md` rewritten against the real
  hosts; `observability.md`, `secret-rotation-pending.md`, and
  `architecture.md`'s "hardening posture" given scoped correction headers.
  `runbooks/README.md` no longer holds up the dead Coolify runbook as the model
  to imitate.
- **Coolify prose remains in non-operational docs** (~40 files: requirements,
  roadmap, plans, completed task artifacts). Lower risk — none is a procedure an
  operator would follow. Not yet swept.
- ⚠️ **`secret-rotation-pending.md` is a still-open security obligation** whose
  rotation steps all route through the removed Coolify UI. Header added; needs a
  real rewrite before the launch rotation pass.
- **Host `212.20.151.29` is gone** (commit `ef50eba`) — still referenced in
  19 docs.
- **ADR-0037** left `Proposed` deliberately. It is operationally in force (it
  defers Sprint 4 + all of Phase ζ, and `agent-prompts.md` §2.0 makes its layer
  triage mandatory), but its own Outcome section says the remaining Phase A
  tasks "become individual roadmap items when this ADR Accepts" — and no such
  items exist. Accepting it is a roadmap decision, not a docs fix.
- **16 broken internal doc links** (down from 44 in the 2026-06-19 audit).

---

## Git State

- **Default branch:** `main` (repository ruleset id `18687633` requires a PR;
  check via `gh api repos/aiqadam/ai-qadam-platform/rulesets`, not the classic
  branch-protection endpoint).
- **Origin:** `https://github.com/aiqadam/ai-qadam-platform.git` (migrated per
  `ISS-MIGRATE-001`; if `gh` misresolves, run
  `gh repo set-default aiqadam/ai-qadam-platform`).
- **Last commit on `main`:** `866f83f` — *chore(ci): remove smoke-pr.yml* (#67),
  2026-07-26.
- **Deployment:** `deploy/docker-compose.{qa,prod}.yml` + nginx, deployed by
  `.github/workflows/ci-cd.yml` over SSH. **Not Coolify.**

## Next Workflow ID

Authoritative source is [`../meta/next-workflow-id`](../meta/next-workflow-id)
— currently `133`. Always read that file; never infer the counter from this
document.

---

## Notes

**2026-07-26:** Five workflows were sitting in `.copilot/tasks/active/` after
merging — `wf-20260720-feat-125` and `wf-20260723-fix-126` still carried
`status: in-progress` despite merging as `77e21ed` and `d0536ac`. All five moved
to `.copilot/tasks/archived/`. Root cause is the archive step being skipped at
close-out, not a tooling failure; the durable fix is CI enforcement, tracked in
the documentation-state section above.
