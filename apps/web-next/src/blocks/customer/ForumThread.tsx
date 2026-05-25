// L3 block — <ForumThread>.
//
// Per-event Q&A surface on /events/[id]. Anonymous viewers see the
// existing question list (SSR-fetched from Directus via the Public
// policy, threaded through `initialQuestions`). Signed-in viewers
// also get a textarea + post button that hits apps/api
// (POST /v1/events/:id/questions) via usePostQuestion.
//
// Sort rule: pinned questions float to the top regardless of recency;
// non-pinned sort newest-first. parentQuestionId is preserved on
// payload but rendered flat in v1 — deep thread tree is a follow-up
// once we know what conversations look like at this scale (matches
// v1 web's EventForum behaviour).
//
// Data-in/element-out: receives `initialQuestions` via SSR-prop, no
// useQuery for the read path. The mutation returns the created row
// and the block prepends it to its local list — no other consumer
// needs the data so we skip cache invalidation.
//
// Wiring: docs/architecture/wiring-map.md → event_questions.

import { Button } from '@/kit';
import type { EventQuestion } from '@/lib/types';
import { useAuth } from '@/lib/use-auth';
import { usePostQuestion } from '@/lib/use-event-forum';
import { type FormEvent, type ReactElement, useMemo, useState } from 'react';

interface Props {
  eventId: string;
  eventTitle: string;
  initialQuestions: EventQuestion[];
}

const MAX_LEN = 2000;

function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const diffMs = nowMs - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function signInHref(eventId: string): string {
  const next = `/events/${encodeURIComponent(eventId)}`;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

function AnonPrompt({ eventId }: { eventId: string }): ReactElement {
  return (
    <div className="rounded-md border border-dashed border-border p-4 flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground m-0">
        Sign in with your AI Qadam account to ask a question.
      </p>
      <a
        href={signInHref(eventId)}
        className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Sign in
      </a>
    </div>
  );
}

interface ComposerProps {
  eventId: string;
  eventTitle: string;
  onCreated: (q: EventQuestion) => void;
}

function Composer({ eventId, eventTitle, onCreated }: ComposerProps): ReactElement {
  const [draft, setDraft] = useState('');
  const post = usePostQuestion(eventId);
  const trimmedLength = draft.trim().length;
  const canSubmit = trimmedLength >= 1 && trimmedLength <= MAX_LEN && !post.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    post.mutate(
      { questionText: draft.trim() },
      {
        onSuccess: (created) => {
          onCreated(created);
          setDraft('');
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label
        htmlFor="forum-textarea"
        className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        Ask the speakers
      </label>
      <textarea
        id="forum-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`Your question about "${eventTitle}"…`}
        maxLength={MAX_LEN}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-between items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {trimmedLength}/{MAX_LEN}
        </span>
        <Button type="submit" disabled={!canSubmit}>
          {post.isPending ? 'Posting…' : 'Post'}
        </Button>
      </div>
      {post.error && <p className="text-xs text-destructive m-0">{post.error.message}</p>}
    </form>
  );
}

function QuestionItem({ q }: { q: EventQuestion }): ReactElement {
  const accent = q.isPinned ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-card';
  return (
    <li className={`rounded-md border ${accent} p-3.5`}>
      <div className="flex items-baseline gap-2 mb-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{q.author.displayName ?? 'Anonymous'}</span>
        <span className="font-mono">· {formatRelativeTime(q.createdAt)}</span>
        {q.isPinned && (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded border border-primary/30 text-primary">
            Pinned
          </span>
        )}
        {q.isAnswered && (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded border border-border">
            Answered
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line m-0">{q.questionText}</p>
    </li>
  );
}

export function ForumThread({ eventId, eventTitle, initialQuestions }: Props): ReactElement {
  const auth = useAuth();
  const [questions, setQuestions] = useState<EventQuestion[]>(initialQuestions);

  const sorted = useMemo(() => {
    return [...questions].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [questions]);

  const onCreated = (q: EventQuestion): void => {
    setQuestions((prev) => [q, ...prev]);
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-foreground m-0">Q&A</h2>
        <p className="text-xs text-muted-foreground m-0">
          Ask the speakers; replies appear inline.
        </p>
      </header>

      {auth.isAuthenticated ? (
        <Composer eventId={eventId} eventTitle={eventTitle} onCreated={onCreated} />
      ) : (
        <AnonPrompt eventId={eventId} />
      )}

      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground m-0">No questions yet</p>
          <p className="text-xs text-muted-foreground mt-1 m-0">Be the first to ask something.</p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {sorted.map((q) => (
            <QuestionItem key={q.id} q={q} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default ForumThread;
