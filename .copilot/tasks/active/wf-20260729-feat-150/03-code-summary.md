# Step 4 — Code Summary: FR-ADM-011

## Requirement Implemented

FR-ADM-011 — Admin user and role management screen. Extends
`/workspace/admin/users` with a "Manage users" tab: search any existing
user, view roles in plain language, grant/revoke via form controls,
live-re-read confirmation after every change, ADR-0021 ≤3-super-admin
cap enforced as a hard block (symmetric ≥1 floor added on the revoke
side, per `02-impact-analysis.md` Risk Flags), audit log entry per
change.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Modified | Added `MAX_SUPER_ADMINS = 3` constant and `getSuperAdminCount(): Promise<number>` method — the shared cap-count primitive both `AdminBootstrapService` and the new role-change service now read through. |
| `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` | Modified | `hasSuperAdminMember()` refactored to call `authentik.getSuperAdminCount()` instead of its own inline `resolveGroupNames` + `.users.length` computation. Behavior-preserving (still `>=1`). |
| `apps/api/src/modules/admin-invites/admin-user-roles.service.ts` | New | `AdminUserRolesService` — `searchUsers()`, `getRoles()`, `changeRole()`. Read-merge-write against `setUserGroups()` (which is REPLACE, not additive), cap check + symmetric floor check, re-read after write, `AuditEventsService.emit()` on every change. |
| `apps/api/src/modules/admin-invites/admin-user-roles.controller.ts` | New | `AdminUserRolesController` — `GET /v1/admin/users?q=`, `GET /v1/admin/users/:id/roles`, `PATCH /v1/admin/users/:id/roles`. `@UseGuards(AuthGuard, SuperAdminGuard)`, Zod `.strict()` body validation, matching `AdminInvitesController`'s exact pattern. |
| `apps/api/src/modules/admin-invites/admin-invites.module.ts` | Modified | Registered `AdminUserRolesController`/`AdminUserRolesService` — no new module import needed (`AuthentikModule`/`AuditModule` already present). |
| `apps/web-next/src/lib/roles.ts` | Modified | Added `roleLabel(group): string` and `roleLabels(groups): string[]` — plain-language mapping for every ADR-0021 §2 group, with a raw-slug fallback for unmapped/per-org groups so the function never throws. |
| `apps/web-next/src/lib/types.ts` | Modified | Added `HUMAN_ROLE_GROUPS`, `ADMIN_USER_COUNTRIES`, `AdminUserSummary`, `AdminUserRoles`, `GrantRevokeRoleBody` — all carrying raw group names (`groups: string[]`), never pre-labeled, per the "label mapping is a frontend render-time concern" decision. |
| `apps/web-next/src/lib/use-admin-user-roles.ts` | New | `useUserSearch`, `useUserRoles`, `useChangeUserRole` — TanStack Query hooks mirroring `use-invites.ts`'s structure exactly. |
| `apps/web-next/src/blocks/workspace/UserRolesManager.tsx` | New | The "Manage users" island: search box, result list, role detail panel, grant/revoke form (dropdown role select + conditional country select, no free text). |
| `apps/web-next/src/blocks/workspace/InvitesList.tsx` | Modified | Exported `InvitesListInner` (previously private) so `AdminUsersCabinet` can compose it under one shared provider root instead of nesting `IslandRoot`. |
| `apps/web-next/src/blocks/workspace/AdminUsersCabinet.tsx` | New | Tab shell (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `@/kit`) composing `InvitesListInner` + `UserRolesManagerInner` under one `IslandRoot`. |
| `apps/web-next/src/blocks/workspace/index.ts` | Modified | Barrel exports for `AdminUsersCabinet`, `InvitesListInner`, `UserRolesManager`/`UserRolesManagerInner`. |
| `apps/web-next/src/pages/workspace/admin/users/index.astro` | Modified | Swapped `<InvitesList client:load>` for `<AdminUsersCabinet client:load>`; updated page title/breadcrumb from "Invites" to "Users" to reflect the generalized scope. |

## Key Design Decisions

1. **Cap-check extraction placed in `authentik.client.ts`**, not a new
   file — the existing `SUPER_ADMIN_GROUP` constant's own comment
   already earmarked this file as "FR-ADM-011's natural shared home."
   `getSuperAdminCount()` is a thin wrapper over the existing
   `resolveGroupNames()` primitive, so both call sites (bootstrap's
   `>=1`, this FR's `>3`/`<=1`) read the exact same number.
2. **API returns raw group names, not pre-labeled strings.** `roleLabel()`
   lives in `apps/web-next` only (it's UI copy). Keeping the API
   ignorant of display labels avoids a duplicate mapping and matches the
   existing precedent (`AuthentikUser.groups_obj` is already raw
   everywhere else in the codebase).
3. **Symmetric floor added beyond the FR's literal text.** FR-ADM-011
   only states the ≤3 upper bound; `02-impact-analysis.md` flagged that
   the same screen could let a super-admin revoke the last remaining
   super-admin, producing a state nobody (not even through this screen)
   could recover from without direct Authentik console access. Blocking
   any revoke that would bring the count to 0 is the symmetric
   application of "the platform must always have 1–3 super-admins" and
   costs one extra guard clause (`assertSuperAdminFloorNotBreached`).
4. **`GET /v1/admin/users?q=` added beyond FR item 7's literal endpoint
   list.** AC-1 requires search; the FR's functional-scope item 2 states
   the requirement but item 7's endpoint enumeration only listed the
   `:id/roles` pair. Added as a natural completion, not a scope
   expansion.
5. **TOCTOU window in the cap check accepted, not engineered away.**
   `assertSuperAdminCapNotExceeded`/`assertSuperAdminFloorNotBreached`
   re-read the count immediately before the write rather than trusting
   the earlier `getUserById()` read, narrowing (not eliminating) the
   race window. Per `02-impact-analysis.md`'s risk flag, building
   distributed locking for a ≤3-cap, human-rate admin action was judged
   disproportionate — flagged explicitly for SecurityReviewer to confirm
   or override.
6. **`setUserGroups()`'s REPLACE semantics handled via read-merge-write**
   in `changeRole()`: fetch `groups_obj`, compute the new full set
   (add/remove exactly the target group), resolve names→pks, write the
   complete list. Matches the pattern already used in
   `admin-invites.service.ts`'s `consumeInvite()`.
7. **`AdminUsersCabinet` composes `*Inner` variants, not the public
   double-wrapped exports**, to avoid nesting `IslandRoot`/
   `RuntimeProvider` three times for one page. `InvitesListInner` was
   promoted from private to exported for this; `UserRolesManagerInner`
   was written exported from the start.
8. **Tab IA chosen over a separate route** (FR item 1 left this to
   CodeDeveloper) — one Astro page, one `client:load` boundary, matching
   AGENTS.md §4's small-PR bias and avoiding a second `AuthGate`-wrapped
   page for what is conceptually one cabinet.

## Architecture Rule Compliance

- **Module boundaries**: new controller/service live inside the existing
  `admin-invites` module; no direct entity/repository reach into another
  module. ✅
- **Tenant scoping**: N/A — role management is inherently a global
  super-admin-only surface (not a `country_code`-scoped table read);
  `country` is a request parameter selecting which per-country group to
  grant, not a tenant filter. ✅
- **Zod at boundaries**: `changeRoleSchema` (`.strict()`) validates the
  `PATCH` body; `grant`/`revoke` restricted to the `HumanRoleGroup` enum
  (no free text, per FR item 4). ✅
- **No cross-schema queries**: only `AuthentikClient` (Authentik REST
  API) and `AuditEventsService` (Directus via existing bridge) are
  touched — no new SQL, no Drizzle schema change. ✅
- **No `any`**: confirmed via `pnpm --filter api typecheck` (0 errors)
  and `pnpm --filter web-next typecheck` (0 errors). ✅
- **Auth at controller level**: `@UseGuards(AuthGuard, SuperAdminGuard)`
  on `AdminUserRolesController`, matching `AdminInvitesController`
  exactly — not deferred to the service layer. ✅

## Formatter Check

`pnpm biome check` on all changed/new files: **clean, no fixes applied**
(ran against the full changed-file list, see command below).

```
pnpm biome check apps/api/src/modules/admin-invites apps/web-next/src/lib/roles.ts \
  apps/web-next/src/lib/types.ts apps/web-next/src/lib/use-admin-user-roles.ts \
  apps/web-next/src/blocks/workspace/UserRolesManager.tsx \
  apps/web-next/src/blocks/workspace/AdminUsersCabinet.tsx \
  apps/web-next/src/blocks/workspace/InvitesList.tsx \
  apps/web-next/src/blocks/workspace/index.ts \
  apps/web-next/src/pages/workspace/admin/users/index.astro
# Checked 17 files in 28ms. No fixes applied.
```

`pnpm --filter api typecheck`: 0 errors.
`pnpm --filter web-next typecheck`: 0 errors, 0 warnings introduced
(pre-existing repo-wide `FormEvent` deprecation hints unrelated to this
change, same pattern present in `InvitesList.tsx`/`SponsorForm.tsx`
before this PR).

## Known Limitations

- **`listActiveUsers()` search is unfiltered server-side beyond the
  existing 500-row page cap.** Acceptable at current scale (~100
  operators per existing code comments); flagged in
  `02-impact-analysis.md` as a v1 pragmatic choice, not a regression.
- **TOCTOU window on the cap/floor check** (see Design Decision #5) —
  accepted risk pending SecurityReviewer confirmation.
- **`BP-UAT-021`'s `three-super-admins` fixture gap** (pre-existing,
  documented in the BP-UAT file itself) is not resolved by this PR — it
  is TestDesigner/Step-13's concern, not a code gap.
- Tests not yet written — this is Step 4 output; Steps 6–8 cover test
  strategy, design, and execution.

## Gate Result

gate_result:
  status: passed
  summary: "FR-ADM-011 implemented across API (new controller+service, shared cap-check extraction, bootstrap refactor) and web-next (new roleLabel mapping, new island+hooks, tab-based IA). Typecheck and Biome clean on both packages."
  findings:
    - "TOCTOU window on the super-admin cap/floor check is a deliberate, disclosed risk-acceptance — flagged for SecurityReviewer confirmation, not silently resolved."
    - "Symmetric >=1 floor guard added beyond the FR's literal text (FR only states <=3) to prevent total-lockout self-revocation, per ImpactAnalyzer's risk flag."
    - "GET /v1/admin/users?q= added beyond FR item 7's literal endpoint enumeration, needed to satisfy AC-1's search requirement which item 2 states but item 7 omitted."
