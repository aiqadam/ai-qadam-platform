# blocks.md — web-next block registry

> Registry of all Astro page routes and React island blocks in `apps/web-next`.
> Updated per FR-MIG execution constraint: every block add/edit updates this file in the same PR.

## Page routes (SSR)

| Route | Description | Auth |
|---|---|---|
| `/` | Homepage with Hero | anon |
| `/events` | Event discovery list | anon |
| `/events/[id]` | Event detail page | anon |
| `/leaderboard` | Gamification leaderboard | anon |
| `/u/[handle]` | Public member profile | anon |
| `/me/profile` | Member profile editor | authed |
| `/auth/sign-in` | Initiates OIDC flow → Authentik | anon |
| `/auth/signed-out` | RP-logout landing, clears cookies | anon |
| `/workspace` | Operator root (redirects to dashboard) | authed |
| `/workspace/dashboard` | Operator dashboard | authed |
| `/workspace/members` | Member directory with filters | authed |
| `/workspace/events` | Events cabinet | authed |
| `/workspace/events/[id]` | Event control panel | authed |
| `/workspace/partners` | Partner profiles | authed |
| `/workspace/partners/[slug]` | Partner detail | authed |
| `/workspace/forms` | Form builder list | authed |
| `/workspace/forms/[id]` | Form builder cabinet | authed |
| `/workspace/forms/[id]/responses` | Form responses inbox | authed |
| `/workspace/announce` | Announcement composer | authed |
| `/workspace/approvals` | Registration approvals | authed |
| `/workspace/site-settings` | Operator: homepage hero, footer links, contact/social | authed |
| `/workspace/sponsors` | Operator: sponsor list with tier filter | authed |
| `/workspace/sponsors/new` | Operator: create sponsor record | authed |
| `/workspace/sponsors/[id]` | Operator: edit sponsor record | authed |
| `/workspace/press` | Operator: press asset manager (prose, team bios, platform stats) | authed |
| `/workspace/badges` | Operator: badge definitions list + grant dialog + award history with revoke | authed |
| `/workspace/admin/users` | Admin: user management | authed |
| `/workspace/admin/audit` | Admin: audit log | authed |
| `/workspace/admin/countries` | Admin: country list | authed |
| `/workspace/admin/countries/[code]/provisioning` | Admin: country provisioning | authed |
| `/workspace/admin/cron` | Admin: cron health | authed |
| `/workspace/admin/rbac-sync` | Admin: RBAC sync | authed |
| `/forms/[slug]` | Public form submission page | anon (authed if !allow_anonymous) |
| `/checkin` | Event-day QR check-in page (operator + self-serve modes) | anon |
| `/feedback/csat` | Public CSAT 1-5 rating + comment form (token-gated) | anon |
| `/events/[id]/survey` | Post-event survey (SSR, fetches form attached to event) | anon |
| `/leads/thank-you` | Lead form submission confirmation (SSG) | anon |
| `/leads/verified` | Lead email verified landing (SSG) | anon |
| `/leads/verify-failed` | Lead verification failed/error (SSG) | anon |
| `/press` | Press kit with hero, contact, leadership, logos, brand colors, fact sheet, digests, coverage | anon |
| `/global` | Global community splash with UZ/KZ/TJ country tiles | anon |
| `/marketing/url-builder` | UTM URL builder island shell | anon |
| `/workspace/integrations/telegram/segments` | Telegram audience segments | authed |

## L1 lib hooks

L1 runtime functions that blocks and pages import.

| Hook | File | Purpose |
|---|---|---|
| `signOut()` | `lib/sign-out.ts` | Explicit sign-out (clears session + IdP SLO) |
| `useTgSegments()` | `lib/use-tg-segments.ts` | Telegram segment CRUD hooks |
| `useCronStatus()` | `lib/use-cron-status.ts` | Cron job health status hook |
| `useRbacSyncJobs()` | `lib/use-rbac-sync.ts` | RBAC sync jobs list + trigger hook |
| `usePublicForm()` | `lib/use-public-form.ts` | Public form fetch + submission hooks |
| `useCheckin()` | `lib/use-checkin.ts` | Event-day check-in mutation hook |
| `useSponsors()` | `lib/use-sponsors.ts` | Sponsor list query hook |
| `useSponsorDetail()` | `lib/use-sponsors.ts` | Per-sponsor detail query hook |
| `useCreateSponsor()` | `lib/use-sponsors.ts` | Sponsor create mutation hook |
| `useUpdateSponsor()` | `lib/use-sponsors.ts` | Sponsor update mutation hook |
| `useUploadLogo()` | `lib/use-sponsors.ts` | Logo file upload mutation (MinIO via /v1/admin/uploads) |
| `useBadges()` | `lib/use-badges.ts` | Badge definitions list query hook |
| `useBadgeAwards()` | `lib/use-badges.ts` | Badge award history query hook (optionally filtered by badge_id) |
| `useGrantBadge()` | `lib/use-badges.ts` | Grant badge mutation hook (POST /v1/admin/badges/grant) |
| `useRevokeBadgeAward()` | `lib/use-badges.ts` | Revoke badge award mutation hook (POST /v1/admin/badges/awards/:id/revoke) |
| `searchMembers()` | `lib/use-badges.ts` | Async member search for the grant dialog AsyncSelect |

## Common blocks

| Block | File | Type |
|---|---|---|
| `<AppNav>` | `blocks/common/AppNav.astro` | L3 |
| `<AppFooter>` | `blocks/common/AppFooter.astro` | L3 |
| `<PageHead>` | `blocks/common/PageHead.astro` | L3 |
| `<CountrySwitcher>` | `blocks/common/CountrySwitcher.astro` | L3 |
| `<LocaleSwitcher>` | `blocks/common/LocaleSwitcher.astro` | L3 |
| `<AuthGate>` | `blocks/common/AuthGate.astro` | L3 |
| `<EmptyState>` | `blocks/common/EmptyState.astro` | L3 |
| `<DateTime>` | `blocks/common/DateTime.astro` | L3 |
| `<TimeRange>` | `blocks/common/TimeRange.astro` | L3 |
| `<MarkdownBody>` | `blocks/common/MarkdownBody.astro` | L3 |
| `<AccountChip>` | `blocks/common/AccountChip.tsx` | L2 island |
| `<Tooltip>` | `blocks/common/Tooltip.tsx` | L2 island |
| `<Drawer>` | `blocks/common/Drawer.tsx` | L2 island |

## Form blocks (L2)

| Block | File | Purpose |
|---|---|---|
| `<Form>` | `blocks/form/Form.tsx` | Zod-driven form with server action |
| `<AsyncSelect>` | `blocks/form/AsyncSelect.tsx` | Server-search dropdown |

## Workspace blocks (L2/L3)

| Block | File | Purpose |
|---|---|---|
| `<ActionBar>` | `blocks/workspace/ActionBar.tsx` | Contextual action row |
| `<MembersList>` | `blocks/workspace/MembersList.tsx` | Member directory with filter panel |
| `<SaveCohortModal>` | `blocks/workspace/SaveCohortModal.tsx` | Cohort save/load dialog |
| `<EventEditForm>` | `blocks/workspace/EventEditForm.tsx` | Event metadata editor |
| `<AnnounceComposer>` | `blocks/workspace/AnnounceComposer.tsx` | Announcement form with cohort selection |
| `<InvitesList>` | `blocks/workspace/InvitesList.tsx` | Invite management |
| `<CountriesList>` | `blocks/workspace/CountriesList.tsx` | Country list with provisioning |
| `<SiteSettingsForm>` | `blocks/workspace/SiteSettingsForm.tsx` | Homepage singleton editor: hero + footer links + contact forms |
| `<SponsorsList>` | `blocks/workspace/SponsorsList.tsx` | Sponsor directory DataTable with tier-chip filter + "New sponsor" link |
| `<SponsorForm>` | `blocks/workspace/SponsorForm.tsx` | Create/edit sponsor: name, tier, website, logo upload, event multi-select |
| `<PressAssetManager>` | `blocks/workspace/PressAssetManager.tsx` | Press asset manager: press page prose editor + team bios repeater + platform stats form |
| `<BadgesCabinet>` | `blocks/workspace/BadgesCabinet.tsx` | Tabbed cabinet: badge definitions tab + award history tab in one island |
| `<BadgesListInner>` | `blocks/workspace/BadgesList.tsx` | Badge definitions DataTable with grant dialog (member AsyncSelect + badge picker + note) |
| `<BadgeAwardHistoryInner>` | `blocks/workspace/BadgeAwardHistory.tsx` | Award history DataTable with per-badge filter chips + revoke dialog |

| `<FormBuilder>` | `blocks/workspace/FormBuilder.tsx` | Drag-and-drop form builder with 7 field types |
| `<FormBuilderCabinet>` | `blocks/workspace/FormBuilderCabinet.tsx` | Per-form builder + metadata editor |
| `<FormResponsesCabinet>` | `blocks/workspace/FormResponsesCabinet.tsx` | Responses inbox with aggregate + CSV export |
| `<CriteriaBuilder>` | `blocks/workspace/CriteriaBuilder.tsx` | Segment criteria DSL builder (AND/OR, country, events, topics) |
| `<CronStatusTable>` | `blocks/workspace/CronStatusTable.tsx` | Cron job health table with refresh |
| `<RbacSyncList>` | `blocks/workspace/RbacSyncList.tsx` | RBAC sync jobs list with filter + trigger |
| `<TgSegmentsList>` | `blocks/workspace/TgSegmentsList.tsx` | Telegram audience segments list + create/edit |
| `<TgBroadcastsList>` | `blocks/workspace/TgBroadcastsList.tsx` | Telegram broadcasts list with status filter |
| `<TgBroadcastComposer>` | `blocks/workspace/TgBroadcastComposer.tsx` | Telegram broadcast composer with buttons, segment picker, scheduler |

## Customer blocks (L2)

| Block | File | Purpose |
|---|---|---|
| `<FormRenderer>` | `blocks/customer/FormRenderer.tsx` | Public form submission with 7 field types |
| `<EventCard>` | `blocks/customer/EventCard.tsx` | Event listing card |
| `<LeaderboardRow>` | `blocks/customer/LeaderboardRow.tsx` | Leaderboard entry |
| `<ProfileCard>` | `blocks/customer/ProfileCard.tsx` | Public profile card |
| `<SkillTagger>` | `blocks/customer/SkillTagger.tsx` | Skill tag editor |
| `<OnboardingForm>` | `blocks/customer/OnboardingForm.tsx` | 3-step new-member onboarding wizard (profile basics, skills+interests, consents) |
| `<ForumThread>` | `blocks/customer/ForumThread.tsx` | Discussion thread |

## CsatForm (customer)

**File:** `src/blocks/customer/CsatForm.tsx`

CSAT (Customer Satisfaction) form with 1-5 rating and optional comment.

**Props:**
- `token: string` — CSAT token for submission
- `onSuccess?: () => void` — callback on successful submission

**States:** idle | submitting | success | already-submitted | error

## Check-in blocks (L3)

| Block | File | Purpose |
|---|---|---|
| `<CheckinOperator>` | `blocks/checkin/CheckinOperator.tsx` | Event-day QR check-in with camera scanner, manual entry, offline queue, member display |

## Marketing blocks (L2)

| Block | File | Purpose |
|---|---|---|
| `<UtmUrlBuilder>` | `blocks/marketing/UtmUrlBuilder.tsx` | UTM URL builder with live preview + copy-to-clipboard |

## UtmUrlBuilder (marketing)

**File:** `src/blocks/marketing/UtmUrlBuilder.tsx`

UTM URL builder island for marketing operators.

**Props:** none (standalone)

**States:** idle | has-url | copied | error

**Features:**
- 5 fields with validation
- Live URL preview
- Copy to clipboard
