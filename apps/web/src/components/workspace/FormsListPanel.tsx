import { type ReactElement, useEffect, useState } from 'react';

// Operator forms list. Shows all forms operator can see (country-scoped
// server-side), with status pills + submission counts. Quick actions:
// "+ New form" creates a draft + jumps to the builder.

interface FormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  status: 'draft' | 'published' | 'archived';
  allow_anonymous: boolean;
  submission_count: number;
  date_created: string;
  date_updated: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; accessToken: string; email: string; forms: FormRow[] }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return { phase: 'anon' };
    const meData = (await me.json()) as { email: string };
    const list = await fetch('/api/v1/workspace/forms', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!list.ok) return { phase: 'error', message: `list forms: ${list.status}` };
    const { forms } = (await list.json()) as { forms: FormRow[] };
    return { phase: 'authed', accessToken, email: meData.email, forms };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next = typeof window === 'undefined' ? '/workspace/forms' : window.location.pathname;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function createDraftForm(
  accessToken: string,
  country: string,
): Promise<{ id: string } | { error: string }> {
  const slug = `untitled-${Date.now().toString(36)}`;
  const body = {
    slug,
    title: 'Untitled form',
    country,
    status: 'draft',
    allow_anonymous: true,
    schema: { fields: [] },
  };
  try {
    const res = await fetch('/api/v1/workspace/forms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { error: `create form: ${res.status}` };
    }
    const { form } = (await res.json()) as { form: { id: string } };
    return { id: form.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'create failed' };
  }
}

export default function FormsListPanel(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  if (state.phase === 'loading') return <Shell>Loading…</Shell>;
  if (state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ marginBottom: 16 }}>You need to sign in to manage forms.</p>
        <a href={signInUrl()} className="btn btn-primary">
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

  // Default country for "new form" — first form's country if any exist,
  // else "uz" placeholder; operator can change in builder.
  const defaultCountry = state.forms[0]?.country ?? 'uz';

  const handleCreate = async (): Promise<void> => {
    const result = await createDraftForm(state.accessToken, defaultCountry);
    if ('error' in result) {
      setState({ phase: 'error', message: result.error });
      return;
    }
    window.location.href = `/workspace/forms/${result.id}`;
  };

  return (
    <Shell>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontFamily: 'var(--font-display)' }}>Forms</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            Build reusable surveys. Attach to events as post-event feedback or share via public
            link.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void handleCreate()}>
          + New form
        </button>
      </header>
      {state.forms.length === 0 ? (
        <EmptyState />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>Title</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th align="right">Responses</Th>
              <Th align="right">Updated</Th>
            </tr>
          </thead>
          <tbody>
            {state.forms.map((f) => {
              const go = (): void => {
                window.location.href = `/workspace/forms/${f.id}`;
              };
              return (
                <tr
                  key={f.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={go}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') go();
                  }}
                  tabIndex={0}
                >
                  <Td>
                    <div style={{ fontWeight: 500 }}>{f.title}</div>
                    {f.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                        {f.description.length > 80
                          ? `${f.description.slice(0, 80)}…`
                          : f.description}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{f.slug}</code>
                  </Td>
                  <Td>
                    <StatusPill status={f.status} />
                  </Td>
                  <Td align="right">{f.submission_count}</Td>
                  <Td align="right">
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {fmtDate(f.date_updated ?? f.date_created)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
      <p style={{ margin: 0, fontSize: 15 }}>No forms yet.</p>
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>
        Tap <strong>+ New form</strong> to create your first one.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: 'draft' | 'published' | 'archived' }): ReactElement {
  const colorMap: Record<typeof status, { bg: string; fg: string }> = {
    draft: { bg: 'rgba(255,255,255,0.08)', fg: 'var(--muted-foreground)' },
    published: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
    archived: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  };
  const { bg, fg } = colorMap[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {status}
    </span>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
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
  children: React.ReactNode;
  align?: 'left' | 'right';
}): ReactElement {
  return (
    <td style={{ textAlign: align, padding: '14px 8px', fontSize: 14, verticalAlign: 'top' }}>
      {children}
    </td>
  );
}

function fmtDate(s: string): string {
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return s;
  }
}

function Shell({ children }: { children: React.ReactNode }): ReactElement {
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>{children}</main>;
}
