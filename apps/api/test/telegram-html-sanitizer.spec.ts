import { describe, expect, it } from 'vitest';
import { buildReminderPayload } from '../src/modules/workspace/event-reminders.service';
import { sanitizeTelegramHtml } from '../src/modules/interactions/channels/telegram-html-sanitizer';

// FR-NTF-004 §3 — Telegram-safe HTML allowlist sanitizer. Pure function,
// zero dependencies: no Testcontainers, no mocks, no DI. See the module
// docstring in telegram-html-sanitizer.ts for the stack-based cross-nesting
// algorithm this file exercises most carefully.

describe('sanitizeTelegramHtml — allowlisted tags preserved individually', () => {
  it('preserves <b>x</b> unchanged', () => {
    const input = '<b>x</b>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<b>x</b>');
  });

  it('preserves <i>x</i> unchanged', () => {
    const input = '<i>x</i>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<i>x</i>');
  });

  it('preserves <u>x</u> unchanged', () => {
    const input = '<u>x</u>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<u>x</u>');
  });

  it('preserves <s>x</s> unchanged', () => {
    const input = '<s>x</s>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<s>x</s>');
  });

  it('preserves <a href="...">x</a> unchanged, including the href attribute', () => {
    const input = '<a href="https://aiqadam.org/events/abc">x</a>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<a href="https://aiqadam.org/events/abc">x</a>');
  });

  it('preserves <code>x</code> unchanged', () => {
    const input = '<code>x</code>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<code>x</code>');
  });

  it('preserves <pre>x</pre> unchanged', () => {
    const input = '<pre>x</pre>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<pre>x</pre>');
  });
});

describe('sanitizeTelegramHtml — nested/combined allowlisted tags', () => {
  it('preserves 2-deep proper nesting <b><i>x</i></b>', () => {
    const input = '<b><i>x</i></b>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<b><i>x</i></b>');
  });

  it('preserves 3-deep proper nesting <b><i><u>x</u></i></b>', () => {
    const input = '<b><i><u>x</u></i></b>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<b><i><u>x</u></i></b>');
  });

  it('preserves a link wrapping bold text <a href="...">​<b>x</b></a>', () => {
    const input = '<a href="https://aiqadam.org">​<b>x</b></a>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe(input);
  });

  it('preserves sibling (non-nested) allowlisted tags in sequence', () => {
    const input = '<b>x</b> and <i>y</i>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<b>x</b> and <i>y</i>');
  });
});

describe('sanitizeTelegramHtml — disallowed tags stripped, content preserved', () => {
  it('strips <script> tags but preserves the inner text content', () => {
    const input = '<script>alert(1)</script>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('alert(1)');
  });

  it('strips <div> tags but preserves the inner text content', () => {
    const input = '<div>x</div>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('x');
  });

  it('strips a self-closing <img> tag cleanly with no dangling artifact', () => {
    const input = 'before <img src="x"> after';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('before  after');
  });

  it('strips case-insensitive variants identically to their lowercase form', () => {
    const upper = sanitizeTelegramHtml('<SCRIPT>x</SCRIPT>');
    const mixed = sanitizeTelegramHtml('<ScRiPt>x</script>');
    const upperDiv = sanitizeTelegramHtml('<DIV>x</DIV>');

    expect(upper).toBe('x');
    expect(mixed).toBe('x');
    expect(upperDiv).toBe('x');
  });
});

describe('sanitizeTelegramHtml — self-closing tags', () => {
  it('strips a disallowed self-closing tag <br/> cleanly, no leftover slash', () => {
    const input = 'line one <br/> line two';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('line one  line two');
  });

  it('strips a disallowed self-closing tag with attributes <img src="x"/> cleanly', () => {
    const input = 'before <img src="x"/> after';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('before  after');
  });
});

describe('sanitizeTelegramHtml — cross-nested malformed pairs (docstring example)', () => {
  it('strips BOTH tag pairs for the exact module-docstring example <b>bold <i>text</b></i>', () => {
    // Trace (per telegram-html-sanitizer.ts's findTagsToStrip):
    //   <b> open  -> stack=[b]
    //   <i> open  -> stack=[b,i]
    //   </b> close, top is <i> (mismatch) -> search deeper, finds <b> at
    //     depth 0 -> cross-nested: strip <i> and <b> (depth 0..top), strip
    //     this </b> too, truncate stack to depth 0 (now empty)
    //   </i> close, stack is now empty -> no opener anywhere -> stray,
    //     strip this </i> too
    // Net: all four tags stripped, only the plain text content survives.
    const input = '<b>bold <i>text</b></i>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('bold text');
  });
});

describe('sanitizeTelegramHtml — stray/unmatched closing tag', () => {
  it('strips only the stray closer, leaving the earlier well-formed pair unaffected', () => {
    const input = '<b>x</b></b>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('<b>x</b>');
  });
});

describe('sanitizeTelegramHtml — unclosed tag at end of string', () => {
  it('strips an opening tag left open with no closing tag before the string ends', () => {
    const input = '<b>bold text';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('bold text');
  });

  it('strips only the unclosed tag when a later, different tag closes properly', () => {
    const input = '<b>bold <i>italic</i>';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('bold <i>italic</i>');
  });
});

describe('sanitizeTelegramHtml — degenerate inputs', () => {
  it('returns an empty string unchanged', () => {
    const input = '';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('');
  });

  it('returns a string with no tags at all byte-identical (true no-op)', () => {
    const input = 'plain text, no markup here.';

    const result = sanitizeTelegramHtml(input);

    expect(result).toBe('plain text, no markup here.');
  });
});

describe('sanitizeTelegramHtml — AC-4 regression: real reminder body passthrough', () => {
  // buildReminderPayload() is the exported entry point; its 'telegram'
  // channel branch returns { text, ... } where `text` is the real output
  // of the module-private telegramHtmlBody() (which itself calls the
  // module-private escapeHtml() first). Using the real exported function's
  // output — not a hand-typed approximation — per the test strategy's
  // explicit instruction. The title fixture below deliberately includes
  // '&' and '<'/'>' so the escape-then-sanitize interaction is visible: by
  // the time sanitizeTelegramHtml() sees the string, any '<'/'>' from the
  // title has already been entity-escaped to '&lt;'/'&gt;' and cannot be
  // mistaken for a real tag.
  const EVENT = {
    id: 'evt-ac4',
    title: 'AI & Data: <intro>',
    starts_at: '2026-09-01T18:00:00.000Z',
    ends_at: '2026-09-01T20:00:00.000Z',
    location: 'Tashkent',
    country: 'uz',
  };

  const KINDS = ['reminder_day_before', 'reminder_hour_before', 'reminder_morning_of'] as const;

  it.each(KINDS)('is a byte-identical no-op for buildReminderPayload(..., %s, telegram).text', (kind) => {
    const payload = buildReminderPayload(EVENT, kind, 'telegram');
    const text = payload.text as string;

    const result = sanitizeTelegramHtml(text);

    expect(result).toBe(text);
    // Sanity: confirms the escaped title actually made it into this text,
    // so the assertion above isn't vacuously true against an empty/no-tag
    // string.
    expect(text).toContain('AI &amp; Data: &lt;intro&gt;');
  });
});
