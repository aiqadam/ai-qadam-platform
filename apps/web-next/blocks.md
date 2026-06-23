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
| `/workspace/admin/users` | Admin: user management | authed |
| `/workspace/admin/audit` | Admin: audit log | authed |
| `/workspace/admin/countries` | Admin: country list | authed |
| `/workspace/admin/countries/[code]/provisioning` | Admin: country provisioning | authed |
| `/workspace/admin/cron` | Admin: cron health | authed |
| `/workspace/admin/rbac-sync` | Admin: RBAC sync | authed |
| `/forms/[slug]` | Public form submission page | anon (authed if !allow_anonymous) |
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
