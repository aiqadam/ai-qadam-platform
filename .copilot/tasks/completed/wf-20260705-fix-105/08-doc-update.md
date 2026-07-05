# Step 10 — Documentation Update

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** DocWriter

---

## What changed

Added a single subsection to `AGENTS.md §6.1` titled "Shell-script HTTP
client binary selection (added 2026-07-05, ISS-UAT-013-15)" that:

1. **States the requirement** — `scripts/uat-*.sh` and any other
   shell-script HTTP client in the repo must prefer native `curl.exe`
   on Windows when it is on PATH, falling back to GNU `curl`
   otherwise.
2. **Provides the canonical idiom** — the same `command -v curl.exe`
   block used in the fix, so future scripts adopt it verbatim.
3. **Explains the rationale** — the Copilot-Chat `run_in_terminal`
   sandbox on Windows resolves `curl` to the MSYS2 GNU ELF binary
   that cannot reach Windows-host `localhost:<port>`.
4. **Cross-references the precedent** — `scripts/uat-preflight-email.sh`
   lines 85-90 use the same form. Matches AGENTS.md §1 (prefer
   existing repo patterns over new inventions).
5. **Calls out the broader coverage** — `command -v curl.exe` covers
   WSL bash too, unlike the `uname` heuristic in the issue body.
6. **Explicit instruction to future agents** — "Future scripts should
   adopt this idiom at the top of the file rather than invoking
   `curl` directly."

## Why this is a §6.1 addition (not a §6.3 or other section)

§6.1 is the section that records "production-readiness and
infrastructure obligations" — exactly the category this fix belongs to
(the seed script is part of the UAT infrastructure). The subsection
sits between the "Honesty disclosures required when deferral is
unavoidable" subsection and the §6.3 "CI override policy" section.

## Why this matters beyond this issue

Three future scripts have a `curl` literal and would benefit from the
same pattern:

- `scripts/uat-env-setup.sh` (15 sites)
- `scripts/uat-preflight-check.sh`
- The 5 `scripts/provision-*.sh` scripts

Per AGENTS.md §4 ("small PR rule") and §13 ("agent decides how to
implement"), those scripts are out of scope for THIS workflow but
the AGENTS.md note ensures future agents who touch them have the
pattern documented and adopt it without rediscovering it.

## Files NOT updated

- `docs/04-development/architecture/architecture.md` — no architectural
  change. The fix is at the script-level, not the architecture-level.
- `docs/04-development/workflow.md` — no workflow change.
- `docs/04-development/testing/visual-testing.md` — no visual change.
- `docs/02-business-processes/uat/` — UAT scripts unchanged.

## Gate Result

```
gate_result:
  status: passed
  notes: |
    AGENTS.md §6.1 extended with one new subsection titled
    "Shell-script HTTP client binary selection (added 2026-07-05,
    ISS-UAT-013-15)". The subsection documents the canonical
    curl.exe-detection idiom, explains the rationale, cross-references
    the uat-preflight-email.sh precedent, and instructs future
    agents to adopt the pattern. 1 file modified, 1 subsection added,
    1 PR-compatible diff. No other docs files updated (out of scope).
```