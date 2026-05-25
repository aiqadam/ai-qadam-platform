# Block catalogue (L3)

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
| `<Drawer>` | `@/kit` | `open, onOpenChange, side, children` | [link]() |
| `<Tooltip>` | `@/kit` | `content, children` | [link]() |

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
| `<ForumThread>` | `@/blocks/customer` | `eventId, questions: EventQuestion[]` | — | — | `event_questions` |
| `<AppFooter>` | `@/blocks/customer` | `(no props — reads site_settings via L1)` | — | — | `site_settings` |

### Operator workspace blocks — `apps/web-next/src/blocks/workspace/`

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<PageShell>` | `@/blocks/workspace` | `title, breadcrumbs?, actions?, children` | — | — | n/a |
| `<DataTable>` | `@/blocks/workspace` | `columns, rows, pagination, sort, filterSlot?` | — | — | generic |
| `<KpiTile>` | `@/blocks/workspace` | `label, value, delta?, trend?` | — | — | aggregates |
| `<ActionBar>` | `@/blocks/workspace` | `primary?, secondary?, more?` | — | — | n/a |
| `<Form>` | `@/blocks/workspace` | `schema: ZodSchema, onSubmit, defaultValues` | — | — | n/a (Zod-bound) |
| `<Wizard>` | `@/blocks/workspace` | `steps, onComplete, current?` | — | — | n/a |
| `<AsyncSelect>` | `@/blocks/workspace` | `loadOptions, value, onChange` | — | — | various |
| `<AuditLogList>` | `@/blocks/workspace` | `events: AuditEvent[]` | — | — | `audit_events` |
| `<FormBuilder>` | `@/blocks/workspace` | `form, onChange` | — | — | `forms` |

### Cross-cutting blocks — `apps/web-next/src/blocks/common/`

| Block | Import | Props | Consumers | Story | Data source |
|---|---|---|---|---|---|
| `<PageHead>` | `@/blocks/common` | `title: string, description?: string` (build-aside: OG / canonical deliberately omitted; expand at cutover) | `pages/index.astro` (PR 1.1) | Astro-only — no story | n/a |
| `<AuthGate>` | `@/blocks/common` | `role?: string \| string[], signInLabel?, signInHref?` (Astro — reads `Astro.locals.auth`) | available for `members_only` / engineer-only surfaces (PR 1.4) | Astro-only — no story | `Astro.locals.auth.me.groups` (server-verified SSR blob) |
| `<EmptyState>` | `@/blocks/common` | `heading: string, description?, icon?` (CTAs composed outside the block) | `<EventsGrid>` fallback (PR 1.2); planned `<MembersList>`, `<MaterialsList>`, etc. | Astro-only — no story | n/a |
| `<DateTime>` | `@/blocks/common` | `value: string, format: 'date' \| 'datetime' \| 'time'` | — | — | n/a |
| `<TimeRange>` | `@/blocks/common` | `start: string, end: string` | — | — | n/a |
| `<MarkdownBody>` | `@/blocks/common` | `content: string` | — | — | n/a |
| `<CountrySwitcher>` | `@/blocks/common` | `current: CountryCode` | — | — | useAuth() |
| `<LocaleSwitcher>` | `@/blocks/common` | `current: Locale` | — | — | i18n |

## Provider-coupled blocks

Interactive React blocks that consume L1 hooks via React Context
(`useAuth`, `useQueryClient`) cannot ship a Storybook story until
`apps/storybook/` has a decorator wrapping every story in a synthetic
`<RuntimeProvider>` (QueryClient + AuthProvider) and mocks the
hook fetch surface — most cleanly with MSW.

Pending: a Phase 2 follow-up adds the decorator + MSW handlers. Until
then, blocks tagged "Storyless — interactive island needs provider
mocks" in the catalogue ship without a story.

Affected blocks today: `<RegistrationCTA>` (PR 1.4).

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
- [ ] If the block reads/writes a Directus collection: entry in [`wiring-map.md`](./wiring-map.md)
- [ ] No `fetch()`, no inline styles, no imports from `lib/api-*`
