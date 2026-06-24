#!/usr/bin/env node
// scripts/voice-lint.mjs — flags voice/tone anti-patterns from
// docs/04-development/design-system/ux-and-content-guidelines.md §1 against ADDED lines on the
// current diff vs origin/main (not the whole file). This keeps the
// lint useful for new code without forcing a one-shot cleanup PR
// for the existing codebase.
//
// Exit code:
//   0 = no findings (or no relevant files in the diff)
//   1 = findings found
//
// Surfaces lints in CI annotation format so violations appear inline
// on the PR. Run locally with:
//   pnpm voice-lint
//
// Patterns are derived from docs/04-development/design-system/ux-and-content-guidelines.md §1
// (Voice & tone principles). When the doc adds a new anti-pattern,
// add it here too — keep the two in sync.

import { execSync } from 'node:child_process';
import process from 'node:process';

// Files we care about — user-visible string content.
const USER_VISIBLE_GLOBS = [
  'apps/web/src/**/*.astro',
  'apps/web/src/**/*.tsx',
  'apps/web/src/**/*.ts',
  'apps/api/src/modules/email/templates/**/*.{ts,html}',
  'apps/api/src/modules/interactions/**/*.{ts,html}',
];

// Each pattern: regex (case-insensitive unless `iCase: false`) + label +
// preferred-alternative pointer. Order matters only for human readability.
const PATTERNS = [
  { id: 'hey-there', re: /\bhey\s+there\b/i, hint: 'Use "Welcome." or no greeting (UX §1.1).' },
  {
    id: 'click-here',
    re: /click\s+here/i,
    hint: 'Use a verb-led CTA: "Open profile", "Register", etc. (UX §1.2 / §1.3).',
  },
  {
    id: 'oops',
    re: /\boops\b/i,
    hint: 'Use a specific error message + recovery action (UX §1.1).',
  },
  {
    id: 'awesome-exclaim',
    re: /\bawesome\b/i,
    hint: 'Drop hype words; state the outcome directly (UX §1.1).',
  },
  {
    id: 'hop-on',
    re: /\bhop\s+(?:on|over)\b/i,
    hint: 'Use the bare verb ("Open", "Go to") (UX §1.1).',
  },
  {
    id: 'pretty-please',
    re: /pretty\s+please/i,
    hint: 'Drop the begging tone; explain the value of the action (UX §1.1).',
  },
  {
    id: 'are-you-sure',
    re: /are\s+you\s+sure\??/i,
    hint: 'Confirm with a specific irreversible action label, e.g. "Cancel registration" (UX §13).',
  },
  {
    id: 'team-will',
    re: /our\s+team\s+(?:will|may|can)\b/i,
    hint: 'Name the person: "Binali or Viktor will get back to you" (UX §1.2).',
  },
  {
    id: 'system-cancelled',
    re: /the\s+system\s+(?:has|will)\b/i,
    hint: 'Use second-person agency: "You cancelled" / "We cancelled" (UX §1.2).',
  },
  {
    id: 'multi-exclaim',
    re: /!{2,}|!\?/,
    iCase: false,
    hint: 'Single punctuation; voice §1.1 prefers calm confidence.',
  },
  // Emoji density check is structural, not regex-pattern — handled inline below.
];

function inDiffMode() {
  // CI sets GITHUB_BASE_REF (e.g. "main") on PR runs. Local devs default to origin/main.
  return Boolean(process.env.GITHUB_BASE_REF) || !process.env.VOICE_LINT_FULL_SCAN;
}

function getDiffAddedLines() {
  const base = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/main';
  const args = [
    'diff',
    '--diff-filter=AM',
    '--unified=0',
    `${base}...HEAD`,
    '--',
    ...USER_VISIBLE_GLOBS,
  ];
  let out = '';
  try {
    out = execSync(`git ${args.join(' ')}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    if (e.stdout) out = e.stdout.toString();
  }
  // Parse the unified diff. Track file + line number.
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
      // context or other; advance line counter only on diff-line types we don't track
      if (!raw.startsWith('\\')) lineNo += 1;
    }
  }
  return findings;
}

function lintLine(text) {
  const hits = [];
  for (const p of PATTERNS) {
    const re =
      p.iCase === false ? p.re : new RegExp(p.re.source, `i${p.re.flags.replace('i', '')}`);
    if (re.test(text)) hits.push({ id: p.id, hint: p.hint });
  }
  // Emoji density: > 1 emoji per 50 chars triggers.
  // eslint-disable-next-line no-misleading-character-class
  const emojiMatches = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emojiMatches.length > Math.max(1, Math.floor(text.length / 50))) {
    hits.push({
      id: 'emoji-density',
      hint: `${emojiMatches.length} emoji in ${text.length} chars; UX §1.1 + §4.1 ruleset 8 prefer minimal decoration.`,
    });
  }
  return hits;
}

function main() {
  if (!inDiffMode()) {
    console.error('voice-lint: VOICE_LINT_FULL_SCAN is set; full-scan mode not yet implemented.');
    process.exit(2);
  }
  const lines = getDiffAddedLines();
  if (lines.length === 0) {
    return;
  }
  let total = 0;
  for (const { file: _file, line: _line, text } of lines) {
    const hits = lintLine(text);
    for (const _h of hits) {
      total += 1;
    }
  }
  if (total > 0) {
    process.exit(1);
  }
}

main();
