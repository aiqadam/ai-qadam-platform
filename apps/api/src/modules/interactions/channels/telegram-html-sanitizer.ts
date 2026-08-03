// Telegram-safe HTML allowlist sanitizer — FR-NTF-004 §3.
//
// Scope (deliberate, not a shortcut): this is a regex-based allowlist tag
// STRIPPER, not a full HTML parser. It exists only to guarantee that text
// reaching Telegram's `parse_mode: 'HTML'` sendMessage call never contains
// a tag outside Telegram's supported subset: <b> <i> <u> <s> <a> <code>
// <pre>. Disallowed tags are removed entirely (both the opening and
// closing tag), preserving the text content that was between them — they
// are not escaped-and-displayed, and a disallowed tag never causes this
// function to throw/reject.
//
// What this function is explicitly NOT responsible for: escaping
// user-controlled data (event titles, member names) that a caller
// interpolates into its own HTML string before calling
// `TelegramAdapter.send()`. That's each caller's job — see
// `event-reminders.service.ts`'s `escapeHtml()` for the established
// pattern (HTML-escape the raw value, THEN wrap it in an allowlisted
// tag). Escaping user data is a distinct concern from stripping
// disallowed tags from an already-otherwise-safe template string, and
// conflating the two here would let a malicious event title's own
// allowlisted-tag-shaped text (e.g. a title containing literal `<a
// href="...">`) survive the strip and inject unintended markup. This
// sanitizer only ever removes tags; it never adds `&amp;`/`&lt;`/`&gt;`
// escaping of its own, so it must not be relied on as a substitute for
// the caller's own escaping step.
//
// Why regex, not a parser: FR-NTF-004 §3 explicitly asks for a small
// allowlist strip, not a new HTML-parser dependency — a fixed 7-tag set
// is well within what a couple of regexes can handle safely.

const ALLOWED_TAGS = ['b', 'i', 'u', 's', 'a', 'code', 'pre'] as const;
type AllowedTag = (typeof ALLOWED_TAGS)[number];

// Matches any HTML-ish tag: `<tagname ...>` or `</tagname>` or a
// self-closing `<tagname .../>`. Tag name capture is case-insensitive so
// `<B>`/`<Script>` variants are recognized identically to their lowercase
// forms — Telegram's own parser is case-sensitive on tag names (only
// lowercase is valid HTML there), but our job here is to decide
// allow/strip, not to validate casing semantics.
const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

function isAllowedTag(name: string): name is AllowedTag {
  return (ALLOWED_TAGS as readonly string[]).includes(name.toLowerCase());
}

interface TagMatch {
  raw: string;
  name: string;
  allowed: boolean;
  isClosing: boolean;
  isSelfClosing: boolean;
  start: number;
  end: number;
}

function toTagMatches(text: string): TagMatch[] {
  return Array.from(text.matchAll(TAG_PATTERN)).map((match) => {
    const raw = match[0];
    const name = (match[1] ?? '').toLowerCase();
    return {
      raw,
      name,
      allowed: isAllowedTag(name),
      isClosing: raw.startsWith('</'),
      isSelfClosing: raw.endsWith('/>'),
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
    };
  });
}

// Walks ONLY the allowlisted tags with a single shared stack (not
// per-tag-name) so true cross-nesting — e.g. <b>bold <i>text</b></i> — is
// caught: closing </b> while <i> is the innermost open tag is invalid
// HTML nesting, even though each tag name is individually "balanced" in
// count. Returns the set of tags to strip: every disallowed tag, plus
// any allowlisted tag involved in an unmatched/cross-nested pairing.
function findTagsToStrip(tags: TagMatch[]): Set<TagMatch> {
  const stack: TagMatch[] = [];
  const stripSet = new Set<TagMatch>();

  for (const tag of tags) {
    if (!tag.allowed) {
      stripSet.add(tag);
      continue;
    }
    if (tag.isSelfClosing) continue; // no pairing needed
    if (!tag.isClosing) {
      stack.push(tag);
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && top.name === tag.name) {
      stack.pop();
      continue;
    }
    // Mismatch: search deeper in the stack for a same-name opener.
    let openerDepth = -1;
    for (let d = stack.length - 1; d >= 0; d--) {
      if (stack[d]?.name === tag.name) {
        openerDepth = d;
        break;
      }
    }
    if (openerDepth === -1) {
      // No opener at all anywhere on the stack — stray closing tag.
      stripSet.add(tag);
    } else {
      // Cross-nested: everything from openerDepth to top of stack (plus
      // this closing tag) is part of the malformed span — strip all of
      // it, then pop back to below the opener.
      for (let d = stack.length - 1; d >= openerDepth; d--) {
        const entry = stack[d];
        if (entry) stripSet.add(entry);
      }
      stripSet.add(tag);
      stack.length = openerDepth;
    }
  }
  // Anything left open at the end of the string never got a matching
  // close — strip those too.
  for (const unclosed of stack) {
    stripSet.add(unclosed);
  }
  return stripSet;
}

function rebuildWithout(text: string, tags: TagMatch[], stripSet: Set<TagMatch>): string {
  let result = '';
  let lastIndex = 0;
  for (const tag of tags) {
    result += text.slice(lastIndex, tag.start);
    lastIndex = tag.end;
    if (!stripSet.has(tag)) {
      result += tag.raw;
    }
  }
  result += text.slice(lastIndex);
  return result;
}

/**
 * Strips any HTML tag outside Telegram's supported allowlist
 * (`<b> <i> <u> <s> <a> <code> <pre>`) from `text`, preserving the text
 * content that was between stripped tags. Allowlisted tags (any case
 * variant, e.g. `<B>`) are passed through unchanged — including their
 * original casing and attributes — unless doing so would leave
 * malformed/unbalanced nesting (an unmatched open/close, or two
 * allowlisted tags overlapping instead of nesting, e.g.
 * `<b>bold <i>text</b></i>`), in which case every tag instance involved
 * in that imbalance is stripped instead of shipping something Telegram's
 * strict HTML parser could reject outright (see module docstring).
 */
export function sanitizeTelegramHtml(text: string): string {
  const tags = toTagMatches(text);
  const stripSet = findTagsToStrip(tags);
  return rebuildWithout(text, tags, stripSet);
}
