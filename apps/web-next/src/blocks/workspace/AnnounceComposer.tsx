// L3 workspace block — <AnnounceComposer>.
//
// React island for the /workspace/announce cabinet (operator
// announcement composer). Flow: pick a saved cohort → write subject +
// body → preview → choose consent basis → send → see delivery summary.
//
// Mirrors v1's AnnounceComposer (apps/web/src/components/workspace/
// AnnounceComposer.tsx) — same API shapes, same primitives, same
// guard against zero-cohorts. The L3-block + IslandRoot pattern
// replaces v1's auth-island bootstrap.
//
// FR-MIG-011: Replaces plain <textarea> with Tiptap rich-text editor
// (bold, italic, links, inline code) and wires <ActionBar> for Preview/Send
// actions with confirmation dialog on Send.

'use client';

import { ActionBar } from '@/blocks/workspace/ActionBar';
import type { Action } from '@/blocks/workspace/ActionBar';
import { Button } from '@/kit';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { AnnouncePreview, AnnounceSent, CohortRow } from '@/lib/types';
import { type ConsentBasis, usePreviewAnnounce, useSendAnnounce } from '@/lib/use-announce';
import { useCohorts } from '@/lib/use-cohorts';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'isomorphic-dompurify';
import { common, createLowlight } from 'lowlight';
import { Bold, Code, Italic, Link2 } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// ─── Tiptap Editor Toolbar ────────────────────────────────────────────────────

interface EditorToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function EditorToolbar({ editor }: EditorToolbarProps): ReactElement | null {
  if (!editor) return null;

  const setLink = useCallback(() => {
    const linkAttrs = editor.getAttributes('link') as { href?: string };
    const previousUrl = linkAttrs.href;
    const url = window.prompt('URL', previousUrl ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-1 border border-input rounded-md bg-muted/50 p-1 mb-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'bg-muted' : ''}
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'bg-muted' : ''}
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={setLink}
        className={editor.isActive('link') ? 'bg-muted' : ''}
        aria-label="Insert link"
      >
        <Link2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().chain().focus().toggleCode().run()}
        className={editor.isActive('code') ? 'bg-muted' : ''}
        aria-label="Inline code"
      >
        <Code className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Tiptap Editor ───────────────────────────────────────────────────────────

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function TiptapEditor({ content, onChange, placeholder }: TiptapEditorProps): ReactElement {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable code block from StarterKit - using CodeBlockLowlight instead
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert focus:outline-none min-h-[120px] max-w-none px-3 py-2',
        'data-placeholder': placeholder ?? 'Write your message...',
      },
    },
  });

  return (
    <div className="border border-input rounded-md bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <EditorToolbar editor={editor} />
      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--muted-foreground);
          pointer-events: none;
          height: 0;
        }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Preview Card ────────────────────────────────────────────────────────────

interface PreviewCardProps {
  preview: AnnouncePreview;
}

function PreviewCard({ preview }: PreviewCardProps): ReactElement {
  return (
    <section className="space-y-2 rounded-md border border-border bg-card p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0">
        Preview
      </h2>
      <p className="text-sm text-foreground">
        <span className="font-medium">{preview.cohortName}</span> ·{' '}
        <span className="font-mono">{preview.estimatedRecipients.toLocaleString()} recipients</span>
        {preview.truncated ? (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-amber-500">
            truncated
          </span>
        ) : null}
      </p>
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Subject
        </div>
        <div className="text-sm text-foreground">{preview.subject}</div>
      </div>
      <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Body
        </div>
        {/* preview.text is plain-text + minimal HTML escaped by the API
            — render in a pre block so whitespace is preserved without
            opening up XSS via dangerouslySetInnerHTML. */}
        <pre className="m-0 whitespace-pre-wrap font-sans text-sm text-foreground">
          {preview.text}
        </pre>
      </div>
    </section>
  );
}

// ─── Send Controls ────────────────────────────────────────────────────────────

interface SendControlsProps {
  consentBasis: ConsentBasis;
  onChangeConsentBasis: (v: ConsentBasis) => void;
}

function SendControls({ consentBasis, onChangeConsentBasis }: SendControlsProps): ReactElement {
  return (
    <section className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4">
      <div className="space-y-1">
        <label htmlFor="announce-consent" className="text-xs font-medium text-foreground">
          Consent basis
        </label>
        <Select value={consentBasis} onValueChange={(v) => onChangeConsentBasis(v as ConsentBasis)}>
          <SelectTrigger id="announce-consent" className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="explicit_opt_in">Explicit opt-in</SelectItem>
            <SelectItem value="operational_contract">Operational contract</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

// ─── Sent Summary ────────────────────────────────────────────────────────────

interface SentSummaryProps {
  sent: AnnounceSent;
  onReset: () => void;
}

function SentSummary({ sent, onReset }: SentSummaryProps): ReactElement {
  const { sent: nSent, skipped_consent, failed, other } = sent.deliveriesSummary;
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0">
        Sent
      </h2>
      <p className="text-sm text-foreground">
        Dispatched to <span className="font-mono">{sent.recipientCount.toLocaleString()}</span>{' '}
        recipients
        {sent.truncated ? (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-amber-500">
            truncated
          </span>
        ) : null}
        .
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Sent</dt>
          <dd className="font-mono text-foreground">{nSent.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">
            Skipped (consent)
          </dt>
          <dd className="font-mono text-foreground">{skipped_consent.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Failed</dt>
          <dd className="font-mono text-foreground">{failed.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-wider text-muted-foreground">Other</dt>
          <dd className="font-mono text-foreground">{other.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="font-mono text-[10px] text-muted-foreground">
        interaction: <span className="text-foreground">{sent.interactionId}</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        Send another
      </Button>
    </section>
  );
}

// ─── Composer Form ───────────────────────────────────────────────────────────

interface ComposerFormProps {
  cohorts: CohortRow[];
  cohortId: string;
  subject: string;
  body: string;
  consentBasis: ConsentBasis;
  isPreviewing: boolean;
  estimatedRecipients: number | null;
  onChangeCohort: (id: string) => void;
  onChangeSubject: (s: string) => void;
  onChangeBody: (s: string) => void;
  onChangeConsentBasis: (v: ConsentBasis) => void;
  onPreview: () => void;
  onSend: () => void;
}

function ComposerForm({
  cohorts,
  cohortId,
  subject,
  body,
  consentBasis,
  isPreviewing,
  estimatedRecipients,
  onChangeCohort,
  onChangeSubject,
  onChangeBody,
  onChangeConsentBasis,
  onPreview,
  onSend,
}: ComposerFormProps): ReactElement {
  // Preview requires cohort + subject + body (HTML stripped of tags)
  const bodyText = body.replace(/<[^>]*>/g, '').trim();
  const canPreview =
    cohortId.length > 0 && subject.trim().length > 0 && bodyText.length > 0 && !isPreviewing;

  const actions: Action[] = [
    {
      label: 'Preview',
      onClick: onPreview,
      disabled: !canPreview,
      loading: isPreviewing,
    },
    {
      label: 'Send',
      onClick: onSend,
      disabled: estimatedRecipients === null || estimatedRecipients <= 0,
      variant: 'default',
      confirm: {
        title: 'Send announcement?',
        description:
          estimatedRecipients !== null
            ? `This will send to approximately ${estimatedRecipients.toLocaleString()} recipient${
                estimatedRecipients === 1 ? '' : 's'
              } from the selected cohort.`
            : 'No preview available. Please generate a preview first.',
        confirmLabel: 'Send',
      },
    },
  ];

  return (
    <div className="space-y-4">
      <ActionBar actions={actions} />

      <form className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="announce-cohort" className="text-xs font-medium text-foreground">
            Cohort
          </label>
          <Select value={cohortId} onValueChange={onChangeCohort}>
            <SelectTrigger id="announce-cohort" className="max-w-md">
              <SelectValue placeholder="Pick a saved cohort…" />
            </SelectTrigger>
            <SelectContent>
              {cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.member_count_cached.toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="announce-subject" className="text-xs font-medium text-foreground">
            Subject
          </label>
          <Input
            id="announce-subject"
            value={subject}
            onChange={(e) => onChangeSubject(e.target.value)}
            placeholder="Friday demo day — please RSVP"
            maxLength={200}
            required
            className="max-w-md"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="announce-body" className="text-xs font-medium text-foreground">
            Body
          </label>
          <TiptapEditor
            content={body}
            onChange={onChangeBody}
            placeholder="Write your message..."
          />
        </div>
      </form>

      {estimatedRecipients !== null && (
        <SendControls consentBasis={consentBasis} onChangeConsentBasis={onChangeConsentBasis} />
      )}
    </div>
  );
}

// ─── Composer Inner ──────────────────────────────────────────────────────────

function AnnounceComposerInner(): ReactElement {
  const cohortsQuery = useCohorts();
  const [cohortId, setCohortId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [consentBasis, setConsentBasis] = useState<ConsentBasis>('explicit_opt_in');
  const previewMutation = usePreviewAnnounce();
  const sendMutation = useSendAnnounce();

  const reset = useCallback((): void => {
    setCohortId('');
    setSubject('');
    setBody('');
    setConsentBasis('explicit_opt_in');
    previewMutation.reset();
    sendMutation.reset();
  }, [previewMutation, sendMutation]);

  if (cohortsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading cohorts…</p>;
  }
  if (cohortsQuery.error) {
    return (
      <p className="text-sm text-destructive">Cohorts unavailable: {cohortsQuery.error.message}</p>
    );
  }
  const cohorts = cohortsQuery.data ?? [];
  if (cohorts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved cohorts yet. Build one on{' '}
        <a href="/workspace/members" className="text-primary underline-offset-4 hover:underline">
          /workspace/members
        </a>{' '}
        first.
      </p>
    );
  }

  // After a successful send, swap the composer for the summary —
  // operators see the deliveriesSummary instead of the now-stale form.
  if (sendMutation.data) {
    return <SentSummary sent={sendMutation.data} onReset={reset} />;
  }

  const handlePreview = useCallback(() => {
    // Sanitize body HTML before sending to API
    const sanitizedBody = DOMPurify.sanitize(body, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'code'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
    previewMutation.mutate({ cohortId, subject, body: sanitizedBody });
  }, [cohortId, subject, body, previewMutation]);

  const handleSend = useCallback(() => {
    // Sanitize body HTML before sending to API
    const sanitizedBody = DOMPurify.sanitize(body, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'code'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
    sendMutation.mutate({ cohortId, subject, body: sanitizedBody, consentBasis });
  }, [cohortId, subject, body, consentBasis, sendMutation]);

  return (
    <div className="space-y-4">
      <ComposerForm
        cohorts={cohorts}
        cohortId={cohortId}
        subject={subject}
        body={body}
        consentBasis={consentBasis}
        isPreviewing={previewMutation.isPending}
        estimatedRecipients={previewMutation.data?.estimatedRecipients ?? null}
        onChangeCohort={setCohortId}
        onChangeSubject={setSubject}
        onChangeBody={setBody}
        onChangeConsentBasis={setConsentBasis}
        onPreview={handlePreview}
        onSend={handleSend}
      />

      {previewMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t generate preview: {previewMutation.error.message}
        </p>
      ) : null}

      {previewMutation.data ? <PreviewCard preview={previewMutation.data} /> : null}

      {sendMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t send: {sendMutation.error.message}
        </p>
      ) : null}
    </div>
  );
}

// ─── Public Export ───────────────────────────────────────────────────────────

export function AnnounceComposer(): ReactElement {
  return (
    <IslandRoot>
      <AnnounceComposerInner />
    </IslandRoot>
  );
}
