import { type FormEvent, type ReactElement, useEffect, useState } from 'react';
import CriteriaBuilder, { type Criteria } from './CriteriaBuilder';

// #294 PR-c — segments cabinet. #393 swaps the JSON-edit textarea for a
// friendly CriteriaBuilder (chip pickers + event/topic dropdowns) with
// live debounced preview.

interface SegmentSummary {
  id: string;
  name: string;
  country: string;
  date_created: string;
}

interface SegmentPreview {
  segment_id: string;
  match_count: number;
  sample: { display_name: string }[];
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'load_error'; httpStatus: number }
  | {
      phase: 'ready';
      accessToken: string;
      items: SegmentSummary[];
      creating: NewForm | null;
      previews: Record<string, SegmentPreview | { error: string } | 'loading'>;
      saveError: string | null;
    };

interface NewForm {
  name: string;
  country: string;
  criteria: Criteria;
  // #393 — debounced preview state; null until first preview call
  // returns. Refreshes on every criteria/country edit (debounced 500ms).
  preview:
    | { match_count: number; sample: { display_name: string }[] }
    | { error: string }
    | 'loading'
    | null;
}

const DEFAULT_CRITERIA: Criteria = { _and: [] };

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/integrations/telegram/segments'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'load_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const res = await fetch('/api/v1/workspace/tg-segments', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'load_error', httpStatus: res.status };

  const { items } = (await res.json()) as { items: SegmentSummary[] };
  return { phase: 'ready', accessToken, items, creating: null, previews: {}, saveError: null };
}

export default function TgSegmentsList(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'forbidden') return <p style={mutedStyle()}>Operator access only.</p>;
  if (state.phase === 'load_error')
    return <p style={mutedStyle()}>Failed to load (HTTP {state.httpStatus}).</p>;

  const startCreate = (): void => {
    setState({
      ...state,
      creating: { name: '', country: 'uz', criteria: DEFAULT_CRITERIA, preview: null },
    });
  };

  const cancelCreate = (): void => {
    setState({ ...state, creating: null, saveError: null });
  };

  const submitCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!state.creating) return;
    const res = await fetch('/api/v1/workspace/tg-segments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: state.creating.name,
        country: state.creating.country,
        criteria: state.creating.criteria,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      setState({ ...state, saveError: `HTTP ${res.status}: ${text}` });
      return;
    }
    // Refresh list.
    const listRes = await fetch('/api/v1/workspace/tg-segments', {
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    const { items } = (await listRes.json()) as { items: SegmentSummary[] };
    setState({ ...state, items, creating: null, saveError: null });
  };

  const preview = async (id: string): Promise<void> => {
    setState({ ...state, previews: { ...state.previews, [id]: 'loading' } });
    const res = await fetch(`/api/v1/workspace/tg-segments/${encodeURIComponent(id)}/preview`, {
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    if (!res.ok) {
      setState({
        ...state,
        previews: { ...state.previews, [id]: { error: `HTTP ${res.status}` } },
      });
      return;
    }
    const body = (await res.json()) as SegmentPreview;
    setState({ ...state, previews: { ...state.previews, [id]: body } });
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        {state.creating === null ? (
          <button type="button" onClick={startCreate} style={newButtonStyle()}>
            + New segment
          </button>
        ) : (
          <form onSubmit={submitCreate} style={createFormStyle()}>
            {state.saveError && <div style={errorBoxStyle()}>{state.saveError}</div>}
            <label style={labelStyle()}>
              Name
              <input
                required
                type="text"
                value={state.creating.name}
                maxLength={120}
                onChange={(e) =>
                  setState({
                    ...state,
                    creating: state.creating ? { ...state.creating, name: e.target.value } : null,
                  })
                }
                style={inputStyle()}
              />
            </label>
            <label style={labelStyle()}>
              Country
              <select
                value={state.creating.country}
                onChange={(e) =>
                  setState({
                    ...state,
                    creating: state.creating
                      ? { ...state.creating, country: e.target.value }
                      : null,
                  })
                }
                style={inputStyle()}
              >
                <option value="uz">Uzbekistan</option>
                <option value="kz">Kazakhstan</option>
                <option value="tj">Tajikistan</option>
              </select>
            </label>
            <CriteriaBuilder
              criteria={state.creating.criteria}
              country={state.creating.country}
              accessToken={state.accessToken}
              onChange={(next) =>
                setState({
                  ...state,
                  creating: state.creating ? { ...state.creating, criteria: next } : null,
                })
              }
            />
            <DraftPreview
              accessToken={state.accessToken}
              country={state.creating.country}
              criteria={state.creating.criteria}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={primaryButtonStyle()}>
                Save segment
              </button>
              <button type="button" onClick={cancelCreate} style={secondaryButtonStyle()}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      {state.items.length === 0 && state.creating === null ? (
        <p style={mutedStyle()}>No segments yet. Use "+ New segment" to create one.</p>
      ) : (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Name</th>
              <th style={thStyle()}>Country</th>
              <th style={thStyle()}>Created</th>
              <th style={thStyle()}>Preview</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((s) => {
              const p = state.previews[s.id];
              return (
                <tr key={s.id}>
                  <td style={tdStyle()}>{s.name}</td>
                  <td style={tdStyle()}>{s.country.toUpperCase()}</td>
                  <td style={tdStyle()}>{new Date(s.date_created).toLocaleString()}</td>
                  <td style={tdStyle()}>
                    {p === undefined && (
                      <button
                        type="button"
                        onClick={() => void preview(s.id)}
                        style={secondaryButtonStyle()}
                      >
                        Preview
                      </button>
                    )}
                    {p === 'loading' && <span style={mutedStyle()}>Loading…</span>}
                    {p && typeof p === 'object' && 'error' in p && (
                      <span style={mutedStyle()}>Error: {p.error}</span>
                    )}
                    {p && typeof p === 'object' && 'match_count' in p && (
                      <span>
                        <strong>{p.match_count}</strong> members
                        {p.sample.length > 0 && (
                          <span style={mutedStyle()}>
                            {' '}
                            (e.g. {p.sample.map((s) => s.display_name).join(', ')})
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────

function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 14 };
}
function tableStyle(): React.CSSProperties {
  return { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
}
function thStyle(): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
  };
}
function tdStyle(): React.CSSProperties {
  return { padding: '12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
}
function newButtonStyle(): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  };
}
function primaryButtonStyle(): React.CSSProperties {
  return newButtonStyle();
}
function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
}
function createFormStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 16,
  };
}
function labelStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
  };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: '8px 12px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--background)',
    color: 'var(--foreground)',
  };
}
function errorBoxStyle(): React.CSSProperties {
  return {
    padding: 12,
    border: '1px solid #dc2626',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 14,
  };
}

// ─── #393 — live debounced preview ──────────────────────────────────────

interface DraftPreviewProps {
  accessToken: string;
  country: string;
  criteria: Criteria;
}

// 500ms debounce so chip-by-chip edits don't hammer the resolver. State
// is local to this component because the parent doesn't care about the
// preview value — only the operator does (visual confidence check).
function DraftPreview({ accessToken, country, criteria }: DraftPreviewProps): ReactElement {
  const [state, setState] = useState<
    | 'idle'
    | 'loading'
    | { match_count: number; sample: { display_name: string }[] }
    | { error: string }
  >('idle');

  useEffect(() => {
    const handle = setTimeout(async () => {
      setState('loading');
      try {
        const res = await fetch('/api/v1/workspace/tg-segments/preview', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ country, criteria }),
        });
        if (!res.ok) {
          const text = await res.text();
          setState({ error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
          return;
        }
        const body = (await res.json()) as {
          match_count: number;
          sample: { display_name: string }[];
        };
        setState(body);
      } catch (e) {
        setState({ error: e instanceof Error ? e.message : 'fetch failed' });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [accessToken, country, criteria]);

  return (
    <div
      style={{
        padding: 10,
        border: '1px dashed var(--border)',
        borderRadius: 6,
        fontSize: 13,
      }}
      data-testid="draft-preview"
    >
      <strong>Preview:</strong>{' '}
      {state === 'idle' && <span style={mutedStyle()}>Edit criteria to preview match count</span>}
      {state === 'loading' && <span style={mutedStyle()}>Calculating…</span>}
      {typeof state === 'object' && 'error' in state && (
        <span style={mutedStyle()}>Error: {state.error}</span>
      )}
      {typeof state === 'object' && 'match_count' in state && (
        <span>
          <strong>{state.match_count}</strong> matching members
          {state.sample.length > 0 && (
            <span style={mutedStyle()}>
              {' '}
              (e.g. {state.sample.map((s) => s.display_name).join(', ')})
            </span>
          )}
        </span>
      )}
    </div>
  );
}
