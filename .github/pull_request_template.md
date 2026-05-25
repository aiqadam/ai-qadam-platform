## What
<!-- One paragraph: what does this PR do -->

## Why
<!-- One paragraph: why is this needed -->

## How
<!-- Bullet points: key implementation decisions -->

## Risks
<!-- What could break? Blast radius? -->

## Testing
<!-- How was this tested? What tests were added? -->

## Screenshots / Logs
<!-- If UI or behavior change, attach evidence -->

## Checklist
- [ ] Tests added / updated
- [ ] Docs updated if behavior changed
- [ ] No new dependencies (or justified above)
- [ ] Manually tested locally

## Architecture compliance (ADR-0038 — `apps/web-next/` only)

> Skip this section if your PR does not touch `apps/web-next/`.
> `apps/web/` is grandfathered until cutover.

- [ ] I composed L3 blocks; I did not write inline `style=` or raw `fetch()`
- [ ] No `fetch('/api/...')` outside `apps/web-next/src/lib/api-*.ts`
- [ ] If I added a block: I added a Storybook story AND updated `docs/architecture/blocks.md`
- [ ] If I changed data wiring: I updated `docs/architecture/wiring-map.md`
- [ ] If I added a new page or cabinet: it was generated via `pnpm gen:page` / `pnpm gen:cabinet` (carries the `@generated-from` marker)
- [ ] `pnpm arch:check` passes locally
