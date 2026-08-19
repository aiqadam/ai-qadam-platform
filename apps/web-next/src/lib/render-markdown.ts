// render-markdown.ts — shared body_md -> sanitized HTML renderer.
//
// FR-CMS-007. Every content_pages / content_documents body_md field is
// rendered through this single helper so the four new pages (About,
// Rules, Rules detail, History, Partners) share one XSS-safe pipeline.
//
// welcome/[slug].astro's existing `set:html=""` binding (a literal
// empty string, never page.bodyMd — a pre-existing defect, see
// 02-impact-analysis.md) could not be reused as a working reference:
// no page in this codebase actually renders CMS markdown to HTML yet.
// This is new plumbing, not a copy of prior art.
//
// Pipeline: `marked` (CommonMark parser, new dependency — no markdown
// parser existed in this repo before FR-CMS-007) parses body_md to raw
// HTML, then `isomorphic-dompurify` (already a proven dependency, used
// by AnnounceComposer.tsx, with its own SSR-resolution regression test
// at lib/isomorphic-dompurify-resolution.test.ts) strips anything
// unsafe before the result is ever passed to `set:html`.
//
// Defense-in-depth rationale: content_pages/content_documents rows are
// editor-authored via Directus admin, not end-user-submitted, but a
// compromised or careless editor account (or a future workflow that
// opens authoring to a wider group) should not be able to inject
// <script>/onerror=/javascript: via body_md. Sanitizing is cheap and
// the content is public-facing on every page that uses it.

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Headings, paragraphs, lists, tables (Charter/MoU appendices use
// tables), emphasis, links, blockquotes — the structural elements the
// source governance documents need to reflow as-is (AC-3). No forms,
// no scripts, no iframes, no event-handler attributes.
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'strong',
  'em',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'br',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

const ALLOWED_ATTR = ['href', 'title'];

// security.md's "Input Validation" section documents this project's
// explicit allowed URL schemes for user/editor-supplied URLs: https,
// mailto, tg (Telegram deep links) — no javascript:, no data:, no
// file:, no vbscript:. DOMPurify's own default ALLOWED_URI_REGEXP
// already blocks javascript:/data:/vbscript: today (verified in the
// security review), but leaving it unset means a future
// isomorphic-dompurify upgrade could silently change that default with
// nothing in this repo to catch it. Setting it explicitly here pins
// the behavior to this project's documented policy instead of an
// implicit library default.
const ALLOWED_URI_REGEXP = /^(?:https?|mailto|tg):/i;

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Render a markdown string to sanitized HTML. Returns an empty string
 * for null/undefined/empty input so callers can render unconditionally
 * (`<div set:html={renderMarkdown(page.bodyMd)} />`) without a guard.
 */
export function renderMarkdown(bodyMd: string | null | undefined): string {
  if (!bodyMd || bodyMd.trim().length === 0) return '';
  const rawHtml = marked.parse(bodyMd, { async: false });
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Directus-authored content_pages/content_documents body_md may
    // link to external source documents or other AI Qadam pages —
    // keep href/title but drop everything else (style=, on*, etc.).
    ALLOW_DATA_ATTR: false,
    // Explicit scheme allowlist per security.md — see ALLOWED_URI_REGEXP
    // comment above. Applies to href (and any other URI-bearing
    // attribute DOMPurify checks); javascript:/data:/vbscript: and any
    // other scheme not in the allowlist are stripped.
    ALLOWED_URI_REGEXP,
  });
}
