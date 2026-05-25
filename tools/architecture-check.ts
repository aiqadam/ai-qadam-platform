#!/usr/bin/env -S node --experimental-strip-types
// tools/architecture-check.ts — ADR-0038 enforcement.
//
// Hard-fails on architectural violations under apps/web-next/.
// apps/web/** is grandfathered (no checks) until cutover (see ADR-0038
// §Migration period grandfathering).
//
// Run modes:
//   pnpm arch:check            — scan everything under apps/web-next/
//   pnpm arch:check --staged   — scan only files staged for commit
//
// Spec → docs/architecture/web-next-kickoff.md and ADR-0038 §Locks.
// Zero runtime dependencies on purpose: this must run in pre-commit
// in ~2s, no install step required.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

type Violation = { file: string; line: number; rule: string; message: string };

const REPO_ROOT = (() => {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
})();

const WEB_NEXT_ROOT = join(REPO_ROOT, 'apps', 'web-next');
const BLOCKS_CATALOGUE = join(REPO_ROOT, 'docs', 'architecture', 'blocks.md');
const WIRING_MAP = join(REPO_ROOT, 'docs', 'architecture', 'wiring-map.md');

const STAGED_MODE = process.argv.includes('--staged');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function listStagedFiles(): string[] {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function listAllFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const acc: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.astro' || name === 'dist' || name === '.turbo') {
        continue;
      }
      const full = join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(full);
      } else if (s.isFile()) {
        acc.push(relative(REPO_ROOT, full));
      }
    }
  }
  return acc;
}

function listStagedNewFiles(): Set<string> {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=A', {
      encoding: 'utf8',
    });
    return new Set(out.split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Path matchers
// ---------------------------------------------------------------------------

const POSIX = (p: string) => p.split(sep).join('/');

function inWebNext(file: string): boolean {
  return POSIX(file).startsWith('apps/web-next/');
}
function inWebNextBlocksOrPages(file: string): boolean {
  const p = POSIX(file);
  return p.startsWith('apps/web-next/src/blocks/') || p.startsWith('apps/web-next/src/pages/');
}
function inWebNextPages(file: string): boolean {
  return POSIX(file).startsWith('apps/web-next/src/pages/');
}
function inWebNextBlocks(file: string): boolean {
  return POSIX(file).startsWith('apps/web-next/src/blocks/');
}
function inWebNextComponents(file: string): boolean {
  return POSIX(file).startsWith('apps/web-next/src/components/');
}

const SOURCE_EXT = /\.(astro|tsx|ts|jsx|js)$/;

// ---------------------------------------------------------------------------
// Per-file rules
// ---------------------------------------------------------------------------

function readFileSafe(file: string): string | null {
  const abs = join(REPO_ROOT, file);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function checkFile(file: string, violations: Violation[]): void {
  if (!SOURCE_EXT.test(file)) return;
  if (!inWebNext(file)) return; // grandfathered: apps/web/, etc.

  // Lock 3: components/ is deprecated under web-next.
  if (inWebNextComponents(file)) {
    violations.push({
      file,
      line: 1,
      rule: 'no-components-dir',
      message:
        'apps/web-next/src/components/ is deprecated. Move to src/blocks/ (L3) or src/kit/ (L2). See ADR-0038 §Locks #2.',
    });
  }

  if (!inWebNextBlocksOrPages(file)) return;

  const content = readFileSafe(file);
  if (content === null) return;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;

    // Skip comments (best-effort: line-leading // or *)
    const trimmed = line.trimStart();
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*');

    // Lock 1a: blocks/pages must not import lib/api-* (use L1 hooks instead).
    if (!isComment && /from\s+['"][^'"]*\/lib\/api-[^'"]*['"]/.test(line)) {
      // Pages may import L1 query hooks; blocks may not.
      if (inWebNextBlocks(file)) {
        violations.push({
          file,
          line: lineNo,
          rule: 'no-api-import-in-blocks',
          message:
            'Blocks must receive data via props. Move the fetch to a page-level L1 hook. See ADR-0038 §Locks #1.',
        });
      }
    }

    // Lock 1b: no raw fetch('/api/...') outside lib/.
    if (!isComment && /\bfetch\(\s*['"`]\/api\//.test(line)) {
      violations.push({
        file,
        line: lineNo,
        rule: 'no-raw-fetch',
        message:
          'Raw fetch() to /api is forbidden in blocks/pages. Use apiClient or a useQuery() hook from src/lib/. See ADR-0038 §Locks #2.',
      });
    }

    // Lock 1c: no inline style={ or style=" in blocks/pages.
    if (!isComment && /\sstyle=(\{|")/.test(line)) {
      violations.push({
        file,
        line: lineNo,
        rule: 'no-inline-style',
        message:
          'Inline style= is forbidden in blocks/pages. Use design-system tokens via L2 atoms. See ADR-0038 §Locks #2.',
      });
    }
  }

  // Lock 2: files under src/pages/ must carry the generator marker.
  // In --staged mode this fires only for newly added files (grandfathering
  // any legacy page if one ever lands without going through the generator).
  // In full mode it fires for every page lacking the marker — apps/web-next/
  // is greenfield, so every page should originate from the generator.
  if (inWebNextPages(file)) {
    const requiresMarker = STAGED_MODE ? newFiles.has(file) : true;
    const hasMarker = /@generated-from\s+gen:(page|cabinet)/.test(content);
    if (requiresMarker && !hasMarker) {
      violations.push({
        file,
        line: 1,
        rule: 'page-not-from-generator',
        message:
          'Pages must be created via `pnpm gen:page` or `pnpm gen:cabinet`. The generator emits a `// @generated-from gen:page` header. See ADR-0038 §Locks #3.',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-file rules
// ---------------------------------------------------------------------------

function checkCatalogueCoherence(staged: string[], violations: Violation[]): void {
  // Lock 4: edits/adds under blocks/ require an edit to docs/architecture/blocks.md.
  const touchedBlocks = staged.filter((f) => inWebNextBlocks(f) && SOURCE_EXT.test(f));
  if (touchedBlocks.length === 0) return;
  const catalogueRel = relative(REPO_ROOT, BLOCKS_CATALOGUE);
  if (!staged.includes(catalogueRel)) {
    violations.push({
      file: touchedBlocks[0] ?? 'apps/web-next/src/blocks/',
      line: 1,
      rule: 'block-catalogue-stale',
      message: `Edited ${touchedBlocks.length} block file(s) under apps/web-next/src/blocks/ but did not update ${catalogueRel}. Every block change must update the catalogue. See ADR-0038 §Locks #4.`,
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const newFiles: Set<string> = STAGED_MODE ? listStagedNewFiles() : new Set();
const violations: Violation[] = [];

const filesToCheck = STAGED_MODE ? listStagedFiles() : listAllFiles(WEB_NEXT_ROOT);

for (const file of filesToCheck) {
  checkFile(file, violations);
}

if (STAGED_MODE) {
  checkCatalogueCoherence(filesToCheck, violations);
}

if (violations.length === 0) {
  console.log(
    `✓ arch:check passed (${filesToCheck.length} file(s) scanned, mode=${STAGED_MODE ? 'staged' : 'full'}).`,
  );
  // Reference touched docs to satisfy --noUnusedLocals in strict mode.
  void WIRING_MAP;
  process.exit(0);
}

console.error(`✗ arch:check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(`    ${v.message}\n`);
}
console.error(
  'See docs/adr/0038-web-4-layer-architecture.md and docs/architecture/web-next-kickoff.md for the full lock spec.',
);
process.exit(1);
