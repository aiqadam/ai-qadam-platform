# Documentation restructure — how to run it

This folder contains a one-shot migration that reorganizes all documentation
into the five-layer architecture described in
[ADR-0039](assets/0039-five-layer-doc-architecture.md).

- `migrate.py` — the migration (dry-run by default; `--apply` executes it)
- `assets/0039-five-layer-doc-architecture.md` — the new ADR the script installs
- `RUN.md` — this file

The script was validated end to end on a copy of this repo: **81 files moved,
all in-repo Markdown links + code-comment references + the Storybook `brandUrl`
rewritten, layer indexes generated, and zero valid links turned broken.**

---

## Why you have to run this yourself

The restructure was prepared in a sandbox where this repo is mounted from
Windows. Two conditions there made it unsafe to run the `git mv` operations
remotely, and you should clear both before applying:

1. **Line endings.** Every file currently differs from `HEAD` only by CRLF vs
   LF (there is no `.gitattributes` or `core.autocrlf` set). If you `git mv` and
   commit in that state, git records delete+add instead of clean renames and the
   diff is buried under ~147k line-ending changes.
2. **A stale `.git/index.lock`** was left in the working copy and blocks git
   index writes.

---

## Prerequisites (do these first)

```powershell
# 1. Remove the stale lock (only if no git process / GUI is running)
del .git\index.lock

# 2. Normalize line endings once, so renames stay clean.
#    Add a .gitattributes if you don't have one:
#       * text=auto eol=lf
#    then renormalize and commit on its OWN branch/PR:
git checkout -b chore/normalize-line-endings
git add --renormalize .
git commit -m "chore: normalize line endings to LF"
#    (merge this before the restructure so the two changes don't tangle)

# 3. Start the restructure from a clean tree on a feature branch
git checkout main && git pull
git checkout -b docs/restructure-5-layers   # (a branch of this name may already exist)
git status        # must be clean
```

> A branch named `docs/restructure-5-layers` may already exist from the
> preparation session — reuse or delete it as you prefer.

---

## Run it

```powershell
# Always from the repository root.
python docs\_restructure\migrate.py            # DRY RUN — prints every planned change, changes nothing
python docs\_restructure\migrate.py --apply    # performs the migration
```

After `--apply`:

```powershell
git status                 # review moves + edits
git diff --stat -M         # confirm git shows renames (R), not delete+add
```

Then run your own checks before committing:

```powershell
pnpm biome check .         # lint/format must stay green
pnpm arch:check            # architecture lint (references docs paths)
```

Commit and open a PR (note: this intentionally exceeds the normal 400-line /
5-file PR cap — call it out in the description as an approved one-off structural
migration, per ADR-0039):

```powershell
git add -A
git commit -m "docs: restructure documentation into 5-layer architecture (ADR-0039)"
```

---

## What it does, in order

1. `git mv` 81 files into `docs/01-business`, `docs/02-business-processes`,
   `docs/03-requirements`, `docs/04-development/{architecture,backend,frontend,
   design-system,testing,infrastructure,security}`, and `docs/05-other`.
2. Rewrites Markdown links (code fences skipped; a link is only changed when it
   resolves to a real file, so nothing valid can break).
3. Rewrites root-relative path references in code comments, configs, and the
   Storybook `brandUrl`.
4. Generates a `README.md` index for each layer and a `docs/README.md` root
   index, straight from the move map (so they can't drift).
5. Installs `docs/adr/0039-…md` and marks `ADR-0001` as superseded.
6. Patches `.claude/CLAUDE.md` section 1 to point at the relocated operating docs.

`CLAUDE.md` and `.claude/INIT_PROMPT.md` stay in `.claude/`. ADRs stay in
`docs/adr/` as one chronological log. See ADR-0039 for the reasoning.

---

## Known residual (NOT caused by this change)

The repo already has **37 broken Markdown links** that point at files which do
not exist (agent `memory/*` notes, `pii-data-flow.md`, `0016-auth-bootstrap.md`,
a `platform-hardening-assessment-2026-05-29.md`, `infrastructure/twenty/…`,
etc.). The migration leaves these exactly as they are — it never rewrites a link
whose target is missing. Worth cleaning up separately, but out of scope here.

---

## Cleanup

Once merged, you can delete this helper folder:

```powershell
git rm -r docs\_restructure
git commit -m "chore: remove one-shot restructure tooling"
```
