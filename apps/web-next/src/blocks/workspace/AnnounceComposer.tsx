// L3 workspace block — <AnnounceComposer>.
//
// React island for the /workspace/announce cabinet (operator
// announcement composer). Flow: pick a saved cohort → write subject +
// body → preview. Send + delivery-summary land in M2.4-ii.
//
// Mirrors v1's AnnounceComposer (apps/web/src/components/workspace/
// AnnounceComposer.tsx) — same API shapes, same primitives, same
// guard against zero-cohorts. The L3-block + IslandRoot pattern
// replaces v1's auth-island bootstrap.

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { AnnouncePreview, CohortRow } from '@/lib/types';
import { usePreviewAnnounce } from '@/lib/use-announce';
import { useCohorts } from '@/lib/use-cohorts';
import { type FormEvent, type ReactElement, useState } from 'react';

interface ComposerFormProps {
  cohorts: CohortRow[];
  cohortId: string;
  subject: string;
  body: string;
  isPreviewing: boolean;
  onChangeCohort: (id: string) => void;
  onChangeSubject: (s: string) => void;
  onChangeBody: (s: string) => void;
  onSubmit: () => void;
}

function ComposerForm({
  cohorts,
  cohortId,
  subject,
  body,
  isPreviewing,
  onChangeCohort,
  onChangeSubject,
  onChangeBody,
  onSubmit,
}: ComposerFormProps): ReactElement {
  const canPreview =
    cohortId.length > 0 && subject.trim().length > 0 && body.trim().length > 0 && !isPreviewing;
  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (canPreview) onSubmit();
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
        <textarea
          id="announce-body"
          value={body}
          onChange={(e) => onChangeBody(e.target.value)}
          placeholder="Plain text or minimal HTML."
          maxLength={20_000}
          rows={8}
          required
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <Button type="submit" disabled={!canPreview}>
        {isPreviewing ? 'Generating preview…' : 'Preview'}
      </Button>
    </form>
  );
}

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

function AnnounceComposerInner(): ReactElement {
  const cohortsQuery = useCohorts();
  const [cohortId, setCohortId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const previewMutation = usePreviewAnnounce();

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

  return (
    <div className="space-y-4">
      <ComposerForm
        cohorts={cohorts}
        cohortId={cohortId}
        subject={subject}
        body={body}
        isPreviewing={previewMutation.isPending}
        onChangeCohort={setCohortId}
        onChangeSubject={setSubject}
        onChangeBody={setBody}
        onSubmit={() => previewMutation.mutate({ cohortId, subject, body })}
      />

      {previewMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't generate preview: {previewMutation.error.message}
        </p>
      ) : null}

      {previewMutation.data ? <PreviewCard preview={previewMutation.data} /> : null}
    </div>
  );
}

export function AnnounceComposer(): ReactElement {
  return (
    <IslandRoot>
      <AnnounceComposerInner />
    </IslandRoot>
  );
}
