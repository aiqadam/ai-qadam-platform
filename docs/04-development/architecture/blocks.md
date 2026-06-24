# Block catalogue (L3)

> **Location note:** moved from `docs/architecture/blocks.md` to
> `docs/04-development/architecture/blocks.md` as part of the 5-layer
> doc restructure (ADR-0039).
>
> The discovery surface for every L3 block in `apps/web-next/src/blocks/`.
> ADR-0038 mandates: editing a block requires editing this doc in the
> SAME PR. The `architecture-check` CI rule enforces it.
>
> Each block entry: import path, props type signature, current
> consumers (pages), Storybook story link, the Directus collection(s)
> or API endpoint(s) it consumes.

## How to use this catalogue

**Before writing new UI code in a page:**

1. Search this doc for a block that fits.
2. If one exists → import it, pass props, done.
3. If none exists → either:
   - **Extend** an existing block (preferred) — open a PR that adds
     props to the existing block + updates this doc.
   - **Add** a new block — open a PR that adds the block under the
     right folder + adds an entry to this doc + adds a Story.

**Never** write the inline equivalent in a page. The `architecture-check`
will reject it.

## Layer 2 (kit atoms) — for reference

These are the underlying shadcn-based atoms that blocks compose. Not
"blocks" per se; documented here so block authors know the palette.

| Atom | Import | Props (short form) | Story |
|---|---|---|---|
| `<Button>` | `@/kit` | `variant: primary \| secondary \| ghost \| outline; size: sm \| md \| lg` | [link]() |
| `<Input>` | `@/kit` | `type, value, onChange, error?` | [link]() |
| `<Card>` | `@/kit` | `title?, footer?, children` | [link]() |
| `<Badge>` | `@/kit` | `variant: default \| primary \| success \| warning \| destructive` | [link]() |
| `<Tabs>` | `@/kit` | `value, onValueChange, children` | [link]() |
| `<Toast>` | `@/kit` | `variant, title, description` | [link]() |
| `<Dialog>` | `@/kit` | `open, onOpenChange, title, children` | [link]() |
| `<Select>` | `@/kit` | `value, onValueChange, options` | [link]() |
| `<Drawer>` | `@/kit` | Radix Dialog side-sheet: `Drawer` / `DrawerTrigger` / `DrawerContent side='right'\|'left'` / `DrawerHeader` / `DrawerFooter` / `DrawerTitle` / `DrawerDescription` / `DrawerClose` (M1.1) | `L2 Kit / Drawer` story |
| `<Tooltip>` | `@/kit` | `content, children, side?, align?` | [L2 Kit / Tooltip](https://storybook.aiqadam.org/?path=/story/l2-kit-tooltip--default) |

## Layer 3 (blocks) — the catalogue

### Customer-facing blocks — `apps/web-next/src/blocks/customer/`

> Populated per PR in Phase 1. Empty entries are placeholders showing
> the expected shape; "—" = not yet implemented.

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<Hero>` | `@/blocks/customer` | `description: string, stats?: {label,value}[], primaryHref?, primaryLabel?, secondaryHref?, secondaryLabel?` | `pages/index.astro` (PR 1.1) | Astro-only — no story (see §Storyless Astro blocks below) | `site_settings.default_description` |
| `<EventCard>` | `@/blocks/customer` | `event: ApiEvent` | `pages/events.astro` (PR 1.2) + planned homepage strip | Astro-only — no story | `events` row |
| `<EventsGrid>` | `@/blocks/customer` | `events: ApiEvent[], emptyHeading?, emptyDescription?` | `pages/events.astro` (PR 1.2) | Astro-only — no story | `events` (list) |
| `<EventDetail>` | `@/blocks/customer` | `event: ApiEvent` (accepts `<slot/>` for sub-blocks like SpeakerGrid / MaterialsList / SponsorWall) | `pages/events/[id].astro` (PR 1.3) | Astro-only — no story | `events` |
| `<SpeakerGrid>` | `@/blocks/customer` | `speakers: EventSpeaker[]` | `pages/events/[id].astro` (PR 1.3) | Astro-only — no story | `event_speakers` |
| `<SponsorWall>` | `@/blocks/customer` | `sponsors: EventSponsor[], heading?` | `pages/events/[id].astro` (PR 1.3) | Astro-only — no story | `event_sponsors` |
| `<MaterialsList>` | `@/blocks/customer` | `materials: EventMaterial[], heading?` | `pages/events/[id].astro` (PR 1.3) | Astro-only — no story | `event_materials` |
| `<RegistrationCTA>` | `@/blocks/customer` | `eventId: string, capacity: number\|null, registeredCount: number` (React island — uses `useAuth` + `useMyRegistrationStatus` + register/cancel mutations from `lib/use-registrations`) | `pages/events/[id].astro` (PR 1.4) | Storyless — interactive island needs provider mocks (see §Provider-coupled blocks below) | `registrations` (read + write) |
| `<ShareButtons>` | `@/blocks/customer` | `eventId, eventTitle, eventUrl` | `pages/events/[id].astro` (PR 1.4) | Astro-only — no story | n/a (uses `lib/share-urls.ts` builder) |
| `<ProfileCard>` | `@/blocks/customer` | `profile: PublicProfile, mode?: 'public'\|'self'` (accepts `<slot/>` so /me can mount the editor under the public card) | `pages/u/[handle].astro` (PR 1.5a); planned `pages/me/profile.astro` (PR 1.5b) | Astro-only — no story | `directus_users` (via `/v1/users/:handle/profile`) |
| `<ConsentList>` | `@/blocks/customer` | _(no props — reads via `useMyFullProfile()` + writes via `useUpdateConsent()` from `lib/use-me-profile`)_ | `pages/me/profile.astro` (PR 1.5b) | Storyless — interactive island needs provider mocks | `member_consents` (read+write) |
| `<SkillTagger>` | `@/blocks/customer` | _(no props — reads via `useMyFullProfile()` + writes via `useAddSkill` / `useRemoveSkill`)_; PR 1.5b ships skills only — interests + employments come in 1.5c | `pages/me/profile.astro` (PR 1.5b) | Storyless — interactive island needs provider mocks | `member_skills` (read+write) |
| `<Leaderboard>` | `@/blocks/customer` | `entries: LeaderboardEntry[], window: LeaderboardWindow` | `pages/leaderboard.astro` (PR 1.6) | Astro-only — no story | `point_awards` (aggregate) |
| `<AvatarStack>` | `@/blocks/customer` | _(deferred — Leaderboard renders avatar initials inline; extract when a second consumer needs it)_ | — | — | n/a |
| `<FormRenderer>` | `@/blocks/customer` | `form: PublicForm, onSubmitSuccess?: () => void` (React island — renders all 7 field types: short_text, long_text, yes_no, select_one, select_many, scale, speaker_rating; submission via `submitForm` from `lib/use-public-form`; success state disables re-submission) | `pages/forms/[slug].astro` (FR-MIG-019) | Storyless — interactive island needs provider mocks | `lib/types.ts` (PublicForm) |
| `<ForumThread>` | `@/blocks/customer` | `eventId: string, eventTitle: string, initialQuestions: EventQuestion[]` (React island — anon read seeded via SSR-prop; signed-in post via `useAuth()` + `usePostQuestion()` from `lib/use-event-forum`) | `pages/events/[id].astro` (PR 1.7) | Storyless — interactive island needs provider mocks | `event_questions` (read SSR via Directus Public policy; write via `/v1/events/:id/questions`) |
| `<CsatForm>` | `@/blocks/customer` | `token: string, onSuccess?: () => void` (React island — one-shot CSAT submission; phases: idle/submitting/success/already/error; self-wraps in `<IslandRoot>`; submits via `apiClient` to `/v1/csat/:token`) | `pages/feedback/csat.astro` (FR-MIG-022) | Storyless — interactive island needs provider mocks | `/v1/csat/:token` (POST) |

### Checkin blocks — `apps/web-next/src/blocks/checkin/`

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<CheckinOperator>` | `@/blocks/checkin` | `eventId: string` (React island — operator QR-scan + manual-token check-in flow; avatar display uses dynamic pixel size via inline style; self-wraps in `<IslandRoot>`; uses `useCheckin` hook) | `pages/checkin.astro` (FR-MIG-021) | Storyless — interactive island needs provider mocks | `/v1/checkin` (POST) |

### Operator workspace blocks — `apps/web-next/src/blocks/workspace/`

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<PageShell>` | `@/blocks/workspace` | `title: string, description?: string, width?: 'narrow' \| 'standard' \| 'wide'` (named slots: `breadcrumbs`, `actions`; default slot = body; composes `<WorkspaceNav>` left rail since M0.3) | every `/workspace/*` cabinet | Astro-only — no story | n/a (presentation) |
| `<WorkspaceNav>` | `@/blocks/workspace` | _(no props — persistent left rail; cabinet links highlighted from `Astro.url.pathname`; super-admin "Admin" section gated on `Astro.locals.auth` groups)_ | `<PageShell>` (M0.3) | Astro-only — no story | `Astro.locals.auth` (SSR) |
| `<Breadcrumbs>` | `@/blocks/workspace` | `items: { label: string, href?: string }[], class?: string` (final item rendered without link as `aria-current=page`) | `pages/workspace/members/index.astro` (PR 2.2) | Astro-only — no story | n/a |
| `<DataTable>` | `@/blocks/workspace` | `columns: { key, label, render, width?, align? }[], rows: TRow[], rowKey?, pagination?: { page, totalPages, onChange }, isLoading?, errorMessage?, emptyHeading?, emptyDescription?` (React island — generic over `TRow`) | `<MembersList>` (PR 2.2) | Storyless — interactive island needs provider mocks | generic (caller provides rows) |
| `<MembersList>` | `@/blocks/workspace` | _(no props — owns pagination + search + filter state, reads via `useMembersSearch()`; composes `<MembersFilterPanel>`)_ | `pages/workspace/members/index.astro` (PR 2.2; fix-F 2026-05-30 drops `display_name` from the name fallback — Directus's `directus_users` has no such field; `first_name` is the only render source) | Storyless — interactive island needs provider mocks | `/v1/workspace/members` |
| `<MembersFilterPanel>` | `@/blocks/workspace` | `applied: MemberFilters, onApply: (next) => void` (Drawer with 7 filter primitives → `buildMemberFilter` Directus clause; first `<Drawer>` consumer) | `<MembersList>` (M2.3a) | Storyless — interactive island needs provider mocks | n/a (builds the filter `<MembersList>` sends) |
| `<SavedCohortsPanel>` | `@/blocks/workspace` | `onLoadCohort?: (cohort) => void` (horizontal list of saved cohorts, reads via `useCohorts()` + writes via `useDeleteCohort()` from `lib/use-cohorts`; each card has a Delete control + a Load click area when `onLoadCohort` is passed). Nested inside `<MembersList>` so the load callback shares React state via `parseDirectusToMemberFilters`. | `<MembersList>` (M2.3b-i/ii/iii/iv 2026-05-30) | Storyless — interactive island needs provider mocks | `/v1/workspace/cohorts` (GET + DELETE) |
| `<AnnounceComposer>` | `@/blocks/workspace` | _(no props — owns cohort + subject + body + consent-basis state, reads cohorts via `useCohorts()`, posts preview via `usePreviewAnnounce()` + send via `useSendAnnounce()` from `lib/use-announce`; renders `<SentSummary>` with delivery breakdown after a successful send)_ | `pages/workspace/announce/index.astro` (M2.4-i+ii 2026-05-30) | Storyless — interactive island needs provider mocks | `/v1/workspace/cohorts` (GET) + `/v1/workspace/announce/preview` + `/v1/workspace/announce` (POST) |
| `<CountryProvisioningWizard>` | `@/blocks/workspace` | `code: string` (super-admin cabinet; reads via `useProvisioningState(code)` + writes via `useRunProvisioning(code)` / `useActivateCountry(code)` / `useManualCompleteStep(code)` from `lib/use-provisioning`; renders the M1 `<Wizard>` atom with per-step pills + a detail strip + action footer). Idempotent Start/Re-run (POST .../run); Activate enables only when every step is `succeeded` (POST .../activate); `awaiting_manual` steps surface an "I've done it" button + an "Open Plausible →" prefill link (POST .../steps/:id/manual-complete). | `pages/workspace/admin/countries/[code]/provisioning/index.astro` (M2.5-i+ii+iii 2026-05-30) | Storyless — interactive island needs provider mocks | `/v1/admin/countries/:code/provisioning` (GET) + `.../run` + `.../activate` + `.../steps/:id/manual-complete` (POST) |
| `<CountriesList>` | `@/blocks/workspace` | _(no props — reads via `useCountries()`; renders DataTable with status badges; "Provision" action links to provisioning wizard per country)_ | `pages/workspace/admin/countries/index.astro` (FR-MIG-012) | Storyless — interactive island needs provider mocks | `/v1/workspace/countries` |
| `<SaveCohortModal>` | `@/blocks/workspace` | `open: boolean, onOpenChange: (open) => void, filterQuery: Record<string, unknown>` (Radix Dialog, captures name + optional description, posts via `useSaveCohort()` from `lib/use-cohorts`; on success invalidates the cohorts list so `<SavedCohortsPanel>` picks the new entry up) | `<MembersList>` (M2.3b-ii 2026-05-30) | Storyless — interactive island needs provider mocks | `POST /v1/workspace/cohorts` |
| `<InvitesList>` | `@/blocks/workspace` | _(no props — list + inline create form + revoke action; reads via `useInvites()`, writes via `useCreateInvite()` / `useRevokeInvite()` from `lib/use-invites`)_ | `pages/workspace/admin/users/index.astro` (PR 2.3a) | Storyless — interactive island needs provider mocks | `/v1/admin/invites` |
| `<KpiTile>` | `@/blocks/workspace` | `label: string, value?, unit?, hint?, isPending?, tone?: 'default' \| 'accent'` (pure presentation; no fetch) | `<DashboardKpis>` (PR 2.4) | Storyless — interactive island needs provider mocks | aggregates (caller-provided) |
| `<DashboardKpis>` | `@/blocks/workspace` | _(no props — owns country + range state; reads via `useCountryMetrics` + `useCrossCountryMetrics` from `lib/use-dashboard`)_ | `pages/workspace/dashboard/index.astro` (PR 2.4) | Storyless — interactive island needs provider mocks | `/v1/workspace/dashboard/country` + `/cross-country` |
| `<ActionBar>` | `@/blocks/workspace` | `actions: Action[], sticky?: boolean, className?: string` | M2.2, M2.4, M2.5, M2.7 operator write cabinets | — | n/a |
| `<Form>` | `@/blocks/workspace` | `schema: ZodSchema<T>, onSubmit: (data: T) => void, defaultValues?: Partial<T>` (React island — auto-renders labelled fields from Zod schema: text, textarea, number, date, select, checkbox, async-select; inline validation on blur + submit; submit button disables + shows spinner while mutation is in-flight; `onSubmit` receives typed, validated data — no raw `FormData`) | M2.2, M2.4, M2.5 operator write cabinets (future) | — | n/a (Zod-bound; no direct API calls) |
| `<Wizard>` | `@/blocks/workspace` | `steps, onComplete, current?` | — | — | n/a |
| `<AsyncSelect>` | `@/blocks/workspace` | `loadOptions: (input: string) => Promise<Option[]>, value: Option|null, onChange: (next: Option|null) => void, placeholder?, defaultOptions?, loadOptionsOnMount?: bool, debounceMs?: number, disabled?, id?, className?` (React island — debounced server-backed dropdown; ARIA combobox pattern; keyboard ↑/↓/Enter/Escape; self-wraps in IslandRoot; FR-MIG-004) | `<Form>` (MIG-004 PR B) | [AsyncSelect.stories.tsx](../storybook/index.html?path=/story/blocks-asyncselect--default) | n/a (caller provides loadOptions) |
| `<AuditLogList>` | `@/blocks/workspace` | _(no props — owns severity + event-prefix + country filter state; reads via `useAuditEvents` from `lib/use-audit`; capped at 200 rows)_ | `pages/workspace/admin/audit/index.astro` (PR 2.5a) | Storyless — interactive island needs provider mocks | `/v1/admin/audit/events` |
| `<PartnersList>` | `@/blocks/workspace` | _(no props — role-chip filter state lives locally; reads via `usePartners`; names link to detail)_ | `pages/workspace/partners/index.astro` (PR 2.5b) | Storyless — interactive island needs provider mocks | `/v1/workspace/partners` |
| `<PartnerDetail>` | `@/blocks/workspace` | `slug: string` (read-only; reads via `usePartnerDetail(slug)`; role header + audiences + kit assets) | `pages/workspace/partners/[slug].astro` (M2.1) | Storyless — interactive island needs provider mocks | `/v1/workspace/partners/:slug` |
| `<ApprovalsList>` | `@/blocks/workspace` | _(no props — reads via `useApprovals` from `lib/use-approvals`; renders source-readiness panel + DataTable of pending items)_ | `pages/workspace/approvals/index.astro` (PR 2.5c) | Storyless — interactive island needs provider mocks | `/v1/workspace/approvals` |
| `<EventsList>` | `@/blocks/workspace` | _(no props — status + country filter state lives locally; reads via `useWorkspaceEvents`; titles link to edit)_ | `pages/workspace/events/index.astro` (PR 2.7a) | Storyless — interactive island needs provider mocks | `/v1/workspace/events` |
| `<EventEditForm>` | `@/blocks/workspace` | `eventId: string` (loads via `useWorkspaceEvent`, PATCHes via `useUpdateEvent`; survey-form picker uses `<AsyncSelect>` to search `/v1/workspace/forms`; blank `starts_at`/`ends_at` are OMITTED from the PATCH, not sent as `''`) | `pages/workspace/events/[id].astro` (M2.2a) | Storyless — interactive island needs provider mocks | `/v1/workspace/events/:id` (GET + PATCH) |
| `<EventControlPanelActions>` | `@/blocks/workspace` | `eventId: string` (top-level ActionBar with Save/Regen/Cancel; Save delegates to EventEditForm via form.requestSubmit; Cancel shows confirm dialog via ActionBar's confirm prop; uses useCancelEvent + useRegenerateSocialCard) | `pages/workspace/events/[id].astro` (M2.2) | Storyless — interactive island needs provider mocks | n/a (delegates to sibling blocks) |
| `<EventFollowups>` | `@/blocks/workspace` | `eventId: string` (4-kind followups checklist — toggle completed + note via `useUpsertFollowup`; regenerate-social-card via `useRegenerateSocialCard`; shares the `useWorkspaceEvent` query with `<EventEditForm>`) | `pages/workspace/events/[id].astro` (M2.2b) | Storyless — interactive island needs provider mocks | `/v1/workspace/events/:id/followups/:kind` (PUT) + `/regenerate-social-card` (POST) |
| `<EventKpiStrip>` | `@/blocks/workspace` | `eventId: string` (displays registered/waitlisted/cancelled/attended counts from `useWorkspaceEvent`; same query key as `<EventEditForm>` — no extra network call) | `pages/workspace/events/[id].astro` (M2.2) | Storyless — interactive island needs provider mocks | `/v1/workspace/events/:id` (read from cache) |
| `<FilterChip>` | `@/blocks/workspace` | `active: boolean, onClick: () => void, children: React.ReactNode, className?: string, type?: 'button' | 'submit' | 'reset'` (presentation atom; extracted from inline duplicates in AuditLogList and EventsList; used by MembersList for active filter chips bar) | `<MembersList>` (M2.3a), `<AuditLogList>` (PR 2.5a), `<EventsList>` (PR 2.7a) | [FilterChip.stories.tsx](../storybook/index.html?path=/story/blocks-filterchip--default) | n/a (pure presentation) |
| `<FormsList>` | `@/blocks/workspace` | _(no props — status + country filter state lives locally; reads via `useWorkspaceForms` from `lib/use-workspace-forms`)_ | `pages/workspace/forms/index.astro` (PR 2.7b) | Storyless — interactive island needs provider mocks | `/v1/workspace/forms` |
| `<FormBuilder>` | `@/blocks/workspace` | `schema: FieldDef[], onChange: (schema: FieldDef[]) => void, preview?: boolean, className?: string` (React island — drag-to-reorder via @dnd-kit with mouse + keyboard; 7 field types: short_text, long_text, yes_no, select_one, select_many, scale, speaker_rating; edit/preview mode toggle; outputs `FieldDef[]` schema consumed by FR-MIG-019 renderer) | planned `pages/workspace/forms/[id].astro` (MIG-013) | — | n/a (presentation only) |
| `<FormBuilderCabinet>` | `@/blocks/workspace` | `formId: string` (React island — reads form via `useFormDetail`, PATCHes via `useUpdateForm`, archives via `useArchiveForm`; renders metadata editor + `<FormBuilder>` + `<ActionBar>` with Save/Preview/Archive) | `pages/workspace/forms/[id]/index.astro` (MIG-013) | Storyless — interactive island needs provider mocks | `/v1/workspace/forms/:id` (GET + PATCH) + `/archive` (POST) |
| `<FormResponsesCabinet>` | `@/blocks/workspace` | `formId: string` (React island — reads aggregate + submissions via `useFormAggregate` + `useFormSubmissions`; renders aggregate cards + DataTable with expand/collapse; CSV export via client-side generation) | `pages/workspace/forms/[id]/responses.astro` (MIG-013) | Storyless — interactive island needs provider mocks | `/v1/workspace/forms/:id/aggregate` + `/submissions` |
| `<CriteriaBuilder>` | `@/blocks/workspace` | `criteria: SegmentCriteria, country: string, onChange: (next: SegmentCriteria) => void` (React island — AND/OR criteria DSL builder with country, event, topic, linked_days widgets; uses `useWorkspaceEvents` + `useEventTopics` hooks) | `<TgSegmentsList>` (MIG-014) | Storyless — interactive island needs provider mocks | `/v1/workspace/events` + `/v1/telegram/event-topics` |
| `<TgBroadcastComposer>` | `@/blocks/workspace` | `broadcastId?: string` (React island — create/edit Telegram broadcast; rich-text body, inline buttons builder, async-select segment picker via `/v1/workspace/tg-segments`; save/send/schedule actions via `useTgBroadcast` hooks) | `pages/workspace/integrations/telegram/broadcasts/new.astro` + `[id].astro` (FR-MIG-015) | Storyless — interactive island needs provider mocks | `/v1/workspace/tg-broadcasts` (GET + POST + PATCH) + `/v1/workspace/tg-segments` |
| `<TgSegmentsList>` | `@/blocks/workspace` | _(no props — reads via `useTgSegments`, writes via `useCreateTgSegment`/`useUpdateTgSegment`/`useDeleteTgSegment`; inline create/edit form with live preview; uses DataTable + `<CriteriaBuilder>`)_ | `pages/workspace/integrations/telegram/segments/index.astro` (MIG-014) | Storyless — interactive island needs provider mocks | `/v1/workspace/tg-segments` |
| `<CronStatusTable>` | `@/blocks/workspace` | _(no props — reads via `useCronStatus` from `lib/use-cron-status`; displays tick name, schedule, last fire, duration, and outcome)_ | `pages/workspace/admin/cron/index.astro` (MIG-016) | Storyless — interactive island needs provider mocks | `/v1/workspace/internal-cron/status` |
| `<RbacSyncList>` | `@/blocks/workspace` | _(no props — reads via `useRbacSyncJobs`, writes via `useTriggerRbacSync`/`useRetryRbacSyncJob`; filter tabs + trigger sync button)_ | `pages/workspace/admin/rbac-sync/index.astro` (MIG-016) | Storyless — interactive island needs provider mocks | `/v1/admin/rbac-sync/jobs` + `/v1/admin/rbac-sync` (POST) |
| `<SiteSettingsForm>` | `@/blocks/workspace` | `initial: SiteSettings` (React island — three sections: HeroSection (heroSchema: heroHeadline/defaultDescription/heroCtaLabel/heroCtaUrl), FooterSection (footerLinksSchema: {label,url}[]), ContactSection (contactSchema: telegramUrl/twitterUrl/linkedinUrl/instagramUrl/youtubeUrl/contactEmail*). All sections PATCH via `updateSiteSettings()`; Zod validation guards before every write.) | `pages/workspace/site-settings/index.astro` (FR-MIG-024) | Storyless — interactive island needs provider mocks | `PATCH /items/site_settings` (Directus singleton) |
| `<SponsorsList>` | `@/blocks/workspace` | _(no props — tier-filter chip state lives locally; reads via `useSponsors()`; names link to `/workspace/sponsors/:id` edit page; "New sponsor" header link to `/workspace/sponsors/new`)_ | `pages/workspace/sponsors/index.astro` (FR-MIG-025) | Storyless — interactive island needs provider mocks | `GET /v1/workspace/sponsors` |
| `<SponsorForm>` | `@/blocks/workspace` | `sponsorId?: string` (React island — create mode when absent, edit mode when present; loads via `useSponsorDetail(id)`, PATCHes via `useUpdateSponsor()` or POSTs via `useCreateSponsor()`; logo file-input → MinIO via `useUploadLogo()` / `POST /v1/admin/uploads`; event associations via multi-`<AsyncSelect>` backed by `useWorkspaceEvents()`; client-side file validation: type ∈ {png,jpeg,svg,webp}, size ≤ 2 MB) | `pages/workspace/sponsors/new.astro` + `[id].astro` (FR-MIG-025) | Storyless — interactive island needs provider mocks | `GET /v1/workspace/sponsors/:id` + `POST /v1/workspace/sponsors` + `PATCH /v1/workspace/sponsors/:id` + `POST /v1/admin/uploads` |

### Cross-cutting blocks — `apps/web-next/src/blocks/common/`

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<PageHead>` | `@/blocks/common` | `title: string, description?: string` (build-aside: OG / canonical deliberately omitted; expand at cutover) | `pages/index.astro` (PR 1.1) | Astro-only — no story | n/a |
| `<AppFooter>` | `@/blocks/common` | _(no props — fetches site_settings via `fetchSiteSettings()` with graceful default)_ | every page via `Layout.astro` (PR 1.8c) | Astro-only — no story | `site_settings` |
| `<AppNav>` | `@/blocks/common` | _(no props — sticky top nav; SSR auth hint from `Astro.locals.auth`; composes `<CountrySwitcher>` + `<LocaleSwitcher>` + Sign-in CTA / `<AccountChip>`)_ | every page via `Layout.astro` (M0.2) | Astro-only — no story | `Astro.locals.auth` (SSR) |
| `<AccountChip>` | `@/blocks/common` | _(no props — React island; self-wraps in `<IslandRoot>` (M0-fix-B) so its `useAuth()` has a provider in its own root; avatar + role-gated popover (Workspace / Engineering Deck) + sign-out via `lib/sign-out`)_ | `<AppNav>` (M0.2) | Storyless — interactive island needs provider mocks | `useAuth()` + `/api/v1/auth/sign-out` |
| `<AuthGate>` | `@/blocks/common` | `role?: string \| string[], signInLabel?, signInHref?` (Astro — reads `Astro.locals.auth`; `role` accepts SEMANTIC tokens via `lib/roles.satisfiesRole`: `"aiqadam-operators"` → operator family, `"aiqadam-super-admin"` → super-admin family, else literal group) | every `/workspace/*` cabinet + members_only surfaces | Astro-only — no story | `Astro.locals.auth.me.groups` (server-verified SSR blob) |
| `<EmptyState>` | `@/blocks/common` | `heading: string, description?, icon?` (CTAs composed outside the block) | `<EventsGrid>` fallback (PR 1.2); planned `<MembersList>`, `<MaterialsList>`, etc. | Astro-only — no story | n/a |
| `<DateTime>` | `@/blocks/common` | `value: string, format: 'long' \| 'short' \| 'time' \| 'datetime', class?: string` (en-US locale; emits `<time datetime=...>` for SR + crawlers) | `<EventDetail>` hero; `<ProfileCard>` recent-events list (both PR 1.8b) | Astro-only — no story | n/a |
| `<TimeRange>` | `@/blocks/common` | `start: string, end: string, class?: string` (renders `HH:MM — HH:MM`; cross-day adds weekday prefix) | `<EventDetail>` hero (PR 1.8b) | Astro-only — no story | n/a |
| `<MarkdownBody>` | `@/blocks/common` | `content: string \| null \| undefined, variant?: 'muted' \| 'body', class?: string` (markdown-lite: blank-line blocks → `<p>` or `<ul>`, `- ` bullets, full HTML escape) | `<EventDetail>` description + agenda; `<ProfileCard>` bio (both PR 1.8a) | Astro-only — no story | n/a (pure presentation) |
| `<CountrySwitcher>` | `@/blocks/common` | `class?: string` (native `<select>` + inline `<script>`; tenant detected client-side from hostname, navigates to sibling `*.aiqadam.org` subdomain) | planned `<AppNav>` (M0.2) | Astro-only — no story | n/a (hostname) |
| `<LocaleSwitcher>` | `@/blocks/common` | `class?: string` (native `<select>` + inline `<script>`; writes `aiqadam-locale` cookie + reloads — forward-compatible; web-next i18n translation layer not yet live) | planned `<AppNav>` (M0.2) | Astro-only — no story | n/a (cookie) |

## Provider-coupled blocks

**Every interactive island self-wraps in `<IslandRoot>` (M0-fix-B).**
Astro hydrates each `client:load` island as its own React root, so a
single page/Layout-level provider reaches none of them. Each island's
public export is therefore `<IslandRoot><XxxInner/></IslandRoot>`, giving
its `useAuth`/`useQuery` calls a `RuntimeProvider` in the SAME root.
`getQueryClient()` is a browser singleton so all islands still share one
cache. New islands MUST follow this pattern (see `lib/island-root.tsx`).

Interactive React blocks that consume L1 hooks via React Context
(`useAuth`, `useQueryClient`) cannot ship a Storybook story until
`apps/storybook/` has a decorator wrapping every story in a synthetic
`<RuntimeProvider>` (QueryClient + AuthProvider) and mocks the
hook fetch surface — most cleanly with MSW.

Pending: a Phase 2 follow-up adds the decorator + MSW handlers. Until
then, blocks tagged "Storyless — interactive island needs provider
mocks" in the catalogue ship without a story.

Affected blocks today: `<RegistrationCTA>` (PR 1.4), `<ConsentList>` + `<SkillTagger>` (PR 1.5b), `<ForumThread>` (PR 1.7), `<AccountChip>` (M0.2), and every workspace cabinet island. All now self-wrap in `<IslandRoot>` per M0-fix-B (B3 = list cabinets Partners/Approvals/Audit/Events/Forms; B4 = Members/Invites/Dashboard/PartnerDetail/EventEditForm/EventFollowups). Every interactive island is now wrapped.

## Storyless Astro blocks

Storybook in `apps/storybook/` uses `@storybook/react-vite`. React
components in `apps/web-next/src/kit/` render natively; **Astro
components do not**. Pure-presentation blocks shipped as `.astro` (no
client-side interaction — Hero, PageHead, EventCard listing, AppFooter,
DateTime, MarkdownBody) deliberately ship without a Storybook story
in this build period. The block's source file IS the documentation;
the catalogue row above declares prop shape + consumers + data source.

Blocks that need a story:
- Every L2 atom in `src/kit/` (React).
- Every L3 block that uses React hooks or Radix primitives (Dialog,
  Drawer, Toast-emitting forms, DataTable, AsyncSelect, Form,
  Wizard, FormBuilder, AuditLogList).

When we hit a critical mass of interactive React blocks (Phase 2),
we may revisit by adding `@storybook/addon-astro` or React-shim
wrappers. Until then, the Astro-only blocks are signed off via
this catalogue entry + an arch-check pass.

## Adding a block — PR checklist

When opening a PR that adds a new block:

- [ ] File under `apps/web-next/src/blocks/{customer,workspace,common}/`
- [ ] Exported from `apps/web-next/src/blocks/{customer,workspace,common}/index.ts`
- [ ] If the block is **React** (.tsx): Story under `apps/storybook/stories/blocks/`
- [ ] If the block is **Astro** (.astro): catalogue entry notes "Astro-only — no story" (per §Storyless Astro blocks)
- [ ] Entry in this catalogue with import path, props, data source, Story link
- [ ] If the block reads/writes a Directus collection: entry in [`wiring-map.md`](wiring-map.md)
- [ ] No `fetch()`, no inline styles, no imports from `lib/api-*`
