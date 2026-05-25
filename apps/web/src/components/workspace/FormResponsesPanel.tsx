import { type ReactElement, useEffect, useState } from 'react';

// Operator responses inbox for a single form. Two stacked sections:
//   1. Aggregate header — per-field rollup (NPS mean + histogram,
//      yes/no counts, select counts, text response counts)
//   2. Raw response table — sorted newest-first, paginated client-side
//      (server caps at 500; UI page-size = 50)
//
// Privacy: rows where is_anonymous=true are clearly badged + show no
// member identity. The MEMBER column shows "Anonymous" in those rows
// (member FK was nulled on the server per PR-B contract).

type FieldAggregate =
  | { type: 'short_text' | 'long_text'; key: string; label: string; response_count: number }
  | {
      type: 'scale';
      key: string;
      label: string;
      response_count: number;
      mean: number | null;
      distribution: Array<{ value: number; count: number }>;
      min: number;
      max: number;
    }
  | {
      type: 'select_one' | 'select_many';
      key: string;
      label: string;
      response_count: number;
      counts: Array<{ value: string; label: string; count: number }>;
    }
  | {
      type: 'yes_no';
      key: string;
      label: string;
      response_count: number;
      yes: number;
      no: number;
    };

interface FormAggregate {
  form_id: string;
  form_title: string;
  total_responses: number;
  anonymous_count: number;
  attributed_count: number;
  by_event: Array<{ event_id: string | null; count: number }>;
  fields: FieldAggregate[];
}

interface SubmissionRow {
  id: string;
  form: string;
  event: string | null;
  is_anonymous: boolean;
  member: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  telegram_user_id: string | null;
  payload: Record<string, unknown>;
  source: 'web' | 'bot' | 'email';
  language: string | null;
  status: 'new' | 'triaged' | 'closed';
  date_created: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | {
      phase: 'authed';
      accessToken: string;
      aggregate: FormAggregate;
      submissions: SubmissionRow[];
    }
  | { phase: 'error'; message: string };

async function bootstrap(formId: string): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [aggRes, subsRes] = await Promise.all([
      fetch(`/api/v1/workspace/forms/${encodeURIComponent(formId)}/aggregate`, { headers }),
      fetch(`/api/v1/workspace/forms/${encodeURIComponent(formId)}/submissions?limit=500`, {
        headers,
      }),
    ]);
    if (aggRes.status === 401 || subsRes.status === 401) return { phase: 'anon' };
    if (!aggRes.ok) return { phase: 'error', message: `aggregate: ${aggRes.status}` };
    if (!subsRes.ok) return { phase: 'error', message: `submissions: ${subsRes.status}` };
    const { aggregate } = (await aggRes.json()) as { aggregate: FormAggregate };
    const { submissions } = (await subsRes.json()) as { submissions: SubmissionRow[] };
    return { phase: 'authed', accessToken, aggregate, submissions };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(formId: string): string {
  return `/api/v1/auth/login?next=${encodeURIComponent(`/workspace/forms/${formId}/responses`)}`;
}

export default function FormResponsesPanel({ formId }: { formId: string }): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap(formId).then(setState);
  }, [formId]);

  if (state.phase === 'loading') return <Shell>Loading…</Shell>;
  if (state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ marginBottom: 16 }}>You need to sign in.</p>
        <a href={signInUrl(formId)} className="btn btn-primary">
          Sign in
        </a>
      </Shell>
    );
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <p style={{ color: 'var(--destructive, #c00)' }}>Error: {state.message}</p>
      </Shell>
    );
  }

  return (
    <AuthedResponses formId={formId} aggregate={state.aggregate} submissions={state.submissions} />
  );
}

function AuthedResponses({
  formId,
  aggregate,
  submissions,
}: {
  formId: string;
  aggregate: FormAggregate;
  submissions: SubmissionRow[];
}): ReactElement {
  return (
    <Shell>
      <header style={{ marginBottom: 24 }}>
        <a
          href={`/workspace/forms/${formId}`}
          style={{ fontSize: 13, color: 'var(--muted-foreground)' }}
        >
          ← Back to builder
        </a>
        <h1 style={{ margin: '6px 0 0', fontSize: 26, fontFamily: 'var(--font-display)' }}>
          {aggregate.form_title}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 6 }}>
          {aggregate.total_responses} {aggregate.total_responses === 1 ? 'response' : 'responses'}
          {aggregate.anonymous_count > 0 && ` · ${aggregate.anonymous_count} anonymous`}
          {aggregate.by_event.length > 1 && ` · ${aggregate.by_event.length} events`}
        </div>
      </header>

      {aggregate.total_responses === 0 ? (
        <EmptyState />
      ) : (
        <>
          <AggregateSection aggregate={aggregate} />
          <SubmissionsTable submissions={submissions} />
        </>
      )}
    </Shell>
  );
}

function EmptyState(): ReactElement {
  return (
    <div
      style={{
        padding: 48,
        border: '1px dashed var(--border)',
        borderRadius: 16,
        textAlign: 'center',
        color: 'var(--muted-foreground)',
      }}
    >
      <p style={{ margin: 0, fontSize: 15 }}>No responses yet.</p>
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>
        Share the public form link or attach this form to an event as the post-event survey.
      </p>
    </div>
  );
}

// ─── Aggregate cards ────────────────────────────────────────────────────────

function AggregateSection({ aggregate }: { aggregate: FormAggregate }): ReactElement {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>Aggregate</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {aggregate.fields.map((field) => (
          <AggregateCard key={field.key} field={field} />
        ))}
      </div>
    </section>
  );
}

function AggregateCard({ field }: { field: FieldAggregate }): ReactElement {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{field.label}</div>
          <code style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{field.key}</code>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          {field.response_count} {field.response_count === 1 ? 'response' : 'responses'}
        </span>
      </div>
      <AggregateBody field={field} />
    </div>
  );
}

function AggregateBody({ field }: { field: FieldAggregate }): ReactElement {
  if (field.type === 'short_text' || field.type === 'long_text') {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
        Open the table below to read individual responses.
      </p>
    );
  }
  if (field.type === 'scale') return <ScaleSummary field={field} />;
  if (field.type === 'yes_no') return <YesNoSummary field={field} />;
  if (field.type === 'select_one' || field.type === 'select_many') {
    return <SelectSummary field={field} />;
  }
  return <p style={{ margin: 0 }}>Unknown field type.</p>;
}

function ScaleSummary({
  field,
}: {
  field: Extract<FieldAggregate, { type: 'scale' }>;
}): ReactElement {
  if (field.response_count === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>No data yet.</p>
    );
  }
  const maxCount = Math.max(...field.distribution.map((d) => d.count), 1);
  return (
    <div>
      <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        {field.mean === null ? '—' : field.mean.toFixed(1)}
        <span
          style={{ fontSize: 13, color: 'var(--muted-foreground)', marginLeft: 8, fontWeight: 400 }}
        >
          mean
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60, marginTop: 12 }}>
        {field.distribution.map((d) => (
          <div
            key={d.value}
            title={`${d.value}: ${d.count}`}
            style={{
              flex: 1,
              minWidth: 18,
              height: `${(d.count / maxCount) * 100}%`,
              background: 'var(--primary)',
              borderRadius: '4px 4px 0 0',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -16,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 10,
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {d.count}
            </span>
            <span
              style={{
                position: 'absolute',
                bottom: -16,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 10,
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function YesNoSummary({
  field,
}: {
  field: Extract<FieldAggregate, { type: 'yes_no' }>;
}): ReactElement {
  const total = field.yes + field.no;
  if (total === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>No data yet.</p>
    );
  }
  const yesPct = Math.round((field.yes / total) * 100);
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
      <div>
        <strong style={{ color: '#22c55e' }}>Yes:</strong> {field.yes} ({yesPct}%)
      </div>
      <div>
        <strong style={{ color: '#ef4444' }}>No:</strong> {field.no} ({100 - yesPct}%)
      </div>
    </div>
  );
}

function SelectSummary({
  field,
}: {
  field: Extract<FieldAggregate, { type: 'select_one' | 'select_many' }>;
}): ReactElement {
  const maxCount = Math.max(...field.counts.map((c) => c.count), 1);
  return (
    <div>
      {field.counts.map((c) => (
        <div key={c.value} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{c.label}</span>
            <span style={{ color: 'var(--muted-foreground)' }}>{c.count}</span>
          </div>
          <div
            style={{
              height: 6,
              background: 'var(--border)',
              borderRadius: 3,
              marginTop: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(c.count / maxCount) * 100}%`,
                height: '100%',
                background: 'var(--primary)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Raw submissions table ──────────────────────────────────────────────────

function SubmissionsTable({ submissions }: { submissions: SubmissionRow[] }): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section>
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
        All responses ({submissions.length})
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <Th>Submitted</Th>
            <Th>Respondent</Th>
            <Th>Source</Th>
            <Th align="right" />
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => {
            const isOpen = expanded.has(s.id);
            return (
              <SubmissionRows
                key={s.id}
                submission={s}
                isOpen={isOpen}
                onToggle={() => toggle(s.id)}
              />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SubmissionRows({
  submission,
  isOpen,
  onToggle,
}: {
  submission: SubmissionRow;
  isOpen: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <>
      <tr
        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        tabIndex={0}
      >
        <Td>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {fmtDateTime(submission.date_created)}
          </span>
        </Td>
        <Td>
          <RespondentCell submission={submission} />
        </Td>
        <Td>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--muted-foreground)',
            }}
          >
            {submission.source}
          </span>
        </Td>
        <Td align="right">
          <span style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>
            {isOpen ? '−' : '+'}
          </span>
        </Td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={4} style={{ padding: '0 8px 16px' }}>
            <PayloadView payload={submission.payload} />
          </td>
        </tr>
      )}
    </>
  );
}

function RespondentCell({ submission }: { submission: SubmissionRow }): ReactElement {
  if (submission.is_anonymous) {
    return (
      <span
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
        }}
      >
        Anonymous
      </span>
    );
  }
  if (submission.member) {
    const name = [submission.member.first_name, submission.member.last_name]
      .filter(Boolean)
      .join(' ');
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{name || submission.member.email}</div>
        {name && submission.member.email && (
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            {submission.member.email}
          </div>
        )}
      </div>
    );
  }
  // Attributed but not member-linked (silent-link not yet, or removed)
  return (
    <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
      Unlinked TG ({submission.telegram_user_id})
    </span>
  );
}

function PayloadView({ payload }: { payload: Record<string, unknown> }): ReactElement {
  return (
    <div
      style={{
        padding: 12,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {Object.entries(payload).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
            }}
          >
            {key}
          </div>
          <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {fmtValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmtValue(v: unknown): string {
  if (v == null) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtDateTime(s: string): string {
  try {
    return new Date(s).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}): ReactElement {
  return (
    <th
      style={{
        textAlign: align,
        padding: '12px 8px',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--muted-foreground)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}): ReactElement {
  return (
    <td style={{ textAlign: align, padding: '14px 8px', fontSize: 14, verticalAlign: 'top' }}>
      {children}
    </td>
  );
}

function Shell({ children }: { children: React.ReactNode }): ReactElement {
  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px' }}>{children}</main>;
}
