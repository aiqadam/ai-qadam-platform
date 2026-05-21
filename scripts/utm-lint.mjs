#!/usr/bin/env node
// scripts/utm-lint.mjs — flags marketing-link URLs that violate the
// UTM scheme from docs/marketing-and-pr-playbook.md §16. Diff-only
// (added lines vs origin/main) to match the voice-lint pattern.
//
// Rules enforced (per playbook §16.4 hygiene rules):
//   1. External marketing links MUST include utm_source + utm_medium
//      + utm_campaign. Internal links (relative paths or aiqadam.org
//      domain within the codebase) are exempt — see playbook §16.4.
//   2. utm_source / utm_medium are lowercase-hyphenated (no
//      underscores in the VALUE; underscores OK in utm_content).
//   3. utm_source is non-empty; placeholders like `?utm_source=`
//      flagged.
//
// Files scanned: same user-visible globs as voice-lint, plus email
// templates + marketing copy in docs/marketing-and-pr-playbook.md
// when its links change.
//
// Exit 0 = clean; 1 = findings; 2 = unsupported mode.

import { execSync } from 'node:child_process';
import process from 'node:process';

const SCAN_GLOBS = [
  'apps/web/src/**/*.{astro,tsx,ts}',
  'apps/api/src/modules/email/templates/**/*.{ts,html,md}',
  'apps/api/src/modules/interactions/**/*.{ts,html,md}',
  'docs/marketing-and-pr-playbook.md',
];

// Domains we treat as the platform itself — links here are INTERNAL
// (per playbook §16.4 "internal links do not have UTM").
const INTERNAL_DOMAINS = [
  'aiqadam.org',
  'uz.aiqadam.org',
  'kz.aiqadam.org',
  'tj.aiqadam.org',
  'workspace.aiqadam.org',
];

// External-channel URLs that are obvious external entry points and
// SHOULD include UTM if pointing back to aiqadam.org. We detect by
// looking for `https://aiqadam.org/` (or country subdomain) in a
// string that's clearly an EMAIL / MARKETING context.
//
// Heuristic: any aiqadam.org link appearing in a string literal
// inside files matching the EMAIL/MARKETING globs is an outbound
// link that should carry UTM. Source-code internal references like
// `const url = '/api/...'` are not affected because they're relative.

const URL_RE = /https?:\/\/[\w.-]+(?:\/[^\s'"<>)\\]*)?/g;

function inDiffMode() {
  return Boolean(process.env.GITHUB_BASE_REF) || !process.env.UTM_LINT_FULL_SCAN;
}

function getDiffAddedLines() {
  const base = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/main';
  const args = ['diff', '--diff-filter=AM', '--unified=0', `${base}...HEAD`, '--', ...SCAN_GLOBS];
  let out = '';
  try {
    out = execSync(`git ${args.join(' ')}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    if (e.stdout) out = e.stdout.toString();
  }
  const findings = [];
  let currentFile = null;
  let lineNo = 0;
  for (const raw of out.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      currentFile = raw.slice(6);
      continue;
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      lineNo = m ? Number(m[1]) - 1 : 0;
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      lineNo += 1;
      findings.push({ file: currentFile, line: lineNo, text: raw.slice(1) });
    } else if (!raw.startsWith('-') && !raw.startsWith('---')) {
      if (!raw.startsWith('\\')) lineNo += 1;
    }
  }
  return findings;
}

function isInternalContext(filepath) {
  // Anchor: links in the playbook docs are explicitly EXAMPLES (the doc
  // shows UTM examples; we don't want to double-flag those). Skip docs
  // unless the diff is editing the playbook's `### 16` section directly
  // (heuristic: file is the playbook + the line contains `utm_`).
  // For source code, EVERYTHING is an "outbound marketing link"
  // candidate.
  return filepath?.endsWith('docs/marketing-and-pr-playbook.md');
}

function lintLine(filepath, text) {
  const hits = [];
  for (const url of text.match(URL_RE) ?? []) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (!INTERNAL_DOMAINS.includes(parsed.hostname)) continue;
    if (isInternalContext(filepath) && !/utm_/.test(text)) continue;
    const params = parsed.searchParams;
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');
    if (!utmSource || !utmMedium || !utmCampaign) {
      hits.push({
        id: 'utm-missing',
        url,
        hint: 'Marketing link to aiqadam.org missing utm_source+utm_medium+utm_campaign (marketing-and-pr-playbook §16.4).',
      });
      continue;
    }
    // Hygiene: lowercase, hyphenated values (utm_content can use _).
    for (const [name, value] of [
      ['utm_source', utmSource],
      ['utm_medium', utmMedium],
      ['utm_campaign', utmCampaign],
    ]) {
      if (value !== value.toLowerCase()) {
        hits.push({
          id: 'utm-case',
          url,
          hint: `${name}="${value}" must be lowercase (playbook §16.4).`,
        });
      }
      if (/_/.test(value)) {
        hits.push({
          id: 'utm-underscore',
          url,
          hint: `${name}="${value}" uses underscores; use hyphens (playbook §16.4). utm_content may use underscores; utm_source/medium/campaign may not.`,
        });
      }
    }
  }
  return hits;
}

function main() {
  if (!inDiffMode()) {
    console.error('utm-lint: UTM_LINT_FULL_SCAN is set; full-scan mode not yet implemented.');
    process.exit(2);
  }
  const lines = getDiffAddedLines();
  if (lines.length === 0) {
    console.log('utm-lint: no URL-bearing content changes on this PR. ✓');
    return;
  }
  let total = 0;
  for (const { file, line, text } of lines) {
    for (const h of lintLine(file, text)) {
      total += 1;
      console.log(`::error file=${file},line=${line},title=utm-lint:${h.id}::${h.hint}`);
      console.log(`  ${file}:${line}: ${h.url}`);
    }
  }
  if (total > 0) {
    console.log(`\nutm-lint: ${total} finding(s). See marketing-and-pr-playbook.md §16.`);
    process.exit(1);
  }
  console.log(`utm-lint: scanned ${lines.length} added line(s). ✓`);
}

main();
