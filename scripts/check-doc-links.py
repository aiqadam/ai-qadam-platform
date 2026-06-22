#!/usr/bin/env python3
"""Fail if any relative Markdown link under docs/ points at a missing file.

Why: the docs are large and cross-referenced; links rot silently when files move.
This gate keeps the broken-link count at zero, consistent with the zero-warnings
policy in .claude/CLAUDE.md.

Scope: only checks *relative* links (skips http/https/mailto/#/tel). Anchors are
ignored — the file must exist, the anchor is not validated. Code fences and inline
code spans are skipped so example/illustrative paths inside `...` or ``` blocks
don't trip the check.

Usage:
    python scripts/check-doc-links.py            # check docs/ (default)
    python scripts/check-doc-links.py <dir>      # check another root

Exit code 0 = clean, 1 = broken links found.
"""
import os
import re
import sys

DEFAULT_ROOT = "docs"
EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "#", "tel:")
LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
FENCE = re.compile(r"```.*?```", re.S)
INLINE_CODE = re.compile(r"`[^`]*`")


def find_broken(root: str) -> list[tuple[str, str]]:
    broken: list[tuple[str, str]] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if not name.endswith(".md"):
                continue
            md_path = os.path.join(dirpath, name)
            with open(md_path, encoding="utf-8", errors="replace") as handle:
                text = INLINE_CODE.sub("", FENCE.sub("", handle.read()))
            for match in LINK.finditer(text):
                target = match.group(1).strip()
                if target.startswith(EXTERNAL_PREFIXES):
                    continue
                rel = target.split("#", 1)[0]
                if not rel:
                    continue
                resolved = os.path.normpath(os.path.join(dirpath, rel))
                if not os.path.exists(resolved):
                    broken.append((md_path, target))
    return broken


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ROOT
    if not os.path.isdir(root):
        print(f"error: '{root}' is not a directory", file=sys.stderr)
        return 2
    broken = find_broken(root)
    # Broken links are diagnostics -> stderr. The summary is a normal result line
    # -> stdout. Splitting them this way keeps PowerShell from flagging a clean run
    # as an error (NativeCommandError fires on any stderr output from native commands)
    # and lets CI grep stdout for the count without capturing diagnostic noise.
    for md_path, target in sorted(broken):
        print(f"BROKEN  {md_path} -> {target}", file=sys.stderr)
    print(f"\n{len(broken)} broken link(s) under '{root}'")
    return 1 if broken else 0


if __name__ == "__main__":
    raise SystemExit(main())
