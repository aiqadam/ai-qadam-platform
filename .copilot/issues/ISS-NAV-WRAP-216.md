---
id: ISS-NAV-WRAP-216
status: fixed
created: 2026-08-21
workflow: wf-20260821-fix-216
---

# Top nav wraps to two lines on RU locale — "Правила сообщества" and "События и история" too long

## Summary

Reported directly from the live QA site (screenshot): the RU top nav
wrapped "Правила сообщества" (Community Rules) and "События и
история" (Events & History) onto a second line, breaking the single-row
header layout.

## Fix

- Shortened both nav labels to one word each, in both locales:
  - RU: "Правила сообщества" → "Правила", "События и история" → "История"
  - EN (parity): "Community Rules" → "Rules", "Events & History" → "History"
  - Page titles/headings on `/rules` and `/history` themselves are
    unchanged — only the nav link labels (`nav.rules`, `nav.history`)
    were shortened.
- Added `whitespace-nowrap` to all 6 top-nav links in `AppNav.astro` so
  this class of wrap can't recur at other viewport widths or if a
  locale's label happens to be long again.

## Verification
- `apps/web-next` unit suite: 1115/1115 pass, unchanged.
- Visual check via local dev server at 1024px viewport, RU locale
  cookie: nav renders on a single line (screenshot reviewed, not
  committed).
