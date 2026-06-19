#!/usr/bin/env python3
"""
migrate.py - Restructure AI Qadam documentation into the 5-layer architecture.

WHY THIS SCRIPT EXISTS
----------------------
The docs grew organically into .claude/ (agent operating docs) and docs/
(ADRs, runbooks, playbooks, plans, architecture). We are reorganizing every
document into five explicit layers so a reader can find things by intent:

    01-business             Why we exist: principles, vision, strategy, glossary, policy
    02-business-processes   How the org/community operates: playbooks, ops runbooks, process
    03-requirements         What the product must do: feature surfaces, plans, briefs
    04-development          How we build it: architecture, backend, frontend,
                            design-system, testing, infrastructure, security, standards
    05-other                Everything else: handover, reviews, agent collaboration

Two deliberate engineering calls (documented in ADR-0039):
  * ADRs stay together in docs/adr/ as an immutable, chronological decision log.
    Splitting them by layer would break their numbering convention, the
    decision-batch review cadence, and dozens of cross-references. The layer
    index READMEs link to the relevant ADRs instead.
  * CLAUDE.md stays in .claude/ because it is the ONLY file the agent runtime
    auto-loads at session start. Its "required reading" list (section 1) is
    rewritten to point at the new layered locations of the other operating docs.

WHAT IT DOES
------------
  1. git mv every mapped file to its new home (preserves history).
  2. Rewrites every Markdown link and known code-comment/doc path reference so
     nothing breaks.
  3. Auto-generates a README index for each layer (and a docs/README.md root
     index) straight from the move map, so the indexes can never drift.
  4. Writes ADR-0039 and marks ADR-0001 as superseded.
  5. Patches CLAUDE.md section 1 to point at the relocated operating docs.

SAFETY
------
  * Dry-run by default. It prints what WOULD happen and changes nothing.
    Pass --apply to actually perform the migration.
  * Run it from the repository root, on a clean feature branch, AFTER you have
    normalized line endings and removed any stale .git/index.lock
    (see docs/_restructure/RUN.md).

USAGE
-----
    python docs/_restructure/migrate.py            # dry run (safe preview)
    python docs/_restructure/migrate.py --apply    # perform the migration
"""

from __future__ import annotations

import argparse
import posixpath
import re
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# 1. THE MOVE MAP                                                             #
#    old repo-relative path (posix)  ->  new repo-relative path (posix)       #
#    Files NOT listed here stay where they are (CLAUDE.md, INIT_PROMPT.md,    #
#    all docs/adr/*, root README.md, code-adjacent READMEs).                  #
# --------------------------------------------------------------------------- #
MOVE_MAP: dict[str, str] = {
    # ---- Layer 1: Business -------------------------------------------------
    ".claude/PROJECT.md": "docs/01-business/project.md",
    ".claude/GLOSSARY.md": "docs/01-business/glossary.md",
    "docs/community-platform-roadmap.md": "docs/01-business/community-platform-roadmap.md",
    "docs/product-plan.md": "docs/01-business/product-plan.md",
    "docs/policies/aup-v0.md": "docs/01-business/policies/aup-v0.md",

    # ---- Layer 2: Business processes --------------------------------------
    "docs/business-process-gaps.md": "docs/02-business-processes/business-process-gaps.md",
    "docs/decision-batch-process.md": "docs/02-business-processes/decision-batch-process.md",
    "docs/marketing-and-pr-playbook.md": "docs/02-business-processes/marketing-and-pr-playbook.md",
    "docs/marketing-utm-scheme.md": "docs/02-business-processes/marketing-utm-scheme.md",
    "docs/operator-playbook/README.md": "docs/02-business-processes/operator-playbook/README.md",
    "docs/operator-playbook/brand-asset-production.md": "docs/02-business-processes/operator-playbook/brand-asset-production.md",
    "docs/operator-playbook/community-conduct.md": "docs/02-business-processes/operator-playbook/community-conduct.md",
    "docs/operator-playbook/country-launch.md": "docs/02-business-processes/operator-playbook/country-launch.md",
    "docs/operator-playbook/csat-collection.md": "docs/02-business-processes/operator-playbook/csat-collection.md",
    "docs/operator-playbook/event-production-day-of.md": "docs/02-business-processes/operator-playbook/event-production-day-of.md",
    "docs/operator-playbook/post-event-checklist.md": "docs/02-business-processes/operator-playbook/post-event-checklist.md",
    "docs/operator-playbook/speaker-outreach.md": "docs/02-business-processes/operator-playbook/speaker-outreach.md",
    "docs/operator-playbook/sponsor-onboarding.md": "docs/02-business-processes/operator-playbook/sponsor-onboarding.md",
    "docs/operator-playbook/venue-selection.md": "docs/02-business-processes/operator-playbook/venue-selection.md",
    # operational runbooks (community + product features run by operators)
    "docs/runbooks/country-lead-activation.md": "docs/02-business-processes/operations/country-lead-activation.md",
    "docs/runbooks/event-csat.md": "docs/02-business-processes/operations/event-csat.md",
    "docs/runbooks/event-member-matches.md": "docs/02-business-processes/operations/event-member-matches.md",
    "docs/runbooks/event-pre-event-reminders.md": "docs/02-business-processes/operations/event-pre-event-reminders.md",
    "docs/runbooks/event-publication-broadcast.md": "docs/02-business-processes/operations/event-publication-broadcast.md",
    "docs/runbooks/event-speaker-pipeline.md": "docs/02-business-processes/operations/event-speaker-pipeline.md",
    "docs/runbooks/lead-nurture.md": "docs/02-business-processes/operations/lead-nurture.md",
    "docs/runbooks/member-graph-foundation.md": "docs/02-business-processes/operations/member-graph-foundation.md",
    "docs/runbooks/member-profile.md": "docs/02-business-processes/operations/member-profile.md",
    "docs/runbooks/member-referrals.md": "docs/02-business-processes/operations/member-referrals.md",
    "docs/runbooks/operator-announce-composer.md": "docs/02-business-processes/operations/operator-announce-composer.md",
    "docs/runbooks/operator-approvals-queue.md": "docs/02-business-processes/operations/operator-approvals-queue.md",
    "docs/runbooks/operator-cohort-builder.md": "docs/02-business-processes/operations/operator-cohort-builder.md",
    "docs/runbooks/operator-email-send-as.md": "docs/02-business-processes/operations/operator-email-send-as.md",
    "docs/runbooks/operator-event-control.md": "docs/02-business-processes/operations/operator-event-control.md",

    # ---- Layer 3: Requirements --------------------------------------------
    "docs/forum-adoption-brief.md": "docs/03-requirements/forum-adoption-brief.md",
    "docs/sprint-5-to-8-plan.md": "docs/03-requirements/sprint-5-to-8-plan.md",
    "docs/architecture/web-v1-feature-surface.md": "docs/03-requirements/web-v1-feature-surface.md",
    "docs/architecture/parity-matrix.md": "docs/03-requirements/parity-matrix.md",
    "docs/plans/294-broadcast-composer.md": "docs/03-requirements/plans/294-broadcast-composer.md",
    "docs/plans/326-event-content-i18n.md": "docs/03-requirements/plans/326-event-content-i18n.md",
    "docs/plans/customer-surface-finishline.md": "docs/03-requirements/plans/customer-surface-finishline.md",
    "docs/plans/f-ops1-snapshot-restore-ui.md": "docs/03-requirements/plans/f-ops1-snapshot-restore-ui.md",

    # ---- Layer 4: Development ----------------------------------------------
    # standards / workflow (top of the development layer)
    ".claude/STANDARDS.md": "docs/04-development/standards.md",
    ".claude/WORKFLOW.md": "docs/04-development/workflow.md",
    # architecture
    ".claude/ARCHITECTURE.md": "docs/04-development/architecture/architecture.md",
    "docs/auth-architecture.md": "docs/04-development/architecture/auth-architecture.md",
    "docs/interaction-architecture.md": "docs/04-development/architecture/interaction-architecture.md",
    "docs/migration-to-directus-centric.md": "docs/04-development/architecture/migration-to-directus-centric.md",
    "docs/architecture/blocks.md": "docs/04-development/architecture/blocks.md",
    "docs/architecture/wiring-map.md": "docs/04-development/architecture/wiring-map.md",
    "docs/architecture/telegram-outbox-delivery-contract.md": "docs/04-development/architecture/telegram-outbox-delivery-contract.md",
    # backend
    "docs/integrations/telegram-bot.md": "docs/04-development/backend/integrations/telegram-bot.md",
    # frontend
    "docs/architecture/web-migration-plan.md": "docs/04-development/frontend/web-migration-plan.md",
    "docs/architecture/web-next-kickoff.md": "docs/04-development/frontend/web-next-kickoff.md",
    "docs/architecture/web-next-workplan.md": "docs/04-development/frontend/web-next-workplan.md",
    # design system
    "docs/ux-and-content-guidelines.md": "docs/04-development/design-system/ux-and-content-guidelines.md",
    # infrastructure
    "docs/token-rotation-tool-design.md": "docs/04-development/infrastructure/token-rotation-tool-design.md",
    "docs/runbooks/README.md": "docs/04-development/infrastructure/runbooks/README.md",
    "docs/runbooks/auth.md": "docs/04-development/infrastructure/runbooks/auth.md",
    "docs/runbooks/authentik-local-bootstrap.md": "docs/04-development/infrastructure/runbooks/authentik-local-bootstrap.md",
    "docs/runbooks/authentik-ropc.md": "docs/04-development/infrastructure/runbooks/authentik-ropc.md",
    "docs/runbooks/coolify-app-stacks.md": "docs/04-development/infrastructure/runbooks/coolify-app-stacks.md",
    "docs/runbooks/coolify-bootstrap.md": "docs/04-development/infrastructure/runbooks/coolify-bootstrap.md",
    "docs/runbooks/dms-config-bind-mount-migration.md": "docs/04-development/infrastructure/runbooks/dms-config-bind-mount-migration.md",
    "docs/runbooks/docker-iptables-and-ufw.md": "docs/04-development/infrastructure/runbooks/docker-iptables-and-ufw.md",
    "docs/runbooks/internal-cron.md": "docs/04-development/infrastructure/runbooks/internal-cron.md",
    "docs/runbooks/observability.md": "docs/04-development/infrastructure/runbooks/observability.md",
    "docs/runbooks/restic-backups.md": "docs/04-development/infrastructure/runbooks/restic-backups.md",
    "docs/runbooks/snapshot-restore.md": "docs/04-development/infrastructure/runbooks/snapshot-restore.md",
    "docs/runbooks/telegram-token-rotation.md": "docs/04-development/infrastructure/runbooks/telegram-token-rotation.md",
    # security
    ".claude/SECURITY.md": "docs/04-development/security/security.md",
    "docs/runbooks/audit.md": "docs/04-development/security/runbooks/audit.md",
    "docs/runbooks/break-glass.md": "docs/04-development/security/runbooks/break-glass.md",
    "docs/runbooks/rbac-drift.md": "docs/04-development/security/runbooks/rbac-drift.md",
    "docs/runbooks/secret-rotation-pending.md": "docs/04-development/security/runbooks/secret-rotation-pending.md",
    "docs/runbooks/security.md": "docs/04-development/security/runbooks/security.md",
    "docs/runbooks/supply-chain.md": "docs/04-development/security/runbooks/supply-chain.md",

    # ---- Layer 5: Other ----------------------------------------------------
    ".claude/AI_COLLAB.md": "docs/05-other/ai-collab.md",
    "docs/agent-prompts.md": "docs/05-other/agent-prompts.md",
    "docs/HANDOVER.md": "docs/05-other/handover.md",
    "docs/critical-review.md": "docs/05-other/critical-review.md",
}

# --------------------------------------------------------------------------- #
# 2. LAYER METADATA - drives the auto-generated index READMEs                 #
# --------------------------------------------------------------------------- #
LAYER_META: list[dict] = [
    {
        "dir": "docs/01-business",
        "title": "Layer 1 - Business",
        "blurb": (
            "Why AI Qadam exists. Community principles and ideas, vision and "
            "strategy, the domain glossary, and governing policies. Read this "
            "layer first to understand intent before anything technical."
        ),
        "adrs": [
            ("0022-country-lead-compensation.md", "Country-lead compensation model"),
            ("0023-sponsor-invoicing.md", "Sponsor invoicing"),
            ("0024-future-revenue-phasing.md", "Future revenue phasing"),
            ("0025-brand-asset-tooling.md", "Brand-asset tooling"),
            ("0026-telegram-channel.md", "Telegram channel presence"),
            ("0027-x-twitter-presence.md", "X (Twitter) presence"),
            ("0028-first-paid-spend.md", "First paid spend"),
            ("0029-russian-voice-owner.md", "Russian-language voice owner"),
            ("0030-photo-consent.md", "Photo consent at events"),
        ],
    },
    {
        "dir": "docs/02-business-processes",
        "title": "Layer 2 - Business processes",
        "blurb": (
            "How the organization and community operate day to day. Operator "
            "playbooks, marketing and decision processes, and the operational "
            "runbooks operators follow to run events, leads, and member flows."
        ),
        "adrs": [
            ("0012-operator-send-as-automation.md", "Operator Send-as automation"),
            ("0036-sponsor-digest-rollups.md", "Sponsor quarterly-digest rollups"),
        ],
    },
    {
        "dir": "docs/03-requirements",
        "title": "Layer 3 - Requirements",
        "blurb": (
            "What the product must do. Feature surfaces and the v1->v2 parity "
            "matrix, sprint and adoption plans, and per-feature delivery plans."
        ),
        "adrs": [
            ("0015-bot-scope-and-web-authoring-split.md", "Bot scope vs web authoring"),
        ],
    },
    {
        "dir": "docs/04-development",
        "title": "Layer 4 - Development",
        "blurb": (
            "How we build and run the platform. Code standards and workflow, "
            "architecture, and per-discipline guides: backend, frontend, "
            "design-system, testing, infrastructure, and security."
        ),
        "adrs": [
            ("0002-deployment-target.md", "Deployment target"),
            ("0007-coolify-orchestration.md", "Coolify orchestration"),
            ("0013-orm-drizzle-over-prisma.md", "ORM: Drizzle over Prisma"),
            ("0014-lint-format-biome.md", "Lint/format via Biome"),
            ("0016-web-auth-flow.md", "Web auth flow"),
            ("0017-backup-architecture.md", "Backup architecture"),
            ("0021-rbac-manifest.md", "RBAC manifest"),
            ("0037-three-tier-architecture.md", "Three-tier architecture"),
            ("0038-web-4-layer-architecture.md", "Web 4-layer block composition"),
        ],
    },
    {
        "dir": "docs/05-other",
        "title": "Layer 5 - Other",
        "blurb": (
            "Cross-cutting and meta material that does not belong to a single "
            "layer: engineering/product handover, critical reviews, how we "
            "collaborate with the AI agent, and agent task prompts."
        ),
        "adrs": [
            ("0001-docs-live-in-claude-folder.md", "Docs location (superseded by ADR-0039)"),
            ("0039-five-layer-doc-architecture.md", "Five-layer documentation architecture"),
        ],
    },
]

# Subfolders that should get a short notice in their parent layer index.
SUBFOLDER_LABELS = {
    "docs/02-business-processes/operator-playbook": "Operator playbook",
    "docs/02-business-processes/operations": "Operational runbooks",
    "docs/03-requirements/plans": "Delivery plans",
    "docs/04-development/architecture": "Architecture",
    "docs/04-development/backend": "Backend",
    "docs/04-development/frontend": "Frontend",
    "docs/04-development/design-system": "Design system",
    "docs/04-development/infrastructure": "Infrastructure",
    "docs/04-development/security": "Security",
}

# Operating docs whose new relative-from-.claude path goes into CLAUDE.md section 1.
CLAUDE_SECTION1 = {
    "PROJECT.md": "../docs/01-business/project.md",
    "ARCHITECTURE.md": "../docs/04-development/architecture/architecture.md",
    "STANDARDS.md": "../docs/04-development/standards.md",
    "WORKFLOW.md": "../docs/04-development/workflow.md",
    "SECURITY.md": "../docs/04-development/security/security.md",
    "AI_COLLAB.md": "../docs/05-other/ai-collab.md",
    "GLOSSARY.md": "../docs/01-business/glossary.md",
}

# File extensions to scan for root-relative path references (code comments etc.)
TEXT_EXT = {".md", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".astro",
            ".json", ".sh", ".yml", ".yaml", ".mdx"}

MD_LINK_RE = re.compile(r"\]\(([^)]+)\)")
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)

# Full-string references the guarded path regex intentionally skips (e.g. a
# doc path embedded in an external GitHub blob URL). Replaced verbatim.
EXTRA_URL_REPLACEMENTS = {
    "blob/main/docs/architecture/blocks.md":
        "blob/main/docs/04-development/architecture/blocks.md",
}


# --------------------------------------------------------------------------- #
# helpers                                                                      #
# --------------------------------------------------------------------------- #
def sh(args: list[str], apply: bool) -> None:
    """Run a shell command (only when applying)."""
    if apply:
        subprocess.run(args, check=True)
    else:
        print("   would run:", " ".join(args))


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str, apply: bool) -> None:
    if apply:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    else:
        print("   would write:", path)


def title_of(path: Path) -> str:
    """First H1 of a markdown file, or its filename if none."""
    try:
        m = H1_RE.search(read(path))
        return m.group(1).strip() if m else path.name
    except OSError:
        return path.name


def is_external(target: str) -> bool:
    t = target.strip()
    return (
        "://" in t
        or t.startswith("#")
        or t.startswith("mailto:")
        or t.startswith("/")
    )


# --------------------------------------------------------------------------- #
# step A: move files with git mv                                              #
# --------------------------------------------------------------------------- #
def do_moves(root: Path, apply: bool) -> None:
    print("\n== Step A: git mv files into the layer tree ==")
    for old, new in MOVE_MAP.items():
        old_p, new_p = root / old, root / new
        if not old_p.exists():
            print(f"   SKIP (missing): {old}")
            continue
        if apply:
            new_p.parent.mkdir(parents=True, exist_ok=True)
        print(f"   {old}  ->  {new}")
        sh(["git", "mv", old, new], apply)


# --------------------------------------------------------------------------- #
# step B: rewrite links                                                       #
# --------------------------------------------------------------------------- #
def rewrite_markdown_links(root: Path, apply: bool) -> int:
    """
    For every markdown file (at its NEW location), fix inline links whose
    source file moved and/or whose target moved. We resolve each link against
    the file's OLD directory, then recompute it from the file's NEW directory
    to the target's NEW location.

    Two safety rules keep us from corrupting anything:
      * Fenced code blocks (``` or ~~~) are skipped, so a regex such as
        ](\\.\\./)+lib inside an example is never treated as a link.
      * A link is only rewritten when the recomputed target is a real file.
        That guarantees a valid link can never be turned into a broken one,
        and pre-existing broken links are left exactly as they were.
    """
    print("\n== Step B1: rewrite Markdown inline links ==")
    reverse = {v: k for k, v in MOVE_MAP.items()}
    md_files = [p for p in root.rglob("*.md")
                if ".git" not in p.parts and "node_modules" not in p.parts]
    changed = 0
    for p in md_files:
        new_rel = p.relative_to(root).as_posix()
        old_rel = reverse.get(new_rel, new_rel)

        def repl(m: "re.Match[str]") -> str:
            target = m.group(1)
            if is_external(target):
                return m.group(0)
            anchor = ""
            path_part = target
            if "#" in target:
                path_part, anchor = target.split("#", 1)
                anchor = "#" + anchor
            if not path_part:  # pure anchor like (#section)
                return m.group(0)
            resolved_old = posixpath.normpath(
                posixpath.join(posixpath.dirname(old_rel), path_part)
            )
            # only act when this file moved or the target moved
            if old_rel not in MOVE_MAP and resolved_old not in MOVE_MAP:
                return m.group(0)
            target_new = MOVE_MAP.get(resolved_old, resolved_old)
            # never touch a link unless it will point at a real file
            if not (root / target_new).exists():
                return m.group(0)
            start_dir = posixpath.dirname(new_rel) or "."
            new_link = posixpath.relpath(target_new, start_dir)
            return f"]({new_link}{anchor})"

        original = read(p)
        out, in_fence = [], False
        for line in original.splitlines(keepends=True):
            s = line.lstrip()
            if s.startswith("```") or s.startswith("~~~"):
                in_fence = not in_fence
                out.append(line)
            elif in_fence:
                out.append(line)
            else:
                out.append(MD_LINK_RE.sub(repl, line))
        new_text = "".join(out)

        if new_text != original:
            changed += 1
            print(f"   links updated: {new_rel}")
            write(p, new_text, apply)
    print(f"   ({changed} markdown files touched)")
    return changed


def rewrite_root_relative_refs(root: Path, apply: bool) -> int:
    """
    Fix repo-root-relative path references that are NOT markdown links:
    code comments (e.g. // see docs/runbooks/auth.md), the Storybook brandUrl,
    backtick prose like `.claude/SECURITY.md`, etc. We only match a path when
    it is a standalone token (not preceded by '/' '.' '-' or a word char), so
    we never corrupt a '../' relative link that Step B1 already handled.
    """
    print("\n== Step B2: rewrite root-relative path references in all text files ==")
    # longest-first so nested paths replace before their prefixes
    pairs = sorted(MOVE_MAP.items(), key=lambda kv: len(kv[0]), reverse=True)
    patterns = [
        (re.compile(r"(?<![\w./-])" + re.escape(old) + r"(?![\w-])"), new)
        for old, new in pairs
    ]
    files = [p for p in root.rglob("*")
             if p.suffix in TEXT_EXT
             and ".git" not in p.parts and "node_modules" not in p.parts]
    changed = 0
    for p in files:
        try:
            text = read(p)
        except (OSError, UnicodeDecodeError):
            continue
        new_text = text
        for old_u, new_u in EXTRA_URL_REPLACEMENTS.items():
            new_text = new_text.replace(old_u, new_u)
        for rx, new in patterns:
            new_text = rx.sub(new, new_text)
        if new_text != text:
            changed += 1
            print(f"   refs updated: {p.relative_to(root).as_posix()}")
            write(p, new_text, apply)
    print(f"   ({changed} files touched)")
    return changed


# --------------------------------------------------------------------------- #
# step C: generate layer index READMEs + docs/README.md                       #
# --------------------------------------------------------------------------- #
def generate_indexes(root: Path, apply: bool) -> None:
    print("\n== Step C: generate layer indexes ==")
    for layer in LAYER_META:
        layer_dir = layer["dir"]
        entries = [new for new in MOVE_MAP.values()
                   if new.startswith(layer_dir + "/")]
        lines = [f"# {layer['title']}", "", layer["blurb"], ""]

        # files directly in the layer root
        direct = sorted(n for n in entries
                        if posixpath.dirname(n) == layer_dir
                        and posixpath.basename(n) != "README.md")
        if direct:
            lines.append("## Documents")
            lines.append("")
            for n in direct:
                t = title_of(root / n) if (root / n).exists() else posixpath.basename(n)
                lines.append(f"- [{t}]({posixpath.basename(n)})")
            lines.append("")

        # files inside known subfolders
        for sub, label in SUBFOLDER_LABELS.items():
            if not sub.startswith(layer_dir + "/"):
                continue
            sub_entries = sorted(n for n in entries
                                 if posixpath.dirname(n).startswith(sub))
            if not sub_entries:
                continue
            lines.append(f"## {label}")
            lines.append("")
            for n in sub_entries:
                if posixpath.basename(n) == "README.md":
                    continue
                t = title_of(root / n) if (root / n).exists() else posixpath.basename(n)
                rel = posixpath.relpath(n, layer_dir)
                lines.append(f"- [{t}]({rel})")
            lines.append("")

        # related ADRs (ADRs themselves stay in docs/adr/)
        if layer.get("adrs"):
            lines.append("## Related decisions (ADRs)")
            lines.append("")
            lines.append("ADRs live in the chronological log at "
                         "[`docs/adr/`](../adr/). Those most relevant here:")
            lines.append("")
            for fname, desc in layer["adrs"]:
                lines.append(f"- [{fname.replace('.md', '')}](../adr/{fname}) - {desc}")
            lines.append("")

        write(root / layer_dir / "README.md", "\n".join(lines).rstrip() + "\n", apply)
        print(f"   index: {layer_dir}/README.md")

    # testing sub-index (no doc moves into it, so seed a pointer page)
    testing_readme = (
        "# Layer 4 - Development - Testing\n\n"
        "Testing standards live in [../standards.md](../standards.md) "
        "(see the Testing section). Conventions for the end-to-end smoke suite "
        "live with the code in [`apps/e2e/README.md`](../../../apps/e2e/README.md).\n\n"
        "Add test-strategy and test-plan documents here as they are written.\n"
    )
    write(root / "docs/04-development/testing/README.md", testing_readme, apply)
    print("   index: docs/04-development/testing/README.md")

    # backend sub-index pointer (so the discipline folder is self-describing)
    backend_readme = (
        "# Layer 4 - Development - Backend\n\n"
        "NestJS API and integrations. Cross-cutting architecture lives in "
        "[../architecture/architecture.md](../architecture/architecture.md).\n\n"
        "## Integrations\n\n"
        "- [Telegram bot + outbound sender](integrations/telegram-bot.md)\n"
    )
    write(root / "docs/04-development/backend/README.md", backend_readme, apply)
    print("   index: docs/04-development/backend/README.md")

    # docs/README.md root index
    root_lines = [
        "# AI Qadam - Documentation",
        "",
        "Documentation is organized into five layers, from intent down to "
        "implementation. Read top to bottom to go from *why* to *how*.",
        "",
    ]
    for i, layer in enumerate(LAYER_META, start=1):
        rel = posixpath.relpath(layer["dir"], "docs")
        root_lines.append(f"{i}. **[{layer['title']}]({rel}/README.md)** - {layer['blurb']}")
    root_lines += [
        "",
        "## Decision log",
        "",
        "Architecture Decision Records remain a single chronological, immutable "
        "log in [`adr/`](adr/). Each layer index links to the ADRs most relevant "
        "to it. See [ADR-0039](adr/0039-five-layer-doc-architecture.md) for the "
        "rationale behind this structure.",
        "",
        "## Agent operating context",
        "",
        "`/.claude/CLAUDE.md` is the entry point the agent runtime auto-loads at "
        "session start; its required-reading list points into the layers above.",
        "",
    ]
    write(root / "docs/README.md", "\n".join(root_lines), apply)
    print("   index: docs/README.md")


# --------------------------------------------------------------------------- #
# step D: write ADR-0039 and mark ADR-0001 superseded                         #
# --------------------------------------------------------------------------- #
def write_adrs(root: Path, apply: bool) -> None:
    print("\n== Step D: ADR-0039 + supersede ADR-0001 ==")
    adr_src = root / "docs/_restructure/assets/0039-five-layer-doc-architecture.md"
    adr_dst = root / "docs/adr/0039-five-layer-doc-architecture.md"
    if adr_src.exists():
        write(adr_dst, read(adr_src), apply)
        print("   wrote docs/adr/0039-five-layer-doc-architecture.md")
    else:
        print("   WARN: assets/0039-...md not found; ADR-0039 not written")

    adr1 = root / "docs/adr/0001-docs-live-in-claude-folder.md"
    if adr1.exists():
        text = read(adr1)
        if "Superseded by ADR-0039" not in text:
            text = text.replace(
                "## Status\nAccepted, 2026-05-14",
                "## Status\nSuperseded by [ADR-0039](0039-five-layer-doc-architecture.md), "
                "2026-06-19. Originally Accepted 2026-05-14.",
                1,
            )
            write(adr1, text, apply)
            print("   marked ADR-0001 as superseded")


# --------------------------------------------------------------------------- #
# step E: patch CLAUDE.md section 1 reading list                              #
# --------------------------------------------------------------------------- #
def patch_claude_md(root: Path, apply: bool) -> None:
    print("\n== Step E: patch .claude/CLAUDE.md section 1 ==")
    claude = root / ".claude/CLAUDE.md"
    if not claude.exists():
        print("   WARN: .claude/CLAUDE.md not found")
        return
    text = read(claude)
    for fname, newpath in CLAUDE_SECTION1.items():
        # match the backtick-wrapped filename inside the numbered reading list
        rx = re.compile(r"`" + re.escape(fname) + r"`")
        text, n = rx.subn(f"`{newpath}`", text)
        if n:
            print(f"   CLAUDE.md: `{fname}` -> `{newpath}` ({n}x)")
    write(claude, text, apply)


# --------------------------------------------------------------------------- #


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Restructure AI Qadam docs into the 5-layer architecture.")
    ap.add_argument("--apply", action="store_true",
                    help="actually perform the migration (default is dry run)")
    args = ap.parse_args()

    root = Path.cwd()
    if not (root / ".claude/CLAUDE.md").exists() or not (root / "docs").is_dir():
        print("ERROR: run this from the repository root "
              "(could not find .claude/CLAUDE.md and docs/).", file=sys.stderr)
        return 2

    if (root / ".git/index.lock").exists():
        print("WARNING: .git/index.lock exists. Remove it before --apply "
              "(no git process must be running).")

    mode = "APPLY" if args.apply else "DRY RUN (no changes; pass --apply to execute)"
    print(f"AI Qadam docs restructure - {mode}")

    do_moves(root, args.apply)
    rewrite_markdown_links(root, args.apply)
    rewrite_root_relative_refs(root, args.apply)
    generate_indexes(root, args.apply)
    write_adrs(root, args.apply)
    patch_claude_md(root, args.apply)

    print("\nDone." if args.apply
          else "\nDry run complete. Re-run with --apply to execute.")
    print("After applying: review `git status`, run your link checker, then open a PR.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
