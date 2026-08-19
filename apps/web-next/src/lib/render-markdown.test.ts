// render-markdown.test.ts — Unit tests for the shared body_md -> HTML
// renderer (FR-CMS-007). Exercises the REAL marked + isomorphic-dompurify
// pipeline (no mocking) so a future dependency bump that reintroduces an
// XSS gap fails here, not only as a live incident — same rationale as
// isomorphic-dompurify-resolution.test.ts's "exercise the real resolution
// path" approach.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render-markdown';

describe('renderMarkdown — empty/nullish input', () => {
  it('returns an empty string for null', () => {
    expect(renderMarkdown(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(renderMarkdown(undefined)).toBe('');
  });

  it('returns an empty string for an empty string', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(renderMarkdown('   \n\t  ')).toBe('');
  });
});

describe('renderMarkdown — structure preservation (AC-3: reflow as-is)', () => {
  it('renders headings at multiple levels', () => {
    const html = renderMarkdown('# Title\n\n## Section\n\n### Subsection');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<h3>Subsection</h3>');
  });

  it('renders paragraphs', () => {
    const html = renderMarkdown('First paragraph.\n\nSecond paragraph.');
    expect(html).toContain('<p>First paragraph.</p>');
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two\n- three');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. first\n2. second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
  });

  it('renders tables (Charter/MoU appendices use tables — RACI matrix, etc.)', () => {
    const html = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders bold and italic emphasis', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders links with href preserved', () => {
    const html = renderMarkdown('[AI Qadam](https://aiqadam.org)');
    expect(html).toContain('href="https://aiqadam.org"');
    expect(html).toContain('AI Qadam');
  });

  it('preserves Cyrillic text unmangled', () => {
    const html = renderMarkdown('## Семь принципов\n\nЧестность важнее хайпа.');
    expect(html).toContain('Семь принципов');
    expect(html).toContain('Честность важнее хайпа.');
  });
});

describe('renderMarkdown — XSS safety (defense-in-depth for editor-authored content)', () => {
  it('strips a raw <script> tag', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  it('strips an inline event-handler attribute (onerror)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips a javascript: href', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips a javascript: href on a raw HTML anchor (not markdown link syntax)', () => {
    // marked passes raw inline HTML anchors through untouched — this is
    // the realistic path for editor-pasted rich text, unlike the
    // hand-typed [text](javascript:...) markdown-link-syntax case above.
    const html = renderMarkdown('<a href="javascript:alert(1)">click</a>');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips a data: URI href', () => {
    const html = renderMarkdown(
      '<a href="data:text/html,<script>alert(1)</script>">click</a>',
    );
    expect(html.toLowerCase()).not.toContain('data:text/html');
  });

  it('strips a mixed-case and whitespace-obfuscated javascript: scheme', () => {
    const html = renderMarkdown(
      '<a href="  jaVaSCript:alert(1)">click</a>',
    );
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips disallowed tags like <iframe>', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('strips inline style attributes (design-system compliance: no raw styling from CMS content)', () => {
    const html = renderMarkdown('<p style="color:red">text</p>');
    expect(html).not.toContain('style=');
  });

  it('strips data- attributes', () => {
    const html = renderMarkdown('<p data-evil="x">text</p>');
    expect(html).not.toContain('data-evil');
  });
});
