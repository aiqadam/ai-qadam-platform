---
code: FR-MIG-021
name: /checkin — event-day QR check-in
status: Implemented
module: Migration (MIG)
phase: Rebuild M3
---

## Description
The event-day check-in page. Operators open this on a device at the door; members scan a QR code or enter a code manually to check in.

## Users
Operators running check-in at the door. Members checking themselves in (self-serve mode).

## Functional scope
1. `pages/checkin.astro` — operator selects the active event from a dropdown; then shows a QR scanner (camera) + manual code entry fallback.
2. POST `/v1/registrations/:token/checkin` on scan/entry.
3. Success: shows member name + avatar + confirmation animation.
4. Error: shows "not registered", "already checked in", or "wrong event" messages.
5. Offline-tolerant: queues check-ins locally if API is unreachable, flushes on reconnect.

## Acceptance criteria
- [ ] Camera QR scanner activates and decodes a valid QR token.
- [ ] Manual code entry field accepts and submits a token.
- [ ] Successful check-in shows member confirmation within 1 second.
- [ ] "Already checked in" shows a distinct message (not an error).
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/checkin.astro` + `CheckinForm.tsx`.
- Use `@zxing/browser` for QR scanning (add to package.json if absent).
- Related: FR-REG-004 (QR check-in application FR).
