#!/usr/bin/env node
/**
 * gen-bp-uat-coverage.mjs — Auto-generates the `Spec` and `Smoke Overlap`
 * columns of `docs/02-business-processes/uat/registry.md`.
 *
 * Solves ISS-UAT-COV-001's drift problem: the manual maintenance of
 * "which BP-UAT has a Playwright spec" / "which smoke specs cover which
 * BP-UAT" is error-prone and out of sync with reality within a week.
 *
 * Usage:
 *   node scripts/gen-bp-uat-coverage.mjs            # dry-run; prints the
 *                                                  # new table to stdout
 *   node scripts/gen-bp-uat-coverage.mjs --write   # rewrites registry.md
 *                                                  # in place (idempotent)
 *
 * Mapping logic:
 *   BP-UAT → Spec     :: apps/e2e/tests/uat/BP-UAT-NNN*.spec.ts exists?
 *                        yes → Spec = "BP-UAT-NNN.spec.ts"
 *                        no  → Spec = "—" (no Playwright spec authored yet)
 *
 *   BP-UAT → Smoke    :: apps/e2e/tests/smoke-*.spec.ts files matching the
 *                        script's domain (event, member, cron, etc.).
 *                        Heuristic: file name's "topic word" overlaps with
 *                        the script's `process_ref` filename. Conservative —
 *                        empty when no obvious link. Operators edit the
 *                        registry's existing human notes to clarify.
 *
 * The script keeps the original table header. It only rewrites the rows
 * BETWEEN the `Scripts` heading and the `Status legend` heading.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs/02-business-processes/uat/registry.md');
const E2E_TESTS_DIR = path.join(REPO_ROOT, 'apps/e2e/tests');
const UAT_TESTS_DIR = path.join(E2E_TESTS_DIR, 'uat');

// ─── Named constants (AGENTS.md §1.3) ──────────────────────────────────────

// Matches both the original 7-column header and the post-PR 9-column header
// (Spec + Smoke Overlap added by this workflow). Self-detection is what makes
// the script idempotent on re-runs.
const REGION_TABLE_HEADER_RE = /^\| Code \| Name \| Process Ref \| Status \| Last Run \| Run Status \| Open Issues (\| Spec \| Smoke Overlap \|)?$/;
const REGION_TABLE_DIVIDER_RE = /^\|---/;
const REGION_TABLE_SCRIPTS_HEADING_RE = /^## Scripts$/;
const REGION_TABLE_LEGEND_HEADING_RE = /^## Status legend$/;

const TOPIC_WORDS_BY_BP_UAT = new Map([
  ['BP-UAT-000', ['environment', 'setup', 'health', 'stack']],
  ['BP-UAT-001', ['event', 'publication', 'broadcast', 'cron']],
  ['BP-UAT-002', ['event', 'workspace', 'operator']],
  ['BP-UAT-003', ['member', 'profile', 'me']],
  ['BP-UAT-004', ['cohort', 'operator']],
  ['BP-UAT-005', ['announce', 'operator']],
  ['BP-UAT-006', ['csat', 'event', 'feedback']],
  ['BP-UAT-007', ['reminder', 'event', 'cron']],
  ['BP-UAT-008', ['speaker', 'brief', 'event', 'cron']],
  ['BP-UAT-009', ['auth', 'signin', 'signout', 'me', 'auth-gates']],
  ['BP-UAT-010', ['event-regen-social', 'event-share', 'event-matches', 'landing', 'public']],
  ['BP-UAT-011', ['event', 'qr', 'checkin', 'reminders']],
  ['BP-UAT-012', ['event-matches', 'points', 'leaderboard']],
  ['BP-UAT-013', ['onboarding', 'lead', 'public']],
  ['BP-UAT-014', ['event', 'registration', 'waitlist']],
  ['BP-UAT-015', ['event', 'cancellation']],
  ['BP-UAT-016', ['referrals', 'member']],
  ['BP-UAT-017', ['event-matches', 'match', 'cron']],
  ['BP-UAT-018', ['lead-nurture', 'leads', 'cron']],
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function listUatSpecs() {
  if (!existsSync(UAT_TESTS_DIR)) return [];
  return readdirSync(UAT_TESTS_DIR).filter(f => f.endsWith('.spec.ts'));
}

function listSmokeSpecs() {
  if (!existsSync(E2E_TESTS_DIR)) return [];
  return readdirSync(E2E_TESTS_DIR).filter(f => f.startsWith('smoke-') && f.endsWith('.spec.ts'));
}

function findUatSpecFor(bpCode, specs) {
  // BP-UAT-010 → matches "BP-UAT-010.spec.ts", "BP-UAT-010-signup.spec.ts", etc.
  // BP-UAT-013 → matches "BP-UAT-013-signup.spec.ts" (yes — file name starts with BP-UAT-013).
  const prefix = `${bpCode}`;
  for (const spec of specs) {
    if (spec === `${prefix}.spec.ts`) return spec;
    if (spec.startsWith(`${prefix}-`) || spec.startsWith(`${prefix}_`)) return spec;
  }
  return null;
}

function findSmokeOverlap(bpCode, smokeSpecs) {
  const topicWords = TOPIC_WORDS_BY_BP_UAT.get(bpCode) ?? [];
  const matched = smokeSpecs.filter(spec => {
    const lower = spec.toLowerCase();
    return topicWords.some(word => lower.includes(word));
  });
  if (matched.length === 0) return '—';
  if (matched.length <= 3) return matched.map(s => `<br>${s}`).join('');
  return `<br>${matched.slice(0, 3).join('<br>')}<br>+${matched.length - 3} more`;
}

async function regenerate() {
  const original = await readFile(REGISTRY_PATH, 'utf8');
  const lines = original.split('\n');

  const uatSpecs = listUatSpecs();
  const smokeSpecs = listSmokeSpecs();

  // Detect table header line and the exact bpCode column width.
  const headerIdx = lines.findIndex(l => REGION_TABLE_HEADER_RE.test(l));
  if (headerIdx === -1) {
    throw new Error(`registry header not found in ${REGISTRY_PATH}. Expected: "| Code | Name | Process Ref | ..."`);
  }
  const legendIdx = lines.findIndex((l, i) => i > headerIdx && REGION_TABLE_LEGEND_HEADING_RE.test(l));
  if (legendIdx === -1) {
    throw new Error('registry "## Status legend" heading not found; cannot determine table bounds.');
  }
  const scriptsHeadingIdx = lines.findIndex((l, i) => i < headerIdx && REGION_TABLE_SCRIPTS_HEADING_RE.test(l));

  // Build new column header + divider.
  const newHeader = '| Code | Name | Process Ref | Status | Last Run | Run Status | Open Issues | Spec | Smoke Overlap |';
  const newDivider = '|---|---|---|---|---|---|---|---|---|---|';

  // Rewrite rows: preserve first 7 cells, append 2 new cells.
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === headerIdx) {
      newLines.push(newHeader);
      continue;
    }
    if (i === headerIdx + 1 && REGION_TABLE_DIVIDER_RE.test(line)) {
      newLines.push(newDivider);
      continue;
    }
    if (i > headerIdx + 1 && i < legendIdx) {
      // Body row. The first cell is a markdown link like
      // `[BP-UAT-009](BP-UAT-009.md)`. Insert two new cells before the trailing
      // `|` of the row. If the row already has 9 cells (the post-PR header
      // shape), overwrite the last two rather than appending.
      const m9 = line.match(/^(\| \[BP-UAT-\d+\]\(BP-UAT-\d+\.md\) .*?) \| .* \| .*\|$/);
      const m7 = line.match(/^(\| \[BP-UAT-\d+\]\(BP-UAT-\d+\.md\) .*?)(\|\s*)$/);
      if (m9) {
        // Already 9-cell row; replace last two cells.
        const rowPrefix = m9[1]; // ends with one trailing space after Open Issues cell
        const bpCodeMatch = rowPrefix.match(/\| \[(BP-UAT-\d+)\]/);
        const bpCode = bpCodeMatch[1];
        const spec = findUatSpecFor(bpCode, uatSpecs);
        const overlap = findSmokeOverlap(bpCode, smokeSpecs);
        const specCell = spec ? `[${spec}](../../../../apps/e2e/tests/uat/${spec})` : '—';
        newLines.push(`${rowPrefix} | ${specCell} | ${overlap} |`);
        continue;
      }
      if (m7) {
        // Original 7-cell row; append the two new cells.
        const rowPrefix = m7[1]; // without the trailing `|`
        const bpCodeMatch = rowPrefix.match(/\| \[(BP-UAT-\d+)\]/);
        const bpCode = bpCodeMatch[1];
        const spec = findUatSpecFor(bpCode, uatSpecs);
        const overlap = findSmokeOverlap(bpCode, smokeSpecs);
        const specCell = spec ? `[${spec}](../../../../apps/e2e/tests/uat/${spec})` : '—';
        newLines.push(`${rowPrefix} | ${specCell} | ${overlap} |`);
        continue;
      }
      // Header decoration row (---) — keep as is.
      newLines.push(line);
      continue;
    }
    newLines.push(line);
  }

  const newContent = newLines.join('\n');
  return { newContent, uatSpecs, smokeSpecs, headerIdx, legendIdx, scriptsHeadingIdx };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isWrite = args.includes('--write');

const result = await regenerate();

if (isWrite) {
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(REGISTRY_PATH, result.newContent, 'utf8');
  console.log(`UAT specs found: ${result.uatSpecs.length}`);
  for (const s of result.uatSpecs) console.log(`  - ${s}`);
  console.log(`Smoke specs found: ${result.smokeSpecs.length}`);
  console.log(`registry.md updated: ${REGISTRY_PATH}`);
} else {
  // Dry-run: print the new table-region only.
  const lines = result.newContent.split('\n');
  for (let i = Math.max(0, result.headerIdx - 1); i <= Math.min(lines.length - 1, result.legendIdx + 1); i++) {
    console.log(lines[i]);
  }
  console.log('\n(dry-run; pass --write to overwrite registry.md)');
}
