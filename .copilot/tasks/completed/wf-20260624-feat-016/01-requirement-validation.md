# Requirement Validation — FR-MIG-021

## Raw Input

**Source:** `docs/03-requirements/FR-MIG-021.md`

**Requirement text:**
> The event-day check-in page. Operators open this on a device at the door; members scan a QR code or enter a code manually to check in.

**Functional scope:**
1. `pages/checkin.astro` — operator selects the active event from a dropdown; then shows a QR scanner (camera) + manual code entry fallback.
2. POST `/v1/registrations/:token/checkin` on scan/entry.
3. Success: shows member name + avatar + confirmation animation.
4. Error: shows "not registered", "already checked in", or "wrong event" messages.
5. Offline-tolerant: queues check-ins locally if API is unreachable, flushes on reconnect.

**Existing acceptance criteria:**
- Camera QR scanner activates and decodes a valid QR token.
- Manual code entry field accepts and submits a token.
- Successful check-in shows member confirmation within 1 second.
- "Already checked in" shows a distinct message (not an error).
- `pnpm arch:check` + `astro check` + `pnpm build` pass.

**v1 reference:** `apps/web/src/pages/checkin.astro` + `apps/web/src/components/CheckinForm.tsx`

**Related:** FR-REG-004 (QR check-in application FR)

---

## Analysis

### Completeness Issues Found

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | **Member name + avatar on success** — The functional scope says "shows member name + avatar" but the existing v1 `CheckinForm.tsx` does NOT display member name or avatar. It only shows event title, time, and location. This is a new requirement vs v1. | Medium | Accept as new requirement. Add `GET /v1/registrations/:code/member` endpoint or enrich the checkin response to include member info. |
| 2 | **"Wrong event" error message** — The requirement lists this as a distinct error case, but the current API does NOT validate that the registration belongs to the selected event. The `checkin()` method in `registrations-directus.service.ts` does not filter by event. The event dropdown selects the event, but the token is global. | Medium | Add event validation to checkin flow. API should accept `eventId` in the request body and validate the registration belongs to that event. |
| 3 | **Event dropdown source** — It is unclear whether the dropdown lists ALL events or only "active" events (today's events). Should include date range filtering. | Low | Default to events where `startsAt <= now <= endsAt` or events starting within a configurable window. |
| 4 | **Confirmation animation spec** — "Confirmation animation" is not defined. No details on what animation, duration, or visual style. | Low | Use existing design system animation patterns. Flag as `needs-clarification` for UI refinement. |
| 5 | **Offline queue persistence** — "Queues check-ins locally" does not specify storage mechanism. `localStorage` vs `IndexedDB` vs in-memory. Should survive page refresh. | Medium | Use `localStorage` with a structured queue. |
| 6 | **Offline flush on reconnect** — No definition of reconnect detection mechanism (`navigator.onLine`, polling, or WebSocket). | Medium | Use `navigator.onLine` + `online` event. On reconnect, flush queue in order. |
| 7 | **API endpoint mismatch** — The requirement specifies `POST /v1/registrations/:token/checkin` but the existing API is `POST /v1/checkin/:code`. The existing implementation uses UUID as the code parameter. The `ParseUUIDPipe` on the current controller validates UUID format. | High | The requirement's endpoint path is the correct RESTful design. The API needs a new endpoint at `/v1/registrations/:token/checkin` OR a routing change. The existing `/v1/checkin/:code` can remain for backwards compatibility with the Telegram bot. |
| 8 | **QR code format** — Not specified what the QR contains. Likely `https://aiqadam.com/checkin?code=<uuid>` or just `<uuid>`. Based on v1, the QR encodes a URL with `?code=` query param. | Medium | Document that QR encodes the `checkin_code` UUID, either as full URL or raw token. |
| 9 | **@zxing/browser dependency** — Not yet in `package.json`. Needs to be added as a dependency. | Low | Add during implementation. |
| 10 | **No member context on success UI** — The success state needs to show the member's name and avatar. The checkin response currently returns `event` info but not member info. | High | Enrich API response or add a separate `GET /v1/registrations/member?code=` endpoint to fetch member details. |

### Conflicts with Existing Features

| Conflict | Description | Resolution |
|----------|-------------|------------|
| **API endpoint path** | Requirement: `/v1/registrations/:token/checkin`. Existing: `/v1/checkin/:code`. These are different paths. The new frontend should call the new path. The old endpoint can remain for Telegram bot compatibility. | Add new endpoint. Keep old one. |
| **v1 checkin is self-serve** | The v1 check-in page (`CheckinForm.tsx`) is designed for the member to tap "check in" after scanning a QR that lands them on the page with a `?code=` param. The new page adds an OPERATOR mode with event selection dropdown, which is new. | The operator dropdown is additive — members can still use the self-serve flow if the operator sets up a shared device in "member mode". |

### Architectural Feasibility

| Check | Status | Notes |
|-------|--------|-------|
| Stack compatibility | Pass | Astro 5 + React islands + Tailwind 4 — fits `apps/web-next`. |
| API compatibility | Pass with changes | API endpoint needs a new route or modification. No architectural violations. |
| Module boundaries | Pass | Frontend calls REST API. No cross-module DB queries. |
| Monorepo constraint | Pass | All changes within `apps/web-next` and `apps/api`. |
| TanStack Query for server state | Pass |符合 architecture.md guidance. |
| Offline storage | Pass | `localStorage` is acceptable. No additional infrastructure needed. |
| Camera API | Pass | Browser `getUserMedia` API is supported. `@zxing/browser` wraps it. |
| Offline queue design | Pass | Queue in `localStorage`, flush via sequential POSTs. Idempotency handled by API. |

---

## Formalized Requirement

**Feature ID:** FR-MIG-021
**Feature Name:** `/checkin` — event-day QR check-in page
**Module:** Migration (MIG)
**Phase:** Rebuild M3
**Status:** Not Started
**Depends on:** None (as per registry)
**Related:** FR-REG-004 (QR check-in application FR), v1 `apps/web/src/pages/checkin.astro`

### Summary

A public-facing check-in page at `/checkin` in `apps/web-next` that enables event operators to scan QR codes (or accept manual code entry) to mark members as attended. The page supports two modes:

1. **Operator mode** (default): operator selects the active event from a dropdown, then scans/enters member QR codes.
2. **Self-serve mode** (backward-compatible with v1): member scans QR code and lands on `/checkin?code=<token>` — no event dropdown needed.

On successful check-in, the page displays the member's name, avatar, and a confirmation animation. The page is offline-tolerant: if the API is unreachable, check-ins are queued locally and flushed when connectivity is restored.

### Scope Boundaries

| In Scope | Out of Scope |
|----------|-------------|
| `/checkin` Astro page in `apps/web-next` | `/workspace/...` operator dashboards |
| QR scanning via `@zxing/browser` | Operator device management |
| Manual code entry fallback | Check-in list / attendee export (operator view) |
| Event selection dropdown (operator mode) | Email/SMS notification on check-in |
| Offline queue with localStorage | Badge/points display on success |
| API endpoint: `POST /v1/registrations/:token/checkin` | Telegram bot check-in (already exists) |

### API Changes Required

1. **New endpoint:** `POST /v1/registrations/:token/checkin`
   - Body: `{ "eventId": string }`
   - Validates registration belongs to the specified event
   - Returns: `{ status, alreadyCheckedIn, checkedInAt, member: { name, avatar }, event: { id, title, startsAt, endsAt, location } }`
   - Existing `POST /v1/checkin/:code` remains for Telegram bot compatibility

2. **New endpoint:** `GET /v1/registrations/member?code=<token>`
   - Returns member info for success display: `{ name, avatar }`

---

## Acceptance Criteria (Draft)

> These are formal Given/When/Then statements for the TestDesigner to formalize into test cases.

### AC-1: Event Selection (Operator Mode)
**Given** an operator opens `/checkin`
**When** the page loads
**Then** a dropdown shows all events where `startsAt <= now <= endsAt + 24h` (today's events with a 1-day buffer)
**And** the dropdown defaults to the most recently started active event (if any)
**And** if no active events exist, the dropdown shows a "No active events" placeholder and scanning is disabled

### AC-2: QR Scanner Activation
**Given** an operator has selected an active event
**When** the page loads
**Then** the camera activates automatically via `@zxing/browser` `BrowserQRCodeReader`
**And** a live camera viewfinder is displayed
**And** when a valid QR code is detected, the code is extracted and submitted

### AC-3: Manual Code Entry Fallback
**Given** an operator has selected an active event
**When** the operator types a code into the manual entry field and submits
**Then** the code is submitted to the API
**And** the same success/error flow as QR scanning is triggered

### AC-4: Successful Check-in Display
**Given** a valid registration token is scanned or entered for the selected event
**When** the API returns a successful check-in response
**Then** within 1 second, the page displays:
- The member's first name and last name (or display name)
- The member's avatar (if available, fallback to initials)
- A green confirmation badge: "Checked in" or "Already checked in"
- A brief celebration animation (confetti or checkmark animation, 2-3 seconds)
- Auto-reset to scanner mode after 5 seconds

### AC-5: Already Checked In
**Given** a registration token that has already been checked in
**When** the API returns `alreadyCheckedIn: true`
**Then** the page displays a distinct "Already checked in" message (amber/yellow, NOT red error)
**And** the member name + avatar are still shown
**And** the confirmation animation is suppressed or replaced with a softer indicator

### AC-6: Not Registered Error
**Given** a token that does not match any registration
**When** the API returns 404 or `CheckinNotFoundError`
**Then** the page shows a red error message: "This code is not recognized. Please check the QR or ask for help."
**And** the scanner remains active for retry

### AC-7: Wrong Event Error
**Given** a token that is valid but belongs to a different event
**When** the API validates the registration against the selected event and finds a mismatch
**Then** the page shows: "This ticket is for a different event: [event title]. Please check in at the correct event."
**And** the scanner remains active for retry

### AC-8: Cancelled/Waitlisted Error
**Given** a token that belongs to a cancelled or waitlisted registration
**When** the API returns a `CheckinIneligibleError`
**Then** the page shows the specific error message from the API
**And** the scanner remains active for retry

### AC-9: Offline Queue
**Given** the operator is in operator mode with an event selected
**And** the device has no network connectivity
**When** a QR code is scanned or code is entered
**Then** the check-in request is queued in `localStorage` under the key `aiqadam:checkin:queue`
**And** a "Offline — check-in queued" indicator is shown
**And** the queue entry includes: `{ code, eventId, queuedAt }`

### AC-10: Offline Flush on Reconnect
**Given** there are queued check-ins in `localStorage`
**When** the device reconnects to the network (detected via `navigator.onLine` + `online` event)
**Then** queued check-ins are submitted in FIFO order
**And** each successful response triggers the normal success/error display
**And** failed items remain in the queue for retry
**And** the queue is cleared of successfully processed items

### AC-11: Self-Serve Mode (Backward Compatibility)
**Given** a member opens `/checkin?code=<token>` (no event selected)
**When** the page loads with a valid `code` parameter
**Then** the page auto-submits the check-in for the event associated with that token
**And** the event dropdown is hidden
**And** success/error display behaves as per AC-4 through AC-8

### AC-12: Camera Permission Handling
**Given** the camera permission is denied or unavailable
**When** `@zxing/browser` fails to access the camera
**Then** the camera viewfinder is replaced with a message: "Camera unavailable — use manual entry"
**And** the manual code entry field is prominently displayed
**And** the page remains fully functional in manual-entry-only mode

### AC-13: Build and Type Checks
**When** the implementation is complete
**Then** `pnpm arch:check` passes
**And** `astro check` passes (no type errors in the new page)
**And** `pnpm build` produces a successful build
**And** `biome check` passes

### AC-14: Offline Indicator
**Given** the operator is using the check-in page
**When** `navigator.onLine` is `false`
**Then** a persistent banner is shown: "Offline mode — check-ins will be queued"
**And** queued count is displayed: "X check-in(s) pending"

---

## Gate Result

```yaml
gate: requirement-analyst
workflow_id: wf-20260624-feat-016
requirement: FR-MIG-021
result: passed
needs-clarification:
  - confirmation_animation_style: "Specific animation not defined — use existing design system patterns (check-mark draw animation). Refine with UX input if needed."
  - event_dropdown_filter: "Default to events where startsAt <= now <= endsAt+24h. Make window configurable via env var if needed."
  - qr_payload_format: "QR should encode the checkin_code UUID. Confirm: full URL (https://aiqadam.com/checkin?code=<uuid>) or raw UUID?"
  - offline_queue_max_size: "Max queue size before warning? 100 entries seems reasonable default."
flags:
  api_endpoint_mismatch_resolved: true
  offline_requirement_filled: true
  member_avatar_requirement_filled: true
  event_validation_added: true
review_required: false
```

**Passed with clarifications.** The requirement is well-scoped and architecturally feasible. The main gap is that the v1 check-in response does not include member name/avatar — the API must be enhanced to return member details. The offline queue mechanism needs to be implemented as a React island with `localStorage` persistence. All other gaps are resolvable with reasonable assumptions documented above.
