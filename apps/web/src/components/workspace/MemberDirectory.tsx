import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';

// F-S3.2 — workspace cabinet #1: member directory + cohort builder.
// Per ADR-0033 Part 3: operators NEVER touch Directus admin. This is
// the cabinet that replaces it for the search/filter/cohort workflow.
//
// Phase 1 (MVP this PR): 7 filter primitives — country, seniority,
// industry, interests, employment (current employer), attended_min,
// consent_purpose. Each is a Directus-native filter clause. The whole
// filter object is what cohort.filter_query stores AND what the
// Interactions dispatcher consumes — zero translation hop.

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; me: Me }
  | { phase: 'error'; message: string };

interface MemberRow {
  id: string;
  email: string;
  first_name?: string | null;
  display_name?: string | null;
  job_title?: string | null;
  seniority?: string | null;
  city?: string | null;
  industry?: string[] | null;
  state?: string | null;
}

interface SearchResult {
  members: MemberRow[];
  total: number;
}

interface Cohort {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  member_count_cached: number;
}

interface Filters {
  country: string;
  seniority: string;
  industry: string;
  interest: string;
  employer: string;
  attendedMin: string;
  consent: string;
}

const EMPTY: Filters = {
  country: '',
  seniority: '',
  industry: '',
  interest: '',
  employer: '',
  attendedMin: '',
  consent: '',
};

const SENIORITY_OPTIONS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'] as const;
const COUNTRY_OPTIONS = ['uz', 'kz', 'tj', 'xx'] as const;
const CONSENT_PURPOSES = [
  'events',
  'marketing',
  'research',
  'recruiting',
  'sponsor_share',
  'content',
  'paid_premium',
] as const;

// Each primitive becomes one Directus filter clause. Table-driven so
// the function stays simple as we add more primitives.
const FILTER_BUILDERS: Array<{
  key: keyof Filters;
  build: (value: string) => Record<string, unknown> | null;
}> = [
  { key: 'country', build: (v) => ({ country: { _eq: v } }) },
  { key: 'seniority', build: (v) => ({ seniority: { _eq: v } }) },
  { key: 'industry', build: (v) => ({ industry: { _contains: v } }) },
  { key: 'interest', build: (v) => ({ member_interests: { topic_tag: { _eq: v } } }) },
  {
    key: 'employer',
    build: (v) => ({
      member_employments: {
        employer: { name: { _icontains: v } },
        is_current: { _eq: true },
      },
    }),
  },
  {
    key: 'attendedMin',
    build: (v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      // Directus _count is a server-side aggregate; canonical pattern.
      return { registrations: { _count: { _gte: n } } };
    },
  },
  {
    key: 'consent',
    build: (v) => ({
      member_consents: { purpose: { _eq: v }, revoked_at: { _null: true } },
    }),
  },
];

function buildFilter(f: Filters): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  for (const { key, build } of FILTER_BUILDERS) {
    const raw = f[key];
    if (!raw) continue;
    const clause = build(raw);
    if (clause) clauses.push(clause);
  }
  if (clauses.length === 0) return {};
  const first = clauses[0];
  if (clauses.length === 1 && first) return first;
  return { _and: clauses };
}

async function bootstrap(): Promise<State> {
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) return { phase: 'anon' };
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    const meRes = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return { phase: 'anon' };
    const me = (await meRes.json()) as Me;
    return { phase: 'authed', me };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/members'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function MemberDirectory(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap().then(async (s) => {
      setState(s);
      if (s.phase === 'authed') {
        const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (r.ok) {
          const { accessToken: t } = (await r.json()) as { accessToken: string };
          setAccessToken(t);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'loading' || state.phase === 'anon') {
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <Err message={state.message} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Authed accessToken={accessToken} email={state.me.email} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactElement }): ReactElement {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 12px',
            padding: '0 8px',
          }}
        >
          Workspace
        </p>
        <a
          href="/workspace"
          className="app-nav-link"
          style={{ display: 'block', padding: '8px 12px' }}
        >
          Dashboard
        </a>
        <a
          href="/workspace/members"
          className="app-nav-link"
          style={{
            display: 'block',
            padding: '8px 12px',
            background: 'var(--card)',
            borderRadius: 6,
          }}
        >
          Members
        </a>
        <a
          href="/workspace/announce"
          className="app-nav-link"
          style={{ display: 'block', padding: '8px 12px' }}
        >
          Announce
        </a>
        <a
          href="/workspace/events"
          className="app-nav-link"
          style={{ display: 'block', padding: '8px 12px' }}
        >
          Events
        </a>
      </aside>
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 1280 }}>{children}</main>
    </div>
  );
}

function Loading(): ReactElement {
  return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
}
function Err({ message }: { message: string }): ReactElement {
  return <p style={{ color: 'var(--muted-foreground)' }}>Members unavailable: {message}</p>;
}

function Authed({
  accessToken,
  email,
}: { accessToken: string | null; email: string }): ReactElement {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const filterObj = useMemo(() => buildFilter(filters), [filters]);

  const runSearch = useCallback(async () => {
    if (!accessToken) return;
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (Object.keys(filterObj).length > 0) params.set('filter', JSON.stringify(filterObj));
      const res = await fetch(`/api/v1/workspace/members?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setResults((await res.json()) as SearchResult);
    } finally {
      setSearching(false);
    }
  }, [accessToken, filterObj, search]);

  const loadCohorts = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch('/api/v1/workspace/cohorts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const { cohorts: rows } = (await res.json()) as { cohorts: Cohort[] };
      setCohorts(rows);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      void runSearch();
      void loadCohorts();
    }
  }, [accessToken, runSearch, loadCohorts]);

  const loadCohortFilter = (c: Cohort): void => {
    // For the MVP, clicking a cohort loads its name in the search box;
    // detail-drawer-fed filter restoration ships in v1.1 (the filter
    // shape is in the cohort's filter_query but parsing it back into
    // the 7 UI primitives requires inverse mapping). Stub for now.
    setSearch(c.name);
  };

  const saveAsCohort = async (name: string, description: string): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/workspace/cohorts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description: description || undefined,
          filter_query: filterObj,
        }),
      });
      if (res.ok) {
        setSaveOpen(false);
        await loadCohorts();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          Signed in as {email}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Members
        </h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '6px 0 0' }}>
          Search the directory. Build cohorts to reuse in announcements + sponsor analytics.
        </p>
      </header>

      <div
        style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}
      >
        <CohortList cohorts={cohorts} onClick={loadCohortFilter} />
        <section>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            search={search}
            setSearch={setSearch}
            onSearch={() => void runSearch()}
          />
          <ResultsTable
            results={results}
            searching={searching}
            onSaveAsCohort={() => setSaveOpen(true)}
            hasFilter={Object.keys(filterObj).length > 0 || search.length > 0}
          />
        </section>
      </div>

      {saveOpen && (
        <SaveCohortModal
          filter={filterObj}
          accessToken={accessToken}
          onClose={() => setSaveOpen(false)}
          onSave={saveAsCohort}
          saving={saving}
        />
      )}
    </div>
  );
}

interface FilterBarProps {
  filters: Filters;
  setFilters: (f: Filters) => void;
  search: string;
  setSearch: (s: string) => void;
  onSearch: () => void;
}

function FilterBar(props: FilterBarProps): ReactElement {
  const { filters, setFilters, search, setSearch, onSearch } = props;
  const update = <K extends keyof Filters>(k: K, v: Filters[K]): void =>
    setFilters({ ...filters, [k]: v });
  const inputStyle = {
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: 13,
  };
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        marginBottom: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      <input
        placeholder="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        style={inputStyle}
      />
      <select
        value={filters.country}
        onChange={(e) => update('country', e.target.value)}
        style={inputStyle}
      >
        <option value="">Any country</option>
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {c.toUpperCase()}
          </option>
        ))}
      </select>
      <select
        value={filters.seniority}
        onChange={(e) => update('seniority', e.target.value)}
        style={inputStyle}
      >
        <option value="">Any seniority</option>
        {SENIORITY_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.replace('_', ' ')}
          </option>
        ))}
      </select>
      <input
        placeholder="Industry tag (e.g. fintech)"
        value={filters.industry}
        onChange={(e) => update('industry', e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder="Interest tag (e.g. LLMs)"
        value={filters.interest}
        onChange={(e) => update('interest', e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder="Current employer"
        value={filters.employer}
        onChange={(e) => update('employer', e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder="Attended at least N events"
        type="number"
        min="0"
        value={filters.attendedMin}
        onChange={(e) => update('attendedMin', e.target.value)}
        style={inputStyle}
      />
      <select
        value={filters.consent}
        onChange={(e) => update('consent', e.target.value)}
        style={inputStyle}
      >
        <option value="">Any consent</option>
        {CONSENT_PURPOSES.map((p) => (
          <option key={p} value={p}>
            consent: {p}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onSearch}
        className="btn btn-primary"
        style={{ gridColumn: '1 / -1', justifySelf: 'start' }}
      >
        Search
      </button>
    </div>
  );
}

function CohortList({
  cohorts,
  onClick,
}: { cohorts: Cohort[]; onClick: (c: Cohort) => void }): ReactElement {
  return (
    <aside
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        position: 'sticky',
        top: 80,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: '0 0 12px',
        }}
      >
        Saved cohorts
      </p>
      {cohorts.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          Build your first cohort to target announcements precisely.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {cohorts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onClick(c)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {c.member_count_cached} members
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface ResultsTableProps {
  results: SearchResult | null;
  searching: boolean;
  hasFilter: boolean;
  onSaveAsCohort: () => void;
}

function ResultsTable(props: ResultsTableProps): ReactElement {
  const { results, searching, hasFilter, onSaveAsCohort } = props;
  if (searching && !results) return <p style={{ color: 'var(--muted-foreground)' }}>Searching…</p>;
  if (!results) {
    return (
      <p style={{ color: 'var(--muted-foreground)' }}>Use the filters above to find members.</p>
    );
  }
  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>
          {results.total} member{results.total === 1 ? '' : 's'}
        </h2>
        {hasFilter && results.total > 0 && (
          <button type="button" onClick={onSaveAsCohort} className="btn btn-primary">
            Save as cohort
          </button>
        )}
      </div>
      {results.total === 0 ? (
        <p style={{ color: 'var(--muted-foreground)' }}>
          No members match. Loosen the filters and try again.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Email</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>City</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Industry</th>
            </tr>
          </thead>
          <tbody>
            {results.members.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 4px' }}>{m.display_name ?? m.first_name ?? '—'}</td>
                <td style={{ padding: '8px 4px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {m.email}
                </td>
                <td style={{ padding: '8px 4px' }}>
                  {m.job_title ?? '—'}
                  {m.seniority && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      ({m.seniority})
                    </span>
                  )}
                </td>
                <td style={{ padding: '8px 4px' }}>{m.city ?? '—'}</td>
                <td style={{ padding: '8px 4px' }}>
                  {m.industry && m.industry.length > 0 ? m.industry.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface SaveCohortModalProps {
  filter: Record<string, unknown>;
  accessToken: string | null;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
  saving: boolean;
}

function SaveCohortModal(props: SaveCohortModalProps): ReactElement {
  const { filter, accessToken, onClose, onSave, saving } = props;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const fetchPreview = async (): Promise<void> => {
      const params = new URLSearchParams();
      params.set('filter', JSON.stringify(filter));
      params.set('limit', '1');
      const res = await fetch(`/api/v1/workspace/members?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { total: number };
        setPreviewCount(data.total);
      }
    };
    void fetchPreview();
  }, [accessToken, filter]);

  // Esc closes the modal; click outside the panel closes it too.
  // Backdrop is a real <button> so click + keyboard (Enter/Space) both
  // work natively + screen readers identify it as actionable.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="save-cohort-title"
        style={{
          position: 'relative',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxWidth: '90vw',
        }}
      >
        <h2
          id="save-cohort-title"
          style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 12px' }}
        >
          Save this filter as a cohort
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
          Name this cohort so you can reuse it. This cohort currently includes{' '}
          <strong>{previewCount ?? '…'} people</strong>.
        </p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Cohort name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 'UZ fintech CEOs Q3'"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: 4,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--background)',
              color: 'var(--foreground)',
            }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What's this cohort for?"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: 4,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontFamily: 'inherit',
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || name.trim().length === 0}
            onClick={() => void onSave(name.trim(), description.trim())}
            className="btn btn-primary"
          >
            {saving ? 'Saving…' : 'Save cohort'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
