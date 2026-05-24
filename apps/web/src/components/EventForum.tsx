import { useEffect, useMemo, useState } from 'react';
import type { EventQuestion } from '../lib/api';

// F-WebU12 — Forum tab island. Anonymous viewers see existing questions
// (the initial list comes from SSR via Directus Public-policy read);
// signed-in viewers also get a textarea + post button that POSTs to
// /v1/events/:id/questions and prepends the new question on success.
//
// Rendering rules: pinned questions float to the top regardless of
// recency; non-pinned sort by recency (newest first). Replies are
// stored with parent_question_id but render flat in v1 — the deep
// thread tree comes in a follow-up once we know what conversations
// actually look like at this scale.

interface ForumI18n {
  forum_heading: string;
  forum_subheading: string;
  forum_signin_body: string;
  forum_signin_cta: string;
  forum_form_label: string;
  forum_form_placeholder: string;
  forum_form_submit: string;
  forum_form_posting: string;
  forum_empty_title: string;
  forum_empty_body: string;
  forum_anon_label: string;
  forum_badge_pinned: string;
  forum_badge_answered: string;
}

interface Props {
  eventId: string;
  eventTitle: string;
  initialQuestions: EventQuestion[];
  t: ForumI18n;
}

type AuthPhase = 'loading' | 'anon' | { kind: 'authed'; accessToken: string };
type PostPhase = 'idle' | 'posting' | { kind: 'error'; message: string };

async function fetchAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  } catch {
    return null;
  }
}

async function postQuestion(
  eventId: string,
  accessToken: string,
  questionText: string,
): Promise<EventQuestion> {
  const res = await fetch(`/api/v1/events/${eventId}/questions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ questionText }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`post failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const created = (await res.json()) as {
    id: string;
    parentQuestionId: string | null;
    questionText: string;
    createdAt: string;
  };
  return {
    id: created.id,
    questionText: created.questionText,
    parentQuestionId: created.parentQuestionId,
    isPinned: false,
    isAnswered: false,
    createdAt: created.createdAt,
    author: { displayName: null, directusUserId: null },
  };
}

function formatRelativeTime(iso: string, nowMs = Date.now()): string {
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

export default function EventForum({ eventId, eventTitle, initialQuestions, t }: Props) {
  const [questions, setQuestions] = useState<EventQuestion[]>(initialQuestions);
  const [auth, setAuth] = useState<AuthPhase>('loading');
  const [draft, setDraft] = useState('');
  const [post, setPost] = useState<PostPhase>('idle');

  useEffect(() => {
    void fetchAccessToken().then((token) => {
      setAuth(token ? { kind: 'authed', accessToken: token } : 'anon');
    });
  }, []);

  const sorted = useMemo(() => {
    return [...questions].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [questions]);

  const trimmedLength = draft.trim().length;
  const canSubmit =
    typeof auth === 'object' &&
    auth.kind === 'authed' &&
    post !== 'posting' &&
    trimmedLength >= 1 &&
    trimmedLength <= 2000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || typeof auth !== 'object') return;
    setPost('posting');
    try {
      const created = await postQuestion(eventId, auth.accessToken, draft.trim());
      setQuestions((prev) => [created, ...prev]);
      setDraft('');
      setPost('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      setPost({ kind: 'error', message });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {t.forum_heading ?? 'Q&A'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          {t.forum_subheading ?? 'Ask the speakers; replies appear inline.'}
        </p>
      </header>

      {auth === 'loading' ? null : auth === 'anon' ? (
        <div
          style={{
            padding: 16,
            border: '1px dashed var(--border)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted-foreground)' }}>
            {t.forum_signin_body ?? 'Sign in with your AI Qadam account to ask a question.'}
          </p>
          <a
            href={`/auth/sign-in?next=${encodeURIComponent(`/events/${eventId}?tab=forum`)}`}
            className="btn btn-primary btn-sm"
          >
            {t.forum_signin_cta ?? 'Sign in'}
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            htmlFor="event-forum-textarea"
            className="section-eyebrow"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
            }}
          >
            {t.forum_form_label ?? 'Ask the speakers'}
          </label>
          <textarea
            id="event-forum-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={(
              t.forum_form_placeholder ?? `Your question about “${eventTitle}”…`
            ).replace('{{title}}', eventTitle)}
            maxLength={2000}
            rows={3}
            className="textarea"
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--muted-foreground)',
              }}
            >
              {trimmedLength}/2000
            </span>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
              {post === 'posting'
                ? (t.forum_form_posting ?? 'Posting…')
                : (t.forum_form_submit ?? 'Post')}
            </button>
          </div>
          {typeof post === 'object' && post.kind === 'error' && (
            <p className="helper error" style={{ margin: 0 }}>
              {post.message}
            </p>
          )}
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state" style={{ margin: 0 }}>
          <div className="empty-icon" aria-hidden="true">
            💬
          </div>
          <p className="empty-heading">{t.forum_empty_title ?? 'No questions yet'}</p>
          <p className="empty-desc">{t.forum_empty_body ?? 'Be the first to ask something.'}</p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {sorted.map((q) => (
            <li
              key={q.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 14,
                background: q.isPinned
                  ? 'color-mix(in oklch, var(--primary) 6%, var(--card))'
                  : 'var(--card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 6,
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                  {q.author.displayName ?? t.forum_anon_label ?? 'Anonymous'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  · {formatRelativeTime(q.createdAt)}
                </span>
                {q.isPinned && (
                  <span className="badge mono" style={{ fontSize: 9, padding: '1px 6px' }}>
                    {t.forum_badge_pinned ?? 'PINNED'}
                  </span>
                )}
                {q.isAnswered && (
                  <span className="badge mono" style={{ fontSize: 9, padding: '1px 6px' }}>
                    {t.forum_badge_answered ?? 'ANSWERED'}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {q.questionText}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
