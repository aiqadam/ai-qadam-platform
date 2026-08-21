---
id: ISS-PROSE-TYPOGRAPHY-217
status: fixed
created: 2026-08-21
workflow: wf-20260821-fix-217
---

# CMS document body text renders unstyled ("formatting mush") — @tailwindcss/typography never installed

## Summary

Reported directly from the live QA site: `/rules/manifesto`'s document
body renders as a wall of unstyled text — no heading hierarchy, no
paragraph spacing, no readable measure.

## Root cause

Five pages apply Tailwind's `prose prose-stone` classes to
markdown-rendered content (`/rules/[slug]`, `/about`, `/history`,
`/partners`, `/welcome/[slug]`) — but `@tailwindcss/typography` was
never installed in this repo. The classes are inert: no CSS rules
exist for `.prose`/`.prose-stone`, so the converted `h1`/`h2`/`p` tags
get zero styling beyond browser defaults. This has been broken since
FR-CMS-002/FR-CMS-007 shipped; nobody had visually inspected a
non-empty document body until now.

## Fix

- Installed `@tailwindcss/typography` (`^0.5.19`, matches Tailwind 4)
  and registered it via `@plugin "@tailwindcss/typography";` in
  `apps/web-next/src/styles/globals.css` (Tailwind 4's CSS-first
  config, no JS config file needed).
- The plugin ships its own independent OKLCH color palette
  (`--tw-prose-*` custom properties, "stone" gray scale) — per the
  design system's "never add new color tokens, always use
  `var(--token-name)`" rule, added a `.prose { --tw-prose-*: var(...) }`
  override block rebinding every one of the plugin's color variables
  to this project's own existing tokens (`--foreground`,
  `--muted-foreground`, `--primary`, `--border`, `--muted`). Document
  body text now follows the site's theme (including dark mode)
  instead of running a second, disconnected color system. No new
  color tokens introduced — every value points at an existing token.
- `prose-stone` class usages left untouched in all 5 page files — the
  variant class still contributes valid typographic sizing/spacing;
  its own baked-in colors are simply overridden by the `.prose` rule
  (last-in-cascade wins on custom properties).

## Verification
- `apps/web-next` unit suite: 1115/1115 pass, unchanged.
- Compiled CSS output inspected directly: confirmed `.prose`/`.prose-stone`
  now generate real rules (heading sizes, margins, line-height) and
  that the color custom properties resolve to `var(--foreground)` etc.,
  not the plugin's own hex/OKLCH literals.
- Rendered a real document body (`AI Qadam Manifesto.docx`'s markdown)
  through the actual `renderMarkdown()` pipeline into a standalone
  themed HTML page using the compiled CSS, screenshotted it: proper
  heading hierarchy, paragraph spacing, list styling, correct
  light/dark theme colors — confirmed visually, no longer unstyled.
