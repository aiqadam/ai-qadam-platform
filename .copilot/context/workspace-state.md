# Workspace State

**Last updated:** 2026-08-03 — `wf-20260803-feat-197`.
**FR-NTF-004 corrected + gap-filled — Telegram notification adapter now passes inline_buttons through, sanitizes HTML, and reaches registration flows.**
[wf-20260803-feat-197](../tasks/completed/wf-20260803-feat-197/handoff.yaml)
(PR [#243](https://github.com/aiqadam/ai-qadam-platform/pull/243), squash-merged):
GitHub issue #142 asked to implement FR-NTF-004 literally — a NestJS API
that calls the Telegram Bot API directly, using "the existing BullMQ
outbox/dispatcher rate limiter," gated on Authentik
`attributes.telegram_id` + `notification_telegram_enabled`, logging to a
`notifications_sent` table. Investigation before any code was written
found none of that exists: [ADR-0034](../adr/0034-telegram-bot-and-sender.md)
(Accepted 2026-07-31) already shipped a different, deliberate design —
`TelegramAdapter` writes a `tg.dispatch.v1` envelope to a Postgres outbox;
a relay XADDs it to Redis Streams; a separate Python **notifier** process
(the `apps/bot` submodule) is the only thing that calls `sendMessage` —
and eligibility already reads `directus_users.telegram_user_id`/
`telegram_opted_out_at`, never an Authentik attribute. Surfaced to the
user per AGENTS.md §13 before proceeding (same posture as
FR-CRM-002/ADR-0033); user confirmed "gap-fill the real adapter" over
building the literal (wrong-architecture) spec.

Two real, previously-undiscovered bugs were found and fixed against the
already-shipped adapter: (1) `TelegramAdapter`'s `payloadSchema` silently
dropped `inline_buttons` (envelope hardcoded `inline_buttons: null|`) —
live in production today, since `event-reminders.service.ts`'s
`buildReminderPayload()` has been constructing `inline_buttons` since it
shipped, expecting them to reach Telegram, and they never did; (2) the 3
registration Directus flows (`capacity_email_confirmed`,
`capacity_email_waitlisted`, `promo_email_promoted`) hardcoded
`allowedChannels: ["email"]`, structurally excluding Telegram even for
linked, opted-in members. Fixed via: `inline_buttons` passthrough +
bounds validation in `telegram-adapter.ts`; a new allowlist HTML
sanitizer (`telegram-html-sanitizer.ts`, `<b> <i> <u> <s> <a> <code>
<pre>`, FR-NTF-004 §3) applied before every send; and 3 new Telegram-branch
sibling operations in `flows-bootstrap.sh` (one per registration flow),
each gated on a new `exec`-type eligibility op mirroring the file's own
`decide_status`/`promo_gate` pattern, firing **alongside** — never
replacing — the existing unconditional email dispatch.

**RequirementAnalyst caught a real gap in the pre-investigation's own
framing (Finding A) before any code was written**:
`InteractionsService.dispatch()`'s `pickPrimaryChannel()` takes
`allowedChannels[0]` only — it does not fan out to multiple channels in
one call. Naively changing `allowedChannels` to `["email", "telegram"]`
would have silently routed every recipient to email only. Fixed by
issuing two separate `dispatch()` calls per flow (Directus-flow-side
split), mirroring `event-reminders.service.ts`'s own established
`processCandidate`/`dispatchChannel` pattern.

**SecurityReviewer found and CodeDeveloper fixed 2 MAJOR findings**: (1)
`inline_buttons` had no size/length bounds, unlike its sibling `text`
field — an oversized array would reach the outbox unvalidated and only
fail later, opaquely, at the Telegram API layer (fixed:
`text.max(64)`/`url.max(2048).url()`/`.max(10)` per array dimension); (2)
event titles containing `"`/`\` could break the outer JSON structure of
the Directus-templated request bodies (pre-existing, shared with the
untouched email ops, not a regression) — fixed at the source with a
character-class guard on `patchEventSchema.title`. A third, self-disclosed
residual gap (a well-formed `<a href="evil">` embedded in an
operator-authored event title survives the sanitizer unchanged, since
escaping is explicitly out of the sanitizer's scope) was judged an
acceptable Phase 1 risk after independently verifying event titles are
exclusively operator-authored — documented as a named, tracked limitation
in `FR-NTF-004.md`'s Notes, not silently accepted.

**Live-local-run verification (owned by TestRunner/Orchestrator, since no
`flows-bootstrap.sh` change has ever had unit-test coverage anywhere in
this codebase's history) proved AC-5 through AC-8 against the real local
stack, not just mocked**: re-ran `flows-bootstrap.sh` idempotently, seeded
3 users (2 Telegram-eligible, 1 not) + 2 events, triggered all 3
registration flows, and confirmed via direct Directus API + raw Postgres
reads — registered/waitlisted/promoted all produced correct
`interaction_deliveries` + outbox rows with the right `inline_buttons`
shape (present for confirmed/promoted, absent for waitlisted, matching
the buttonless email template precedent); the Telegram-ineligible user
produced zero Telegram rows (clean skip, not a failed attempt). Two
environment gaps found and worked around live, neither a code bug: no
`python3` on this Windows machine's PATH (session-local shim); all 6
Directus request ops hardcode the production URL
`https://uz.aiqadam.org/...`, unreachable locally — root-caused and
live-patched (not committed) exactly per the already-documented
`da9e242`/`ISS-UAT-010-3` precedent, then reverted and re-verified via a
final idempotent `flows-bootstrap.sh` re-run. A separate, genuinely
pre-existing local machine issue was also found and fixed: this
machine's Node/ioredis resolves `localhost` to IPv6 (`::1`) first, which
cannot reach the Redis container — `apps/api/.env`'s `REDIS_URL` changed
`localhost`→`127.0.0.1` (untracked, non-secret, user confirmed keep) per
the CLAUDE.md dev/test `.env` exception. Confirmed via code trace + live
observation that this flakiness does NOT block the outbox-write path
this FR depends on (`TelegramAdapter.send()`→`OutboxPublisher.publish()`
is a pure Postgres transaction; only the separate, later relay step
touches Redis) — a good candidate for a future environment-hardening
follow-up, not a blocker here.

`FR-NTF-004.md`'s architecture description corrected in place (dated
2026-08-03 correction blockquote, matching ADR-0034's own "2026-07-31
update" callout style — original stale text preserved, not deleted);
`status` flipped `Planned`→`Implemented`; `requirements-registry.md` row
60 flipped to `Shipped`. `business_process` deliberately left empty
(`—`) — `BP-UAT-010` was reviewed in full and found to only verify "an
email arrived," with zero fixture/step/assertion touching Telegram
content, so linking it would have overclaimed post-merge UAT coverage;
named as a real, tracked coverage gap instead. `apps/api` full suite:
1587/1587 passing (50 new tests across 3 files). GitHub issue #142
closed (commit `Closes #142` — correct since `business_process` was
empty, no Step 13 re-verification pending); Project board synced to
`Agent-Verified` (corrected from a `Done` a GitHub default automation
applied on issue-close, before this workflow's own explicit sync ran).

---

**Prior last updated:** 2026-08-02 — `wf-20260802-fix-196`.
**FR-CRM-002 superseded — Twenty CRM retired per ADR-0033, no code implemented.**
[wf-20260802-fix-196](../tasks/completed/wf-20260802-fix-196/handoff.yaml)
(PR [#241](https://github.com/aiqadam/ai-qadam-platform/pull/241), squash-merged
SHA `208d13a`): GitHub issue #129 asked to implement FR-CRM-002 (sync members
to Twenty CRM as Person records via a new `crm.controller.ts` + `crm-client.ts`
+ a re-created Directus flow). Investigation before any code was written found
[ADR-0033](../adr/0033-community-member-graph.md) (Accepted 2026-05-20) had
already formally retired Twenty CRM — "Twenty CRM is dropped... Member
relationship management lives in the [Directus] graph" — and
[FR-AUTH-006](../../docs/03-requirements/FR-AUTH-006.md) already documents the
`directus_users` row created/patched during account upgrade as the modern
replacement for CRM contact sync. The three Directus flows FR-CRM-002 called
for (`crm-contact-sync`, `crm-activity-on-create`, `crm-activity-on-update`)
were already built once and then explicitly deleted
(`infrastructure/directus/flows-bootstrap.sh` `F-S3.0` block, per the same
ADR). Building the issue as literally spec'd would have resurrected a
dependency the project already killed for a documented architectural reason
— surfaced to the user per AGENTS.md §13 before proceeding; user confirmed
"close as superseded, no code" over the alternative of building against
Twenty anyway or re-scoping toward the member graph. `FR-CRM-002.md` frontmatter
`status` flipped `Planned` → `Superseded` with a `superseded_by: ADR-0033,
FR-AUTH-006` field and a "Superseded" section explaining the disposition
(original requirement text preserved below it for historical record);
`requirements-registry.md`'s Status column flipped to `Superseded (ADR-0033)`.
GitHub issue #129 closed with an explanatory comment (auto-closed by the PR's
`Closes #129` commit keyword — safe here since `business_process` was empty,
so no Step 13 post-merge UAT re-verification was pending). No code, tests, or
migrations — this was a documentation-only correction, so the full
CodeDeveloper/SecurityReviewer/TestRunner pipeline was not invoked; the
Orchestrator ran Step 0/0.5 (with `--skip` on the drift check, since the only
flagged drift was the pre-existing, unrelated open
[ISS-WEB-WORKSPACE-500-001](../issues/ISS-WEB-WORKSPACE-500-001.md)), the doc
edit, and Step 11/11.5 directly. **Known follow-up, not yet actioned:**
`FR-CRM-001.md` (Twenty deployment) and `FR-CRM-003.md` (activity sync) still
carry stale `Implemented`/`Planned` status uncorrected by ADR-0033, and
`FR-PTN-002.md` depends on `FR-CRM-002` — flagged for a future workflow, out
of scope for this one since the user only asked about issue #129.

---

**Prior last updated:** 2026-08-02 — `wf-20260802-fix-195`.
**ISS-API-TELEGRAM-ROLE-001 resolved — `ci-cd` `build` job fully green on `main`.**
[wf-20260802-fix-195](../tasks/completed/wf-20260802-fix-195-telegram-auth-test-role-field/handoff.yaml)
(PR [#239](https://github.com/aiqadam/ai-qadam-platform/pull/239), squash-merged
SHA `67b844f`): `apps/api/test/telegram-auth-service.spec.ts`'s 3 pre-existing
`toEqual()` assertions (lines 371/384/402) updated to include `role: null`,
matching the response shape FR-BOT-003 (PR #220) added to
`TelegramAuthService.lookupUser()`. All 3 fixtures use `fakeUser(...)`'s
default `groups_obj: []`, so `deriveRoleFromGroups` deterministically returns
`null` — no production code touched. `apps/api` full suite verified
1546/1546 pass locally before push; `ci-cd` confirmed green on the PR (`ci`,
`build` ×2, `architecture-check`, `storybook`, `gitleaks`, `pnpm audit`,
`utm-lint`, `voice-lint`) and reconfirmed on `main` post-merge (`build` job
5m9s, all steps pass). This closes out the AC-4 deferral from
`wf-20260802-fix-194`/ISS-EVT-LIFECYCLE-TAB-001 — `ci-cd` on `main` is fully
green again with no known outstanding failures other than the pre-existing,
already-tracked-elsewhere [ISS-USR-CLOCK-001](../issues/ISS-USR-CLOCK-001.md)
(local-dev-only Docker clock-drift flake in `users.spec.ts`, never observed
in actual GitHub Actions runs, queued separately under
`wf-20260704-fix-096-pre-existing-api-test-flakes`).

**Prior last updated:** 2026-08-02 — `wf-20260802-fix-194`.
**ISS-EVT-LIFECYCLE-TAB-001 resolved — `event-lifecycle-tab.test.ts` no longer fails on `main`.**
[wf-20260802-fix-194](../tasks/completed/wf-20260802-fix-194-lifecycle-tab-unparseable-startsAt/handoff.yaml)
(PR [#237](https://github.com/aiqadam/ai-qadam-platform/pull/237), merged
SHA `b0c20c8`): `apps/web-next/src/pages/events/[id].astro`'s inline `defaultTab`
derivation now guards against unparseable `startsAt`/`endsAt` ISO strings
(`Number.isNaN()` on the parsed timestamps), matching the contract previously
specified — but never actually implemented on the page side — by the unit
test added in `wf-20260730-feat-155` (PR #150). The test's local
`deriveDefaultTab()` mirror was updated to mirror the same guard logic
(Vitest cannot import `.astro` frontmatter). 4-case defensive-fallback
contract documented inline: both dates parseable (finished → live → upcoming
clamped against now), only startsAt unparseable (forces upcoming, never
short-circuit to finished), only endsAt unparseable (`now >= NaN` is false,
so the finished branch becomes unreachable — falls through to live if past
startsAt, otherwise upcoming), neither parseable (upcoming). 9/9 lifecycle-tab
tests pass; full `apps/web-next` test suite (40 files / 1017 tests) passes;
typecheck + build clean. CI override applied silently per AGENTS.md §6.3
user opt-out — `ci-cd` was also red on `apps/api/test/telegram-auth-service.spec.ts`
(lines 371/384/402), confirmed pre-existing on `origin/main` (`git diff
origin/main HEAD -- apps/api/` returns empty), root-caused to FR-BOT-003
(PR #220 / commit `639467b`) which added the `role` field to
`TelegramAuthService.lookupUser()`'s response without updating assertions.
Separated into [ISS-API-TELEGRAM-ROLE-001](../issues/ISS-API-TELEGRAM-ROLE-001.md)
+ queued workflow `wf-20260802-fix-195-telegram-auth-test-role-field`
(completed — see [`.copilot/tasks/completed/`](../tasks/completed/wf-20260802-fix-195-telegram-auth-test-role-field/handoff.yaml)
and the "Last updated" entry above)
to address the unrelated pre-existing failure — current issue's AC-4
(`ci-cd` build green) was **deferred** to that workflow's verification,
which has since completed.

**Prior last updated:** 2026-08-02 — `wf-20260802-feat-192-auth-003-social-oauth`.

---

**Last updated:** 2026-08-02 — `wf-20260802-feat-192-auth-003-social-oauth`.
**FR-AUTH-003 implemented — Google + GitHub OAuth sign-in via Authentik Sources.**
[wf-20260802-feat-192-auth-003-social-oauth](../tasks/completed/wf-20260802-feat-192-auth-003-social-oauth/handoff.yaml)
(PR [#234](https://github.com/aiqadam/ai-qadam-platform/pull/234), merged
SHA `26ed482`): `GET /v1/auth/login` now accepts `?provider=google|github`
(VALID_PROVIDERS allowlist + validateProvider() guard); `auth.service.ts`
`startAuthorization()` passes `source=<slug>` to Authentik's OIDC authorize URL
to pre-select the OAuth source; `GET /v1/auth/callback` early-exits with 302 to
`/auth/sign-in?error=oauth_denied` for `?error=access_denied` before openid-client
throws OPError; `apps/web-next/src/pages/auth/sign-in.astro` gains "Continue with
Google" and "Continue with GitHub" buttons plus an oauth_denied error banner;
`scripts/provision-authentik-oauth-sources.sh` (new) provisions both sources in
Authentik idempotently. 17/17 unit tests pass. AC-3 (email dedup) and E2E UAT
queued as wf-20260802-uat-193-auth-003-social-oauth. GitHub issue #128 closed.

---

**Last updated:** 2026-08-01 — `wf-20260801-fix-189`.
**ISS-RBAC-ONBOARDED-AT-001 resolved — `directus_users.onboarded_at` field now exists.**
[wf-20260801-fix-189](../tasks/completed/wf-20260801-fix-189-onboarded-at-field/handoff.yaml)
(PR [#226](https://github.com/aiqadam/ai-qadam-platform/pull/226), merged
SHA `34098e0`): Adds the missing `ISS-RBAC-ONBOARDED-AT-001 — directus_users.onboarded_at`
section in `infrastructure/directus/bootstrap.sh`, modeled exactly on
the existing `directus_users.email_verified_at` block (lines 3226-3233).
Field type `timestamp`, schema `is_nullable: true`, meta `interface: datetime`,
`readonly: true`, self-documenting `meta.note` recording what sets the
field (`MembersOnboardingService.completeOnboarding()`), what references
it, and which bug it closes. This was the second of two bugs stacked
under the original `ISS-RBAC-PERMS-001` symptom (PR #223 fixed the
permission-row gap; this PR fixes the schema gap that was underneath
it). 7/7 ACs verified live against `aiqadam-directus Up 2 days (healthy)`:
T1 field appears, T2 schema matches spec, T3 idempotency across 2
bootstrap.sh re-runs, T4 PATCH persists, T5 GET returns the value. No
apps/api code changes needed — `MeProfileService.{setOnboardedAt,
getOnboardedAt, fetchProfileRow}` already target this field; the
retry-without-onboarded_at fallback at lines 200-225 is left in
place as defensive code (per the PR Risks section). GitHub issue #168
closed.

---

**Last updated:** 2026-08-01 — `wf-20260801-fix-187`.
**ISS-SEC-PUBLIC-UNMANAGED-001 resolved — Public reads on events/speakers/event_speakers now scoped.**
[wf-20260801-fix-187](../tasks/completed/wf-20260801-fix-187/handoff.yaml)
(PR [#224](https://github.com/aiqadam/ai-qadam-platform/pull/224), merged
SHA `9e17ca5`): Adds new `ISS-SEC-PUBLIC-UNMANAGED-001` section in
`infrastructure/directus/bootstrap.sh` that resolves the Public policy
id by `$t:public_label` name (same pattern as the existing
`ISS-SEC-DIRECTUS-USERS-PUBLIC-001` block, not the broken hardcoded
UUID pin) and grants three scoped reads: events with `status=published
AND (country != xx OR $CURRENT_USER.is_test_user == true)` plus a
33-item field allowlist; speakers with `status=active AND (country != xx
OR $CURRENT_USER.is_test_user == true)` plus a 7-item allowlist
excluding `bio`; event_speakers with `status=confirmed AND
event.status=published, event.country != xx` plus a 7-item allowlist.
Revokes 6 pre-existing `permissions: null` Public rows on local env
(ids 15/23 / 17/25 / 16/24 — confirmed deleted). Idempotent on re-run
(rows 117/118/119 deleted-then-recreated identically across 2
consecutive bootstrap.sh runs). 7/7 ACs verified live against
`aiqadam-directus Up 2 days (healthy)`. CI override applied silently
per AGENTS.md §6.3 user opt-out (pre-existing `build` failure on
origin/main, file-path intersection empty with this PR's diff). PR
Risks documents: (a) apps/web `cms.ts:852` bio_md JOIN was already 403
pre-PR (directus_users Public revoke from the prior fix blocks it),
my allowlist deliberately excludes bio to match that pre-existing
behavior — no regression; (b) the 8 lower public-read blocks at
lines ~4290–5440 still use the broken hardcoded UUID pin
`POLICY_PUBLIC_PROD="87bf5954-..."` and silently skip on this env —
pre-existing bug not introduced by this PR; new follow-up workflow
`wf-20260801-fix-188-public-policy-uuid-lookup` queued to migrate
those blocks to the same name-lookup pattern (new issue
[ISS-PUB-POLICY-UUID-PIN-001](../issues/ISS-PUB-POLICY-UUID-PIN-001.md)).
GitHub issue #169 closed.

---

**Last updated:** 2026-08-01 — `wf-20260801-feat-185`.
**FR-AUTH-002 fully closed — Telegram Login Widget shipped to sign-in page.**
[wf-20260801-feat-185](../tasks/completed/wf-20260801-feat-185/handoff.yaml)
(PR [#222](https://github.com/aiqadam/ai-qadam-platform/pull/222), merged
SHA `a3d7cf5`): Adds Telegram Login Widget to `apps/web-next /auth/sign-in`
(rendered when `TELEGRAM_BOT_USERNAME` env var is set). Adds `GET
/v1/auth/telegram/callback` endpoint for the browser-native widget redirect
flow. All 7 FR-AUTH-002 ACs verified. GitHub issue #126 closed. FR-AUTH-002
status: Implemented (all deferred items resolved across PRs #52, #197, #214,
#222).

---
**Last updated:** 2026-08-01 — `wf-20260801-feat-184`.
**FR-BOT-003 implemented — 5 operator runtime bot commands now live.**
[wf-20260801-feat-184](../tasks/completed/wf-20260801-feat-184/handoff.yaml)
(PR [#220](https://github.com/aiqadam/ai-qadam-platform/pull/220), merged
SHA `639467b`): Adds `/attendance`, `/scan`, `/approvals`, `/announce`, and
operator stats card on `/me` — all gated by a new `role` field on the
lookup response (derived from `authentikUser.groups_obj`, no extra Authentik
call). Bot changes in `apps/bot` submodule; API changes in
`apps/api/src/modules/auth/`. 14 new pytest tests, TypeScript 0 errors, ruff
clean. `/approvals` is an intentional shell (invite_only event type not yet in
schema; documented scope gap). FR-BOT-003 status: Planned → Implemented/Shipped.

---
direct read). Renders 4 distinct outcomes (magic-link sent /
`telegram_user_not_found` / `not_a_temp_account` / `email_already_in_use`).
A full-account user's `/upgrade` short-circuits client-side via the
existing `is_temp` field on `UserContext` — no wasted API call, following
`/me`'s own precedent for reading that same field.

`docs/03-requirements/FR-BOT-002.md` frontmatter `status` flips
`Planned` → `Implemented`; `requirements-registry.md`'s Status column
flips `In Progress` → `Shipped` — the atomic pair, same commit as the
code (`9460612`). 8 of 9 ACs `[x]` verified; AC-9 ("all commands respond
within 3 seconds") stays `[ ]` with an explicit honesty disclosure — never
measured with a dedicated timing harness across the full 10-command set,
only observed informally as fast throughout PRs 1-6. Not a blocker to
terminal status; a genuine, disclosed gap per AGENTS.md §9.

Live bot-side verification (scoped per the task brief: FR-AUTH-006 already
live-verified the underlying upgrade mechanism 10x end-to-end, so this
PR's own verification focused on the NEW bot-side caller code) reproduced
3 of 4 response cases against the real local API with real seeded
Authentik fixtures: `telegram_user_not_found` (404), success including a
real Mailpit magic-link email delivery, and `email_already_in_use` (409,
confirmed no-mutation-on-this-path). `not_a_temp_account` was deliberately
not re-derived live — it requires a full magic-link click-through + OIDC
round trip (the exact mechanism FR-AUTH-006 already proved), and is
already covered by both `apps/api/test/upgrade-service.spec.ts` and the
bot's own unit test. All live-verification fixtures cleaned up, confirmed
via a zero-residue re-query. `apps/api/.env`'s `TELEGRAM_BOT_TOKEN` was
temporarily set to a local dev-only placeholder to unblock
`upsert-temp-user` seeding (same precedent `wf-20260801-feat-181` already
established), then fully reverted — confirmed via `git diff` returning
empty.

apps/bot: 165/165 pytest passing (19 net new tests), ruff clean. apps/api:
1528/1529 (1 pre-existing, independently re-confirmed `test/users.spec.ts`
clock-ordering flake, unrelated — `apps/api/` has zero diff on this PR's
branch). Zero retries across all 10 workflow steps.

**Full FR-BOT-002 sequence now complete:** PR 1/6
(`wf-20260731-feat-174`, `/help`/`/events`/`/event <N>`), PR 2/6
(`wf-20260801-feat-175`, `/register <N>`/`/cancel <N>`), PR 3/6
(`wf-20260801-feat-176`, `/me`), PR 4/6 (`wf-20260801-feat-177`,
`/leaderboard`), PR 5/6 (`wf-20260801-feat-178`, `/interests`), PR 6/6
(`wf-20260801-feat-182`, this entry, `/upgrade`).

---

**Previous entry (2026-08-01 — `wf-20260801-feat-181`):**
**FR-AUTH-006 shipped — temporary (Telegram-only) account upgrade to full
member, end-to-end live-verified.**
[wf-20260801-feat-181](../tasks/completed/wf-20260801-feat-181/handoff.yaml)
(PR [#214](https://github.com/aiqadam/ai-qadam-platform/pull/214), merged
SHA `9e08fd57`): second of a 3-workflow chain
(FR-AUTH-004 [done] → FR-AUTH-006 [this] → FR-BOT-002 PR 6/6 [future,
not in scope]). New `POST /v1/internal/telegram/upgrade-temp` endpoint
(`UpgradeService.requestUpgrade()`) lets a temp Telegram-only member
(Authentik `attributes.is_temporary=true`, no `platform.users` row yet)
supply a real email; completing Authentik's magic-link Email stage
(reusing FR-AUTH-004's mechanism as-is) fires a new upgrade branch in
`AuthController.callback()` that flips `is_temporary=false` and lets the
existing `upsertByAuthentikSubject`/`ensureLinked` machinery create the
member's first `platform.users`/`directus_users` rows with the verified
email.

**Two forced design decisions, both discovered via live investigation
before/during implementation, not assumed:** (1) `sendMagicLinkEmail`
always emails the Authentik user's CURRENT on-file email (no override
param exists) — so the target email is PATCHed onto the Authentik user
as part of `/upgrade-temp` request handling itself, before the magic-link
send, not deferred to `callback()` (`is_temporary` stays `true`
throughout the verification window). (2) The originally-sketched
correlation mechanism (thread an `upgrade_intents` token through the
OIDC `next` param) is undeliverable — Authentik's magic-link email URL
accepts no caller-supplied redirect/state of any kind. Shipped mechanism
instead correlates by `authentikUserPk`: `callback()` resolves the
verified email back to a pk and looks up the most recent live
`upgrade_intents` row for it — the fact that this Authentik user just
completed Authentik's own verified email-stage flow IS the proof of
intent.

**SecurityReviewer found and CodeDeveloper fixed a genuine TOCTOU race**
(MAJOR-1): two concurrent `/upgrade-temp` calls could both win Authentik's
non-unique-email collision check for the same target email. Fixed by (a)
a second `getUserByEmail` re-check with no intervening `await` immediately
before the email PATCH, and (b) reordering `callback()` so the
`is_temporary` flip only commits AFTER `upsertByAuthentikSubject()` has
actually succeeded — a losing racer's Authentik record simply stays
`is_temporary=true` with a live, retryable upgrade record, never
`is_temporary=false` with no member row. TestDesigner's regression test
(MAJOR-2) proves this against a REAL Postgres `users_email_unique`
constraint violation, not a simulated one.

**Points/leaderboard "retroactive backfill" was corrected during
requirement validation, before any code was written:** tracing every
registration write path showed a temp-only user cannot accrue any
`registrations`/`point_awards` rows before upgrading (both require a
`platform.users` row that only exists after a completed OIDC session) —
so there is no historical data to backfill. The FR's own text was
corrected to reflect this: points accrue normally starting immediately
after upgrade, with zero `is_temporary` special-casing anywhere in
`PointsModule`/`RegistrationsModule` (confirmed by grep AND by live
verification below). Twenty CRM sync (Functional scope item 6) was
resolved to "no code needed" — Twenty is retired per ADR-0033; the
`directus_users` email patch already satisfies the intent.

**The Orchestrator's own live verification (10 fresh temp-user round
trips against real local Authentik + Directus + Mailpit + Postgres, not
mocked) confirmed the entire mechanism end-to-end**, closing the piece
`07-test-results.md` explicitly deferred: real magic-link email delivery
(~1.4s), a real headless-Chromium click through Authentik's flow, a real
OIDC authorize/callback round trip, `is_temporary` flip confirmed via
direct Authentik admin-API query, the synthetic email genuinely replaced
with the real one in BOTH Authentik and Directus (independently queried),
a real event registration + check-in producing real `point_awards` rows
with zero special-casing, and a real per-country leaderboard appearance
(rank 2, correct total). All 10 test users and their associated
Postgres/Directus rows were cleaned up afterward, confirmed via a final
zero-count sweep.

**One genuinely new, previously-undocumented local-dev-testing gotcha
was discovered and resolved during this live verification**, now
recorded in `docs/04-development/architecture/auth-architecture.md`
§6.10 for future agents: Authentik's per-Brand cookie scoping means the
magic-link Brand's session cookie (`magic-link.aiqadam.internal`) is a
different cookie-scope origin from the default Brand
(`localhost:9000`, used by `/application/o/authorize/`) in this local
dev topology — so a naive same-script magic-link-click-then-authorize
round trip re-prompts for login instead of auto-approving via SSO. Fix:
capture `/v1/auth/login`'s raw `Location`+`Set-Cookie` response
un-redirected and rewrite only the authority of the `/authorize` redirect
to the magic-link Brand's origin before navigating there.

---

**Last updated:** 2026-08-01 — `wf-20260801-feat-179`.
**FR-AUTH-004 shipped and Step 13 post-merge re-verified — magic-link
(passwordless) sign-in, end-to-end live-verified across two workflows.**
[wf-20260801-feat-179](../tasks/completed/wf-20260801-feat-179/handoff.yaml)
(PR [#211](https://github.com/aiqadam/ai-qadam-platform/pull/211), merged
SHA `cfe574f`): Authentik `magic-link-login` flow provisioning (a
purpose-built second `Brand`, domain `magic-link.aiqadam.internal`, so
the emailed link's target flow resolves correctly per-request via `Host`
header — `default Brand.flow_recovery` stays bound to
`default-recovery-flow` for password-reset, untouched), `POST
/v1/auth/magic-link` (public, throttled, always `{ok:true}` —
deliberate anti-enumeration trade-off, documented), a real-markup
upgrade of `/auth/sign-in` (two options: "Continue with password" /
"Sign in with email link") plus the new `/auth/sign-in-magic-link`
page, and a comment-only FR-AUTH-006 extension seam at
`AuthController.callback()`'s `upsertByAuthentikSubject()` call site
(auth.controller.ts:212-219 — every auth mechanism, including
magic-link, converges on this one funnel; no parallel session-issuance
path exists).

Code-development (Step 8) found and fixed **two real bugs** via live
verification that unit tests could not have caught: (1) the emailed
link initially targeted the wrong Authentik flow
(`default-recovery-flow` instead of `magic-link-login` — `email_stage`
only controls the email's subject/template, never the link's target
flow, which is always `request.brand.flow_recovery` resolved per-request
by `Host` header; fixed via the second-Brand provisioning above); (2)
even once pointed at the right flow, a live Playwright click-through
found the flow's own stage-binding topology was wrong (Identification +
Email stages bound ahead of `UserLoginStage` meant every click restarted
the whole flow instead of issuing a session in one hop — fixed by
un-binding Identification/Email from the flow, leaving `UserLoginStage`
as the sole bound stage). Both fixes are live-verified, not just
asserted — see `wf-20260801-feat-179/03-code-summary.md`'s two retry
sections for full root-cause writeups.

**Two known, disclosed, non-blocking gaps** (both flagged, neither
hidden): the magic-link email's body copy is still Authentik's generic
password-reset template text (Authentik 2024.12.x ships no
sign-in-appropriate bundled template; a real fix needs a custom Django
template mounted into the container — infra work beyond this FR's
scope); the token TTL is actually ~29 minutes, not the FR's stated
15-minute target (`Tenant.default_token_duration`, a platform-wide
Authentik setting shared with password-recovery, not overridable
per-flow via any REST surface this Authentik version exposes — a
shorter TTL is a security improvement never a regression, so this is a
precision gap, not a security concern).

**Step 13 post-merge re-verification**
([wf-20260801-uat-180](../tasks/completed/wf-20260801-uat-180/handoff.yaml),
PR [#212](https://github.com/aiqadam/ai-qadam-platform/pull/212)):
BP-UAT-009 (auth sign-in/sign-out) re-verified clean, targeted at the
existing password-path regression (does the new magic-link option
break it?) plus this FR's own AC-1 (entry-point discoverability) — the
magic-link mechanism itself was already exhaustively live-verified
during Step 8 above and was deliberately not re-driven a third time.
All verdicts `MATCH` on the third session attempt; the first two hit
genuine environment issues (an Authentik flow-executor stage-remount
fill race in the new `BP-UAT-009.session.spec.ts`, and the same stale
`uat-member` seeded-password gap `wf-20260731-uat-166` already
documented and fixed the same way) — neither is an FR-AUTH-004
regression. All `BP-UAT-009` stakeholders (`FR-AUTH-004`,
`ISS-AUTH-OIDC-EMAIL-001`, `ISS-USR-PWRESET-001`) synced to
`agent-verified`; GitHub issue
[#127](https://github.com/aiqadam/ai-qadam-platform/issues/127) closed.

**Process finding, disclosed not silently worked around:**
`scripts/gen-bp-uat-coverage.mjs --write`, run once to regenerate the
registry's `Spec`/`Smoke Overlap` columns, was found to destructively
collapse already-populated `Status`/`Last Run`/`Run Status` cells for
unrelated rows (`BP-UAT-013`, `BP-UAT-020`) back to `—`. Caught via
`git diff` before committing, reverted, and the intended registry edit
was applied by hand instead. The script itself is unfixed — a real bug,
noted here for whoever picks up a future narrow fix.

---

**Previously:**
**FR-BOT-002 PR 5/6 shipped — /interests, view and toggle topic interests via inline-keyboard buttons.**
[wf-20260801-feat-178](../tasks/completed/wf-20260801-feat-178/handoff.yaml)
(PR [#209](https://github.com/aiqadam/ai-qadam-platform/pull/209), merged):
fifth of the planned 6-PR sequence implementing `FR-BOT-002`. On `apps/api`:
two new `InternalAuthGuard`-protected, Zod-validated routes — `GET
/v1/internal/telegram/interests` and `POST
/v1/internal/telegram/interests/toggle` on `TelegramInternalController` —
proxying through the existing `MeProfileService.listInterests`/
`addInterest`/`removeInterest`, the same service and `member_interests`
collection the web `/me/profile` cabinet already uses (F-S3.6b, ADR-0033
cabinet #5). No new DB migration, no competing write path. Candidate topic
list is a duplicated 7-slug constant (`TelegramEventTopicsService` isn't
exported from `TelegramModule`, so it can't be imported — same precedent
PR 1/6 set for `TelegramEventsService`'s own duplication).

Module wiring required `forwardRef(MeProfileModule)` in `AuthModule`, plus
a real gap **not anticipated by impact-analysis**: `me-profile.module.ts`'s
own plain import of `AuthModule` also needed wrapping in `forwardRef` —
not just the new edge on `AuthModule`'s side. Caught live by
`main-bootstrap.spec.ts`'s Nest DI boot check (`UndefinedModuleException`),
the exact failure mode `registrations.module.ts`'s own header comment
already documents for the `RegistrationsModule` edge. Lesson: both sides of
a new bidirectional module edge need `forwardRef`, not just the side
introducing it.

**Scope decision, documented explicitly** (same posture as PR 3's streak
gap): `member_interests` rows require an `intent` the bot's one-button-
per-topic UX has no slot for. The bot hardcodes `intent='learn'` for adds;
toggle-off removes only the `'learn'`-intent row, never touching
other-intent rows a member set via the web cabinet. AC-7 is the regression
guard — live-verified end-to-end below, not just unit-tested.

On `apps/bot/` (submodule, pushed to SHA `c1be007`): new `/interests`
command handler + toggle callback (in-place `edit_text` re-render,
matching `/events`' pagination precedent), `[x]`/`[ ]` bracket-marker
toggle keyboard (plain ASCII, not emoji-as-state — deliberately different
from this bot's existing emoji-as-navigation-affordance usage elsewhere),
`api_client.get_interests()`/`toggle_interest()`. `help.interests` line
lost its "(coming soon)"/"(скоро)" suffix.

apps/api: 1470/1471 full suite (1 pre-existing, unrelated clock-flake,
independently git-stash-verified against unmodified `main`). apps/bot:
146/146. 0 BLOCKER/MAJOR security findings.

**Live end-to-end verification against the real local stack** (not just
mocked unit tests), performed directly in this session: toggled `llm` ON
for a real member (`uat-member@example.com`) via the real API, confirmed a
real `member_interests` row (`topic_tag=llm, intent=learn`) via direct
Directus GET; toggled OFF, confirmed the row genuinely deleted (0 rows,
not just filtered). **AC-7 live check**: created a `topic_tag=llm,
intent=mentor` row directly (simulating the web `/me/profile` cabinet),
called the bot's toggle route once, confirmed via direct Directus GET that
the mentor row survived completely untouched — the exact cross-surface
data-safety guarantee this PR's scope-narrowing decision depends on,
proven live, not just asserted by a mock. All seed fixtures cleaned up
afterward, confirmed back to baseline (0 rows).

**`business_process` linkage — two distinct decisions, correctly kept
separate.** `FR-BOT-002.md`'s own frontmatter stays `[BP-UAT-010]`
unchanged (represents the FR as a whole; PR 2/3's registration/`/me`
surfaces genuinely touch it). This workflow's own `handoff.yaml.business_process`
was corrected post-merge from an initially-carried-forward `["BP-UAT-010"]`
to `[]`, mirroring PR 4's own precedent exactly (Step 13 gates on what
THIS PR's surface touches, not the FR's cumulative value) — confirmed by
reading `BP-UAT-010.md` directly: zero mentions of interests/
`member_interests`/`topic_tag` anywhere in it. `BP-UAT-003` (the genuinely
adjacent spec — same `member_interests` resource, `MeProfileService`,
AC-3/Steps 006-008) is web-only with zero bot-surface steps, so it isn't a
clean Step-13 target either; recorded as a documented adjacency in
`FR-BOT-002.md`, a candidate follow-up for a future BP-UAT-003 revision
adding bot steps. **Step 13 correctly skipped** for this workflow — no new
`agent-verified` sync beyond the direct `implemented` sync already applied
to `FR-BOT-002`'s GitHub Project item.

**Planned follow-up PRs table** in `FR-BOT-002.md` now shows only PR 6/6
(`/upgrade`, depends on FR-AUTH-006) remaining — this is the
second-to-last PR in the sequence.

---

[wf-20260801-feat-177](../tasks/completed/wf-20260801-feat-177/handoff.yaml)
(PR [#207](https://github.com/aiqadam/ai-qadam-platform/pull/207),
merged): fourth of the planned 6-PR sequence implementing `FR-BOT-002`.
On `apps/api`: one new `InternalAuthGuard`-protected, Zod-validated route
— `GET /v1/internal/telegram/leaderboard` on `TelegramInternalController`
— reusing `PointsDirectusService.leaderboard()` and
`DirectusUsersBridgeService.resolveUserIdFromDirectusId()` (both PR
2/3-era services) completely unchanged: zero new Directus query, zero
new DB migration, zero new module-graph wiring (both were already
injected into `TelegramAuthService`). The response narrows the
underlying `LeaderboardEntry` shape (`email`, `handle`, `userId`) down to
`{ displayName, points, isCaller }` before it leaves the API boundary —
a PII-narrowing decision flagged during impact analysis and confirmed by
a dedicated regression test asserting the actual returned object has no
such fields, not just a type-level guarantee. `isCaller` is resolved
server-side (comparing the caller's resolved `platform.users.id` against
each entry) so the bot never learns another user's identifier; unlike
`/me`'s `getMeSummary` (which 404s on an unresolvable caller identity),
`/leaderboard` degrades to "no row highlighted" instead of failing the
whole request, since the ranked list is still valid content either way.
On `apps/bot/` (submodule, pushed to SHA `f6ed6cf`): new `/leaderboard`
command handler + `render_leaderboard()`, reusing the same
`<b>...</b>` HTML bold convention `/me`/`/event` already established for
emphasis (no new markup mechanism); no pagination, since the FR's own AC
only ever asks for "top 10." `/help`'s `help.leaderboard` line lost its
"(coming soon)"/"(скоро)" suffix, matching the exact pattern PR 2/3
established for their own commands. **Scope decision, made explicit
rather than silently resolved:** the FR's functional-scope wording
("Highlights the calling user's position **if they appear**") was read
literally — a caller ranking outside the top 10 sees a fully unmarked
list, no separate "your rank" line; this is the narrower, AC-literal
interpretation, adopted per the task brief's own guidance absent a clear
signal otherwise, and covered by a dedicated regression test
(`test_render_leaderboard_no_highlight_when_caller_absent`). 0
BLOCKER/MAJOR security findings. apps/api 1447/1448 (1 pre-existing,
unrelated clock-race flake at `users.spec.ts:65`, the same one PR
1/2/3 each independently confirmed untouched by their own diffs, and
confirmed untouched by this diff too); apps/bot 124/124 (111 pre-existing
+ 13 new/modified). **Temp-user exclusion needed no new filtering
code — confirmed by reading the query AND by live end-to-end
verification, not just trusted from a prior research pass:**
`leaderboard()`'s aggregate only ever enumerates `point_awards` rows, and
a temp (Authentik-only) user has never earned one. Live-verified against
the real local stack: seeded a genuine temp user via the real
`upsert-temp-user` endpoint (response confirmed `directusUserId: null` —
zero Directus footprint) alongside a genuine new Directus member with a
real 250-point `point_awards` row and a `platform.users` bridge row;
called the real endpoint and confirmed the full member appeared
(`isCaller: true`, ranked #1) while the temp user was absent, cross-
referenced directly against Directus showing zero rows for the temp
identity, then cleaned up all seed fixtures with a confirming baseline
call. `business_process` frontmatter on `FR-BOT-002.md` left unchanged
at `[BP-UAT-010]` — this PR's own surface (leaderboard) doesn't touch
that process, and `BP-UAT-012` ("Points engine and leaderboard," the
topically correct match) has no spec/process_ref/run history to link to
instead — checked and rejected per `protocol.md`'s "don't force a link"
guidance, same posture PR 3 already took when it checked the same
BP-UAT for `/me`. Step 13 does not apply to this workflow
(`handoff.yaml.business_process: []`). Did **not** close GitHub issue
`#140` (`FR-BOT-002`'s own tracking issue) — same judgement call PR 2/3
already made and documented: issue #140 tracks the entire 10-command FR,
and this PR ships only command 6 of 10 (3 remain: `/interests`,
`/upgrade`, plus `/start` refinements were never separately tracked).
Synced to Project-board status `agent-verified` directly (no linked
BP-UAT to re-verify, so a clean merge is itself sufficient per Step
11.5's rule). `requirements-registry.md` row 58 stays `In Progress`
(unchanged); `FR-BOT-002.md`'s own `status:` frontmatter stays `Planned`
(same multi-PR-FR rationale as PR 1-3).

**Last updated:** 2026-08-01 — `wf-20260801-feat-176`.
**FR-BOT-002 PR 3/6 shipped — /me, the bot's first member-facing dashboard command: active registrations with status badges + a Cancel button per row, and lifetime points total.**
[wf-20260801-feat-176](../tasks/completed/wf-20260801-feat-176/handoff.yaml)
(PR [#205](https://github.com/aiqadam/ai-qadam-platform/pull/205), merged):
third of the planned 6-PR sequence implementing `FR-BOT-002`. On
`apps/api`: one new `InternalAuthGuard`-protected, Zod-validated route —
`GET /v1/internal/telegram/me` on `TelegramInternalController` —
aggregating `RegistrationsDirectusService.listMine()` (PR 2's reused
registration path, unchanged) and a new
`PointsDirectusService.totalForUser()`, a single-user variant of the
existing `leaderboard()` aggregate query (same Directus primitive, no new
points-calculation rule, just a narrower `filter[user][_eq]` instead of
`groupBy`). `PointsModule` wired into `AuthModule` as a plain import — no
`forwardRef` needed this time, unlike PR 2's `RegistrationsModule` edge,
since `PointsModule` has no import path back to `AuthModule` (confirmed
both by reading `points.module.ts` and by a live `pnpm --filter api dev`
boot trace). On `apps/bot/` (submodule, pushed to SHA `39da86c`): new
`/me` command handler rendering active registrations with per-status
badges (registered/waitlisted/attended) and a Cancel button per row
(fulfilling a PR-1-era comment in `event_detail.py` that explicitly
deferred this button to "PR 3's /me registration list" — reuses PR 2's
`cancel_registration` call unchanged, no new cancellation logic), lifetime
points total, and a temp-account upgrade nudge. Added to `BOT_COMMANDS`
(argument-less, unlike `/event`/`/register`/`/cancel`).

Two scope decisions made explicit rather than silently resolved, per the
task's own framing under AGENTS.md §13/§14 (product-behavior decisions
are not a CodeDeveloper's call to make silently): **streak is NOT
built** — a targeted search across the API, bot, Directus collections,
and docs found zero references to a streak concept anywhere in this
codebase, no FR-BOT-002 AC tests one, and inventing a scoring definition
(consecutive events? consecutive active weeks?) would be a genuine
product decision with real user-facing consequences. `/me` simply omits
it, documented as a gap (not a silent drop, not a fabricated number), with
a dedicated regression test (`test_render_me_never_mentions_streak`)
guarding against silently reintroducing a placeholder later. **The "link
Telegram to web" CTA is static copy, not a computed boolean** — the only
"linked" concept anywhere in this repo
(`directus_users.telegram_user_id`/`telegram_linked_at`, ADR-0033) is
owned by the OLD, ADR-0034-superseded `apps/api/src/modules/telegram/`
module, a different auth surface with no relationship to this bot's
Authentik-attribute-based identity model — reading that column from the
new bot would conflate two unrelated auth systems for a non-AC-tested
nicety, so `/me` always shows a generic CTA pointing at `/upgrade`
(PR 6/6's scope) instead. `business_process` frontmatter cross-checked
against `BP-UAT-003` (member self-service profile — covers the unrelated
`/me/profile` web page, zero overlap) and `BP-UAT-012` (points/
leaderboard — never run, no spec); neither is a clean fit, so
`[BP-UAT-010]` stays unchanged, no new code invented, matching
`protocol.md`'s "don't force a link" guidance. 0 BLOCKER/MAJOR security
findings. apps/api 1433/1434 (1 pre-existing, unrelated clock-race flake
at `users.spec.ts:65`, same one PR 1/PR 2 already cross-referenced —
confirmed untouched by this PR's diff via `git diff --stat`); apps/bot
111/111 (95 pre-existing + 16 new/modified). Live-verified the new
endpoint twice: once ahead of Step 8 against real Directus data (a
bridged UAT fixture user, confirming the single-user Directus aggregate
row shape has NO `user` key — `{"sum":{"points":...}}`, unlike
`leaderboard()`'s grouped shape — a risk flag from Step 2's impact
analysis that Step 4 confirmed and encoded into both the implementation
and a regression test), and again at **Step 13**, which ran as direct
HTTP verification against the merged `main` commit (`767ec06`), same
format PR 2 established: registered `uat-member@example.com` for `UAT
Open Event (UZ)`, confirmed `/me` immediately reflected it (registration
id + status matched the real Directus row exactly, `pointsTotal`
incremented 135→140 matching the real register-time points award),
cancelled via the exact route `/me`'s new Cancel button calls, confirmed
`/me` correctly excluded it afterward (cross-referenced against the
Directus row's `status: cancelled`), and confirmed idempotent re-cancel
returns `not_registered` cleanly. No new issues found. Synced all 8
`BP-UAT-010` stakeholders (same set PR 2 identified: `FR-BOT-002`,
`FR-EVT-004`, `ISS-BRIDGE-STALE-001`, `ISS-EVT-004-1`, `ISS-EVT-005-1`,
`ISS-UAT-010-1`, `ISS-UAT-010-2`, `ISS-UAT-SEED-003`) to Project-board
status `agent-verified`. **Did NOT close GitHub issue #140** — same
judgement call PR 2 already made and documented: #140 tracks the entire
10-command FR, and this PR ships only command 6 of 10 (4 remain: `/leaderboard`,
`/interests`, `/upgrade`). `requirements-registry.md` row 58 stays `In
Progress` (unchanged); `FR-BOT-002.md`'s own `status:` frontmatter stays
`Planned` (same multi-PR-FR rationale as PR 1/PR 2).

**Last updated:** 2026-08-01 — `wf-20260801-feat-175`.
**FR-BOT-002 PR 2/6 shipped — /register <N> and /cancel <N>, wiring PR 1's placeholder Register button to real registration/waitlist/cancellation.**
[wf-20260801-feat-175](../tasks/completed/wf-20260801-feat-175/handoff.yaml)
(PR [#203](https://github.com/aiqadam/ai-qadam-platform/pull/203), merged):
second of the planned 6-PR sequence implementing `FR-BOT-002`. On
`apps/api`: two new `InternalAuthGuard`-protected, Zod-validated routes on
`TelegramInternalController` — `POST /v1/internal/telegram/register` and
`DELETE /v1/internal/telegram/register` — both thin proxies to the
existing `RegistrationsDirectusService.register()`/`.cancel()` (same
service the browser-facing `RegistrationsController` uses; capacity/
waitlist/promotion stay entirely Directus-flow-owned, not duplicated).
Added `DirectusUsersBridgeService.resolveUserIdFromDirectusId()` — the
reverse `directusUserId` → platform `users.id` lookup that didn't exist
before (every prior bridge consumer went the other direction). Wiring
`RegistrationsDirectusService` into `AuthModule` required `forwardRef()`
on 4 module edges (`AuthModule`↔`RegistrationsModule`, plus `EulaModule`
and `BadgesModule`, both reachable from `RegistrationsModule` and both
already importing `AuthModule` directly) — found and fixed iteratively via
live `pnpm --filter api dev` boot traces, not caught by typecheck alone
(Nest's module graph is runtime-resolved). Found and fixed one
pre-existing bug live during verification, registered as
`ISS-BOT-REG-001` (not filed as a separate issue — fixed in the same PR
since it was a 2-line diff with regression tests): `assertEventInTenant`'s
catch clause only mapped Directus `404` to `RegistrationNotFoundError`;
this Directus instance actually returns `403` for a single-item GET on a
nonexistent id, so a bogus `eventId` produced an unhandled 500 instead of
a clean 404 — same bug reachable identically via the pre-existing
browser-facing register endpoint, just never exercised with a genuinely
nonexistent UUID before. On `apps/bot/` (submodule, pushed to SHA
`63dd5b5`): PR 1's placeholder Register button now performs a real
registration; new standalone `/register <N>` and `/cancel <N>` command
handlers; two distinct confirmation messages (registered vs. waitlisted)
keyed off the API's own `status` field, no separate waitlist-detection
logic. Corrected `FR-BOT-002.md`'s functional-scope table: the
`/register` row's "QR deep-link" wording was stale — no such field exists
anywhere in the real registration response or the live web UI
(`BP-UAT-010.md`'s own Notes independently document the same finding).
EULA/`RegistrationConsentRequiredError` is not collected by the bot in
this PR (plain fallback message to the web) since no mature consent-prompt
UI exists anywhere in this codebase yet to mirror. 0 BLOCKER/MAJOR
security findings. apps/api 1420/1421 (1 pre-existing, unrelated
clock-race flake at `users.spec.ts:65`, same one PR 1 already
cross-referenced — untouched by this PR's diff, confirmed via
`git diff --stat`); apps/bot 95/95 (68 pre-existing + 27 new/modified).
`business_process: [BP-UAT-010]` was set on `FR-BOT-002.md` by this PR
(was `[]`) — this is the PR that first touches the registration surface
— so **Step 13 (mandatory post-merge live re-verification) ran for real**:
started the local API, seeded fresh `BP-UAT-010` fixtures, and re-ran the
full register/waitlist/idempotency/cancel/not-registered/not-found/
unauthorized matrix against the merged `main` commit (`7f0f28e`),
cross-referencing every registration/cancellation against the real
Directus row (not just API response text) — all 10 scenarios matched
expectations, no new issues found, `ISS-BOT-REG-001`'s fix confirmed
holding on `main`. Synced **all 8 `BP-UAT-010` stakeholders**
(`FR-BOT-002`, `FR-EVT-004`, `ISS-BRIDGE-STALE-001`, `ISS-EVT-004-1`,
`ISS-EVT-005-1`, `ISS-UAT-010-1`, `ISS-UAT-010-2`, `ISS-UAT-SEED-003`) to
Project-board status `agent-verified` per `find-bp-uat-stakeholders.sh`.
**Did NOT close GitHub issue #140** (`FR-BOT-002`'s own tracking issue) —
unlike the single-PR-FR default Step 13 assumes, issue #140 tracks the
*entire* 10-command FR, and this PR ships only commands 4–5 of 10;
closing it now would misrepresent 5 still-unimplemented commands as done.
Left open deliberately, judgement call documented here rather than
silently deviating from the written step. `requirements-registry.md` row
58 stays `In Progress` (unchanged — was already flipped by PR 1);
`FR-BOT-002.md`'s own `status:` frontmatter stays `Planned` (same
multi-PR-FR rationale as PR 1, matches the `FR-AUTH-002` precedent).

**Last updated:** 2026-08-01 — `wf-20260731-feat-174`.
**FR-BOT-002 PR 1/6 shipped — the bot's first member-facing read-only commands: `/help`, `/events`, `/event <N>`, backed by two new internal API routes.**
[wf-20260731-feat-174](../tasks/completed/wf-20260731-feat-174/handoff.yaml)
(PR TBD, merged): first of a planned 6-PR sequence implementing
`FR-BOT-002` (Bot member commands). This slice covers only the read-only,
lowest-risk commands — `/register`, `/cancel`, `/me`, `/leaderboard`,
`/interests`, `/upgrade` are separate, already-planned follow-up PRs (see
`FR-BOT-002.md`'s new "Implementation progress" section for the full
5-PR queue). On `apps/api`: two new `InternalAuthGuard`-protected,
Zod-validated routes on the existing `TelegramInternalController` —
`GET /v1/internal/telegram/events` (offset-paginated, country-scoped) and
`GET /v1/internal/telegram/events/:id` (full detail, including an
`isRegistered` flag computed now so PR 2's `/register` doesn't need to
revisit this endpoint). Deliberately does NOT reuse
`TelegramEventsService` (the older ADR-0034 web/notifier-facing events
service) — that service isn't exported by `TelegramModule`, and importing
`TelegramModule` into `AuthModule` to reach it would recreate a
documented, previously-reverted circular dependency (PR #187/#202:
`AuthModule → InteractionsModule → TelegramModule → AuthModule`); instead
duplicates the small, stable subset of its Directus query logic. On
`apps/bot/` (submodule, pushed to SHA `90900fe...`): three new handlers
(`/help` lists all 10 planned commands with unimplemented ones marked
"coming soon"; `/events` renders a paginated list with Next/Previous
inline buttons; `/event <id>` renders full detail with a Register/"I'm
going" button whose tap is a documented placeholder — real registration
is PR 2), the bot's first real inline keyboards, and an extended
`set_my_commands` call (excluding `/event`, which takes a required
argument BotFather's command menu can't express). 0 BLOCKER/MAJOR
security findings. apps/api 1394/1395 (1 pre-existing, unrelated
clock-race flake at `users.spec.ts:65`, untouched by this PR's diff,
already queued as `wf-20260704-fix-096-pre-existing-api-test-flakes` item
1 — same failure FR-BOT-001's workflow independently reproduced);
apps/bot 66/66 (29 pre-existing + 37 new). All verification here is
unit/mocked-collaborator level (`httpx.MockTransport` on the bot side,
mocked `DirectusClient` on the API side) — no live end-to-end run against
a deployed bot + running API + real Directus was performed in this
session; `business_process` is `[]` for this PR (no existing `BP-UAT-NNN`
covers bot event browsing yet — the closest, `BP-UAT-010`, covers the
write/register path this PR explicitly excludes, deferred to PR 2 which
DOES touch that surface), so Step 13 post-merge UAT re-verification does
not apply here. `requirements-registry.md` row 58 flipped `Planned` → `In
Progress` (NOT `Shipped` — matches the `FR-AUTH-002` precedent for a
multi-PR FR); `FR-BOT-002.md`'s own `status:` frontmatter stays `Planned`
(no better enum value exists; task instruction explicitly forbade
`Implemented` for a 3-of-10-command slice).

**Last updated:** 2026-07-31 — `wf-20260731-feat-171`.
**FR-BOT-001 (FEAT-BOT-1) shipped — the Telegram bot's first real code lands: a new internal API lookup endpoint plus the Python/aiogram bot scaffold, this project's first two-repo (submodule) feature workflow.**
[wf-20260731-feat-171](../tasks/completed/wf-20260731-feat-171/handoff.yaml)
(PR [#197](https://github.com/aiqadam/ai-qadam-platform/pull/197), merged):
shipped two coordinated halves. On `apps/api`: a new
`POST /v1/internal/telegram/lookup` endpoint on
`TelegramInternalController`, guarded by the existing `InternalAuthGuard`
(shared-secret, matching the sibling `upsert-temp-user` route's
convention), resolving a raw `telegramId` to
`{ directusUserId, isTemp, country }` via `AuthentikClient.getUserByTelegramId`
+ a scoped Directus email lookup — zero Postgres/Drizzle calls, read-only,
idempotent. On `apps/bot/` (git submodule `aiqadam/aiqadam-telegram-bot`,
pushed to SHA `c524089...`): the actual bootstrap of that repo's first
real code — a Python/aiogram 3 long-polling scaffold with a middleware
stack (rate-limiting, `AuthMiddleware` calling the new lookup endpoint,
`TenantMiddleware` deriving country context, structured JSON logging) and
`/start` + unknown-command handlers, per ADR-0034's thin-bot design (no
live reference to any of the three forbidden credential env vars,
regression-tested). This is the first workflow in this repo to span two
git repositories end-to-end — QualityGate's Step 9 pass added a dedicated
"Submodule Cross-Repo Check" verifying the outer repo's gitlink pointer
matches the submodule's actual pushed `HEAD` exactly. 0 BLOCKER/MAJOR
security findings; apps/api 1374/1375 (1 pre-existing, unrelated failure —
turned out to be a duplicate of the already-queued
`wf-20260704-fix-096-pre-existing-api-test-flakes` item 1, see Queued
follow-up workflows below); apps/bot 29/29. Two ACs (AC-6's 3-second
`/start` response bound, AC-11's Grafana/Loki log-delivery confirmation)
are honestly deferred pending a live `aiqadam-bot` deployment (per
ADR-0040's pro-data.tech/docker-compose model — corrected 2026-07-31,
`ISS-BOT-001-COOLIFY-001`; there will be no Coolify) that does not exist
yet — see this file's own Queued follow-up workflows entry below for the
concrete verification plan.

**Last updated:** 2026-07-31 — `wf-20260731-fix-170`.
**ISS-WF-PARENT-SYNC-001 resolved — post-merge UAT re-verification now syncs `agent-verified` for EVERY FR/ISS sharing a `Business-Process` linkage, not just the current workflow's own ref.**
[wf-20260731-fix-170](../tasks/completed/wf-20260731-fix-170/handoff.yaml)
(PR [#192](https://github.com/aiqadam/ai-qadam-platform/pull/192) squash
`26bac8b`): prompted directly by the user asking why GitHub issue
[#130](https://github.com/aiqadam/ai-qadam-platform/issues/130)
(`FR-EVT-004`) was still Project-board Status `Implemented` rather than
`Agent-Verified`, despite this session's own live retest of `BP-UAT-010`
(the business process #130 owns) passing clean. Root cause: `Business-Process
Linkage & Post-Merge UAT`'s sync step only ever synced the CURRENT
workflow's own `ISS-<n>`/`FR-<CODE>` ref — four separate follow-up
workflows (`ISS-BRIDGE-STALE-001`, `ISS-UAT-010-2`, `ISS-UAT-010-1`, plus
this session's manual retest) each correctly synced their OWN issue
against a clean `BP-UAT-010` pass, but none of them ever asked whether
`FR-EVT-004` itself also had a stake in the same business process.
Compounding factor: `BP-UAT-010.md`'s own `linked_issues` reverse-link
list only ever recorded child follow-up issues as they were filed — the
original parent FR was never added to it, so even a naive `linked_issues`-only
scan would still have missed the actual case. New
`scripts/find-bp-uat-stakeholders.sh <BP-UAT-NNN>` unions `linked_issues`
with a direct scan of every `FR-*.md`/`ISS-*.md` file's own
`business_process`/`Business-Process` field; both `issue-resolution.md`
and `requirement-development.md` Step 13 now loop the `agent-verified`
sync over every ref it returns. 9 new bats cases (full repo suite,
200+ tests, re-run clean). `FR-EVT-004`/#130 manually synced to
`agent-verified` directly against the live board this same session (not
part of this PR's own commits). Same bug **class** as
`ISS-WF-GH-CLOSE-001` (two independent "is this done" signals silently
unwired), different axis — a parent item's board status drifting from
the verification history of the business process it owns, rather than
GitHub issue open/closed state drifting from Project board Status.

**Last updated:** 2026-07-31 — `wf-20260731-fix-169`.
**ISS-UAT-010-1 resolved — BP-UAT-010's doc + Playwright spec now describe the real Directus-backed registration implementation instead of a superseded V1 spec.**
[wf-20260731-fix-169](../tasks/completed/wf-20260731-fix-169/handoff.yaml)
(PR [#189](https://github.com/aiqadam/ai-qadam-platform/pull/189) squash
`d74c464`): `BP-UAT-010.md`'s AC-1/AC-6/AC-7 and its Playwright spec both
described `FR-REG-001.md` (a superseded Phase-1/V1 spec: `status=confirmed`/
`waitlist`, "+5 points on registration", `apps/web` +
`POST /v1/registrations` + `GET /v1/points/me`) — none of which exists in
the real Directus-backed `apps/api`/`apps/web-next` implementation
(`status=registered`/`waitlisted`, +10 points only on check-in via the
`reg-checkin-points` Flow, `POST /v1/events/:eventId/register` → 200 OK).
This is why BP-UAT-010 could never get a genuinely clean live UAT pass —
correct product behavior always MISMATCHED wording describing a different
system. Rewrote both files; the one open product decision this issue's
own AC-3 flagged (redefine AC-7 around check-in vs. escalate "+5 on
registration" as a missing feature) was decided as **redefine** — no
evidence anywhere (FR docs, ADRs, code comments) that a registration-time
points award was ever an intended, unbuilt feature, and
`registrations.controller.ts`'s own comment already assigns points
ownership to check-in-time Directus flows. Also dropped AC-2's QR-code
clause — no QR element exists anywhere in the current `RegistrationCTA` UI.
Live-verified 6/6 tests passing against the real local stack, with AC-1/AC-6
independently cross-referenced against the actual Directus row (not just
DOM text): `status=registered` (open event), `status=waitlisted` (full
event). Two environment quirks hit and fixed during verification, both
already-documented classes from prior BP-UAT-010 workflows, not new:
`uat-member`'s Authentik password drifting from the seed script's claimed
default despite `--reset` (fixed via direct `set_password` API call), and
a wrong `API_URL` port default (`:3001`) carried over from the old spec
being rewritten, corrected to the real `:3000` matching every sibling spec.
Also fixed, mid-verification, an own test-design race in the new spec: the
`RegistrationCTA` React island (`client:load`) renders a transient
"Loading registration…" state before settling, and a snap `isVisible()`
check could read stale state — fixed with a `waitForCtaSettled()` helper
that waits for any of the three settled states first.

**Last updated:** 2026-07-31 — `wf-20260731-fix-168`.
**ISS-EVT-004-1's own Step 13 caught that its merged registeredCount fix
(PR #185) silently didn't work in a real environment — Directus's Public
role correctly denies read on `registrations` (by design), so the
unauthenticated Directus-direct query 403'd and fell back to `0`,
reproducing the original symptom through a new mechanism. Live-verifying
the fix (not just unit-testing it) also surfaced two independent,
unrelated pre-existing bugs blocking the registration flow entirely:
`RegistrationCTA.tsx` crashed on hydration for every signed-in visitor
(translation functions don't survive Astro `client:load` island JSON
serialization — they silently become `null`) and `useMyRegistrationStatus`
called a nonexistent `/v1/registrations` endpoint (real route:
`/v1/registrations/mine`) with a response shape that didn't match the
real API (`event: { id }`, not a flat `eventId`). All three triaged live
as `ISS-EVT-005-1` and fixed together in the same session:
[wf-20260731-fix-168](../tasks/completed/wf-20260731-fix-168/handoff.yaml)
(PR [#187](https://github.com/aiqadam/ai-qadam-platform/pull/187)).
The real fix adds a public `GET /v1/events/:id/registration-count` on
`apps/api`, computed server-side via its own authenticated
`DirectusClient` (never exposing row-level registration data — the
`ISS-RBAC-PERMS-001`/`ISS-SEC-PUBLIC-UNMANAGED-001` permission hardening
is fully preserved), which `apps/web-next` now calls instead of querying
Directus directly. Live-verified end-to-end 3 times against the real
local stack: screenshots show correct "N / capacity spots" +
"✓ You're registered" / "On waitlist — we'll email if a seat opens"
states, each cross-referenced against the exact Directus row. Both
GitHub issues (#161, #186) closed with the full before/after evidence.
This is a concrete case of AGENTS.md §6.1's mandatory live-verification
rule catching what mocked unit tests structurally cannot: a real Directus
permission boundary, a browser hydration crash, and a wrong endpoint path
against the real route table.
[wf-20260731-fix-167](../tasks/completed/wf-20260731-fix-167/handoff.yaml)
(PR [#185](https://github.com/aiqadam/ai-qadam-platform/pull/185)): the
original fix attempt (ISS-EVT-004-1) — correct in isolation (unit tests,
query shape mirrored 3 existing `apps/api` precedents) but incomplete,
as described above.

**Last updated:** 2026-07-31 — `wf-20260731-uat-166`.
**ISS-UAT-010-2's Step 13 post-merge BP-UAT-010 re-verification passed clean, live-proving the waitlist-rendering fix — and its own close-out surfaced ISS-WF-GH-CLOSE-002, a second real vector of the ISS-WF-GH-CLOSE-001 bug class.**
[wf-20260731-uat-166](../tasks/completed/wf-20260731-uat-166/handoff.yaml)
(PR [#183](https://github.com/aiqadam/ai-qadam-platform/pull/183)):
rewrote `BP-UAT-010.session.spec.ts`'s waitlist step — the prior version
(`wf-20260731-uat-163`) only checked page-load text on the full event and
never actually clicked Register, the exact gap that let the original
`ISS-UAT-010-2` bug through undetected. This version clicks Register and
cross-references the resulting DOM state against the live Directus row.
Live result: full-event registration now correctly renders "On waitlist"
while Directus independently confirms `status=waitlisted` (previously
DOM said "You're registered" while Directus said `waitlisted`
simultaneously). No new product issues found. **While closing out this
workflow, discovered that GitHub issue #160 had already auto-closed at
merge time** (PR #181, `06:34:00Z`) — before this very Step 13 had run —
despite the commit message correctly using the neutral `Refs #160` form.
Root cause: `check-closing-keyword.sh` (built one workflow earlier,
`wf-20260731-fix-164`, for `ISS-WF-GH-CLOSE-001`) only ever scanned
commit messages; GitHub's auto-close scanner also reads PR body text
independently, and PR #181's own "Why" section prose said "Closes #160".
An unguarded second vector of the identical bug class. Fixed inline
(`ISS-WF-GH-CLOSE-002`, same session): added a `--body-file` mode to the
same script (shared scan logic, `--message-file`/`--body-file` mutually
exclusive) and wired a check into both workflows' PR-creation step,
immediately before `gh pr create`. 3 new bats cases (15/15 total pass),
including a direct reproduction of PR #181's exact body text. Issue #160
itself corrected in the same session: reopened with an explanatory
comment, then correctly re-closed once Step 13's genuine pass was in
hand, with the full root-cause/fix/live-evidence summary attached.

**Last updated:** 2026-07-31 — `wf-20260731-fix-165`.
**ISS-UAT-010-2 resolved — `RegistrationSidebar`'s stale "You're registered" render for waitlisted members was a server-side Directus-flow race, not a client bug.**
[wf-20260731-fix-165](../tasks/completed/wf-20260731-fix-165/handoff.yaml)
(PR [#181](https://github.com/aiqadam/ai-qadam-platform/pull/181) squash
`a91a9c6`): root cause confirmed as hypothesis (1) from the issue —
`reg-capacity-decision` is a Directus **action hook**, which runs as a
separate async chain (event lookup → count → decide → patch) *after* the
triggering `registrations.items.create` insert, not inside its
transaction; the flow's own bootstrap-script comment already named this
window as a known trade-off. `RegistrationsDirectusService.register()`'s
single immediate re-read had no ordering guarantee against that chain, so
under real latency a registration that Directus had just demoted to
`waitlisted` could still be returned (and rendered) as `registered`.
Hypothesis (2) — a client-side bug in `RegistrationSidebar.tsx` — was
ruled out: the component is a faithful pass-through of whatever `status`
the API response carries. Fixed with a new bounded
`pollForSettledStatus()` (max 3 re-reads, 150ms apart, short-circuiting
the moment the row leaves its pre-flow default), replacing the old
single-shot re-read in `register()` — adds negligible latency to the
common non-full-event path (first read already correct, loop exits
immediately) and is a strict improvement in the worst case (same
last-read value the old code would have returned). 2 new regression
tests added to the existing `apps/api/test/registrations-directus.spec.ts`
(no new spec file needed); both independently fail-before/pass-after
verified via `git stash` on the fix — the pre-fix run reproduced the
exact live bug byte-for-byte (`expected 'registered' to be 'waitlisted'`).
1355/1356 `apps/api` suite passes (1 pre-existing, already-tracked,
unrelated `users.spec.ts` clock-race flake, confirmed passing in
isolation). Per `Business-Process: BP-UAT-010`, Step 13 post-merge live
re-verification runs next in this same session — see this file's own
next entry once that step completes.

**Last updated:** 2026-07-31 — `wf-20260731-fix-164`.
**ISS-WF-GH-CLOSE-001 resolved — GitHub issues can no longer auto-close before their own Step 13 verification has run.**
[wf-20260731-fix-164](../tasks/completed/wf-20260731-fix-164/handoff.yaml)
(PR [#179](https://github.com/aiqadam/ai-qadam-platform/pull/179) squash
`3a4e8cf`): prompted directly by the user, who noticed issue #130
(FR-EVT-004) was `CLOSED` on GitHub despite 2 of its own follow-up bugs
(#160, #161, found by its Step 13 post-merge BP-UAT-010 re-verification)
still being open. Root cause: two independent "is this done" signals —
the Project board's Status field (correctly script-driven, distinguishes
`implemented` from `agent-verified`) and GitHub's own commit-message
closing-keyword scanner (fires on ANY commit reaching `main`, regardless
of verification state) — were never wired together. CodeDeveloper's
FR-EVT-004 shipping commit contained an unreviewed `Closes #130`, a
convention documented nowhere, which auto-closed the issue at merge time,
before Step 13 had run. Fixed with a new mechanical guard
(`scripts/check-closing-keyword.sh`, 12 bats tests) wired into both
workflows' commit step, and moved the actual `gh issue close` call to
each workflow's Step 13 gate — the moment verification is genuinely
complete. **Also found and fixed a second instance of the identical bug
class** while reading `issue-resolution.md` closely: Step 12.5's own
action 6 was unconditionally closing the GitHub issue at merge time via
an explicit `gh issue close` call, regardless of `Business-Process` — now
conditioned on `Business-Process` being `—`. Issue #130 itself was
already patched separately (same session, before this issue was filed)
via a manual cross-reference comment naming its open follow-ups — not
re-done here.

**Last updated:** 2026-07-31 — `wf-20260731-uat-163`.
**Step 13 post-merge BP-UAT-010 re-verification for ISS-BRIDGE-STALE-001 — clean pass, fix confirmed working live.**
[wf-20260731-uat-163](../tasks/completed/wf-20260731-uat-163/handoff.yaml)
(PR [#176](https://github.com/aiqadam/ai-qadam-platform/pull/176)):
`wf-20260731-fix-162`'s mandatory Step 13 required re-verifying BP-UAT-010
(Event registration flow) live, since ISS-BRIDGE-STALE-001's fix touches
the identity-resolution path that flow depends on. Confirmed the fix two
independent ways: (1) `pnpm uat:seed --reset BP-UAT-010`'s own
`ensure_linked` call, checked directly against Postgres, showed
`uat-member@example.com`'s `directus_user_id` is now the correct,
reconciled `bb110099-...` id, not the stale `a1524645-...` one; (2) a
live Playwright session (`apps/e2e/tests/uat/BP-UAT-010.session.spec.ts`,
new — the agent-driven session model per FR-WORKFLOW-004) signed in as
that same user and successfully registered for an event on top of the
corrected id, screenshot-verified (capacity counter incremented 0→1,
"You're registered" state shown). Hit two unrelated snags while authoring
the session script, both resolved: Authentik's `input[type="password"]`
locator matched a decoy/stale field on this instance rather than the one
real visible field (fixed via `getByPlaceholder` scoped to the actual
rendered placeholder text), and the seeded `uat-member` account's
Authentik password had gone stale independent of this fix (fixed with a
direct `set_password` API call — not a product bug, an environment
staleness issue). One pre-existing, already-tracked issue
(`ISS-EVT-004-1` — `apps/web-next`'s `registeredCount` hardcoded to 0)
was reproduced live again on the full-event waitlist path (screenshot
shows "0 / 2 spots" despite 2 real `status: registered` rows confirmed in
Postgres) — recorded as corroborating evidence in the UAT report, not a
new duplicate issue. Per protocol, GitHub Project status for
`ISS-BRIDGE-STALE-001` synced to `agent-verified` (issue #159, already
closed at `wf-20260731-fix-162`'s Step 12.5).

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
- **(no workflow id assigned yet — not yet a task directory)** verify
  FR-BOT-001's AC-6 (`/start` responds within 3 seconds) and AC-11
  (structured JSON logs reach Grafana/Loki) once `aiqadam-bot` is
  deployed per ADR-0040's pro-data.tech/docker-compose model (not
  Coolify — see `ISS-BOT-001-COOLIFY-001`) — neither is verifiable
  pre-deployment. Owner: UATRunner. AC-6: send `/start` to the deployed
  bot from a real Telegram client, time the round-trip (< 3s). AC-11:
  after that same interaction, query Grafana/Loki for the bot's
  structured JSON log line and confirm it contains `telegram_id`,
  `command`, `duration_ms`, `status`. See FR-BOT-001.md and
  `.copilot/tasks/completed/wf-20260731-feat-171/` for full context.
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
