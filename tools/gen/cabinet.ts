// tools/gen/cabinet.ts — scaffold a new operator cabinet under
// apps/web-next/src/pages/workspace/<slug>/index.astro from the
// cabinet template.
//
// Usage:
//   pnpm gen:cabinet <slug>
//
// The output carries the `@generated-from gen:cabinet` marker
// required by tools/architecture-check.ts (Lock #3, ADR-0038).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const TEMPLATE = join(REPO_ROOT, 'tools', 'gen', 'templates', 'cabinet.astro.tmpl');
const WORKSPACE_DIR = join(REPO_ROOT, 'apps', 'web-next', 'src', 'pages', 'workspace');

const slugRaw = process.argv[2];

if (!slugRaw) {
  console.error('Usage: pnpm gen:cabinet <slug>');
  console.error('  slug = kebab-case cabinet name, e.g. "members" or "events/list"');
  process.exit(2);
}

const slug = slugRaw.replace(/^\/+|\/+$/g, '');
if (!/^[a-z0-9_\-/]+$/i.test(slug)) {
  console.error(`Invalid slug: ${slug}`);
  console.error('Allowed: letters, digits, _, -, /');
  process.exit(2);
}

const outFile = join(WORKSPACE_DIR, slug, 'index.astro');
if (existsSync(outFile)) {
  console.error(`Refusing to overwrite existing file: ${outFile}`);
  process.exit(1);
}

const title = slug
  .split(/[\/\-]/)
  .filter(Boolean)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join(' ');

const tmpl = readFileSync(TEMPLATE, 'utf8');
const rendered = tmpl
  .replaceAll('{{slug}}', slug)
  .replaceAll('{{title}}', title)
  .replaceAll('{{date}}', new Date().toISOString().slice(0, 10));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, rendered, 'utf8');

// biome-ignore lint/suspicious/noConsoleLog: intentional CLI output
console.log(`✓ wrote ${outFile.replace(`${REPO_ROOT}/`, '')}`);
// biome-ignore lint/suspicious/noConsoleLog: intentional CLI output
console.log('  Next: compose L3 workspace blocks. Run `pnpm arch:check` before committing.');
