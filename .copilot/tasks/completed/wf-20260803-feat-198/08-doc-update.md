# 08 — Documentation Update: FR-AUTH-005 Telegram Account Linking

Agent: DocWriter
Workflow: wf-20260803-feat-198

## Gate result: passed

---

## Changes made

### 1. `docs/03-requirements/FR-AUTH-005.md`
- Changed `status: Planned` → `status: Implemented` in frontmatter.
- No other changes — description was already corrected by the prior session step.

### 2. `docs/03-requirements/requirements-registry.md`
- Row 56: changed Status column from `Planned` → `Shipped`.

Both changes were applied in a single edit batch (same logical commit).

---

## Architecture doc check

`docs/04-development/architecture/architecture.md` — reviewed. The bot section
describes scope at the feature-category level (member-facing flows, organizer-runtime
operations) and does not enumerate individual commands. The `/link` command falls
within the existing "basic profile" scope. No update required.

---

## Summary

| Document | Change |
|---|---|
| `docs/03-requirements/FR-AUTH-005.md` | `status` frontmatter: `Planned` → `Implemented` |
| `docs/03-requirements/requirements-registry.md` | Row 56 Status: `Planned` → `Shipped` |
| `docs/04-development/architecture/architecture.md` | No change needed |
