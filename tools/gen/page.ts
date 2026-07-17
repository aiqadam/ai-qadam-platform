// tools/gen/page.ts — scaffold a new customer-facing page under
// apps/web-next/src/pages/<slug>.astro from the page template.
//
// Usage:
//   pnpm gen:page <slug>
//
// The output carries the `@generated-from gen:page` marker required
// by tools/architecture-check.ts (Lock #3, ADR-0038).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const TEMPLATE = join(REPO_ROOT, 'tools', 'gen', 'templates', 'page.astro.tmpl');
const PAGES_DIR = join(REPO_ROOT, 'apps', 'web-next', 'src', 'pages');

const slugRaw = process.argv[2];

if (!slugRaw) {
  console.error('Usage: pnpm gen:page <slug>');
  console.error('  slug = kebab-case URL segment (or path), e.g. "events" or "events/[id]"');
  process.exit(2);
}

const slug = slugRaw.replace(/^\/+|\/+$/g, '');
if (!/^[a-z0-9[\]_\-/.]+$/i.test(slug)) {
  console.error(`Invalid slug: ${slug}`);
  console.error('Allowed: letters, digits, _, -, /, [, ], .');
  process.exit(2);
}

const outFile = join(PAGES_DIR, `${slug}.astro`);
if (existsSync(outFile)) {
  console.error(`Refusing to overwrite existing file: ${outFile}`);
  process.exit(1);
}

const title = slug
  .split(/[\/\-]/)
  .filter(Boolean)
  .map((s) => (s.startsWith('[') ? s : s.charAt(0).toUpperCase() + s.slice(1)))
  .join(' ');

const tmpl = readFileSync(TEMPLATE, 'utf8');
const rendered = tmpl
  .replaceAll('{{slug}}', slug)
  .replaceAll('{{title}}', title)
  .replaceAll('{{date}}', new Date().toISOString().slice(0, 10));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, rendered, 'utf8');

console.log(`✓ wrote ${outFile.replace(`${REPO_ROOT}/`, '')}`);
console.log('  Next: compose L3 blocks. Run `pnpm arch:check` before committing.');
