# 02-impact-analysis.md — wf-20260630-fix-043

| Field | Value |
|---|---|
| Workflow | wf-20260630-fix-043 |
| Issue | ISS-UAT-013-9 |
| Module | api/leads |
| Analyst | ImpactAnalyzer |
| Date | 2026-06-30 |

---

## Validated Requirement

**BUG-LEADS-001** — `POST /v1/leads` re-submit with a verified email address triggers a
second verification email and inadvertently resets `email_verified` to `false`.

Source: ISS-UAT-013-9 (reported during BP-UAT-013 Step 004 on 2026-06-30).

---

## Root Cause — Confirmed by Code Reading

File: `apps/api/src/modules/leads/leads.service.ts`, `create()` method.

The method has two guards today:

```
Guard 1: existing.state !== 'lead'  → return already_member  ✓
Guard 2: [MISSING]   existing.email_verified === true → should return already_verified ✗
```

After Guard 1 passes (state is 'lead'), the method falls straight into:

```typescript
const userId = existing
  ? await this.patchLead(existing.id, input)   // resets email_verified=false !
  : await this.insertLead(email, input);
await this.dispatchVerifyEmail(userId, email, input.city);  // sends 2nd email !
```

Two harms caused by the missing guard:
1. **Second verification email sent** — `dispatchVerifyEmail()` called unconditionally.
2. **Verification undone** — `patchLead()` explicitly sets `email_verified: false`, silently de-verifying the address.

The service header comment already states the intended policy:
> "re-dispatch the verify email IF the existing row is still state='lead' **and not yet verified**"

The implementation simply never enforced the "and not yet verified" half.

---

## Affected Layers

### API (NestJS — `apps/api/src/modules/leads/`)

| File | Change | Why |
|---|---|---|
| `apps/api/src/modules/leads/leads.service.ts` | Add early-return guard + extend type | Core fix |
| `apps/api/test/leads-service.spec.ts` | Add unit test case | AC coverage |

### DB Changes Required

**No.** `email_verified` already exists in Directus and is already fetched in `findByEmail()`.
No schema migration required.

### Shared Types, Frontend, Bot, Workers

**No change.** The `already_verified` status is not surfaced to callers. HTTP response contract (`202 { accepted: true }`) is unchanged.

---

## Precise Code Changes Required

### Change 1 — Extend `CreateLeadResult` type

```typescript
// BEFORE
status: 'created' | 'already_member' | 'reverification_sent';

// AFTER
status: 'created' | 'already_member' | 'reverification_sent' | 'already_verified';
```

### Change 2 — Insert guard before patchLead/dispatchVerifyEmail

```typescript
if (existing?.email_verified) {
  this.logger.log(
    `lead create skipped — email already verified user=${existing.id}`,
  );
  return { status: 'already_verified', userId: existing.id };
}
```

### Change 3 — New unit test case

```typescript
it('skips silently when existing lead is already verified', async () => {
  dx.get.mockResolvedValueOnce({
    data: [{ id: 'u-exist', email: 'eve@example.com', state: 'lead', email_verified: true }],
  });

  const result = await svc.create({ email: 'eve@example.com' });

  expect(result.status).toBe('already_verified');
  expect(result.userId).toBe('u-exist');
  expect(dx.patch).not.toHaveBeenCalled();
  expect(dispatcher.dispatch).not.toHaveBeenCalled();
});
```

---

## Risk Flags

- **Security Review Required?** No — fix reduces system behaviour (fewer emails, fewer Directus writes).
- **Architecture Rule Risks:** None. Fix stays within `leads` module boundary.

---

## Blast Radius Summary

- **Files changed**: 2
- **Lines added**: ~12
- **Existing tests that break**: 0 — new status value is additive
- **DB migration required**: no
- **Deployment risk**: low

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Two-file ~12-line fix; no DB migration, no API contract change, no cross-module blast radius."
```

Gate: passed
