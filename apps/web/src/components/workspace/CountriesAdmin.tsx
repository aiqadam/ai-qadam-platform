import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// F-S4.5 — country profile cabinet. Lists countries, lets super_admin
// edit locale / currency / channel / public holidays per country.
// Non-super_admin operators see the same table read-only (no edit form
// rendered; save endpoint would 403 anyway).

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/countries'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

interface PublicHoliday {
  date: string;
  label: string;
}
interface CountryRow {
  code: string;
  name: string;
  name_ru: string | null;
  tz: string;
  is_active: boolean;
  default_locale: string;
  currency_code: string;
  public_holidays: PublicHoliday[];
  default_reminder_channel: string;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string; countries: CountryRow[] };

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'uz-Latn', label: 'Uzbek (Latin)' },
  { value: 'uz-Cyrl', label: 'Uzbek (Cyrillic)' },
  { value: 'tg', label: 'Tajik' },
];
const CURRENCIES = ['USD', 'UZS', 'KZT', 'KGS', 'TJS', 'EUR'];
const CHANNELS = [
  { value: 'email', label: 'Email first' },
  { value: 'telegram', label: 'Telegram first (fallback email)' },
];

type SaveOutcome = { kind: 'ok'; row: CountryRow } | { kind: 'error'; message: string };

async function saveCountry(
  code: string,
  accessToken: string,
  patch: Record<string, unknown>,
): Promise<SaveOutcome> {
  const res = await fetch(`/api/v1/admin/countries/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  if (res.status === 403) {
    return {
      kind: 'error',
      message: 'Super-admin only — your account cannot edit country profiles.',
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return { kind: 'error', message: `Save failed (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
  return { kind: 'ok', row: (await res.json()) as CountryRow };
}

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const res = await fetch('/api/v1/workspace/countries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { countries } = (await res.json()) as { countries: CountryRow[] };
  return { phase: 'ready', accessToken, countries };
}

export default function CountriesAdmin(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'probe_error')
    return <p style={mutedStyle()}>Backend error (HTTP {state.httpStatus}).</p>;

  function onCountryUpdated(updated: CountryRow): void {
    if (state.phase !== 'ready') return;
    setState({
      ...state,
      countries: state.countries.map((c) => (c.code === updated.code ? updated : c)),
    });
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle()}>Code</th>
            <th style={thStyle()}>Name</th>
            <th style={thStyle()}>Locale</th>
            <th style={thStyle()}>Currency</th>
            <th style={thStyle()}>Reminder channel</th>
            <th style={thStyle()}>TZ</th>
            <th style={thStyle()}>Holidays</th>
            <th style={thStyle()} />
          </tr>
        </thead>
        <tbody>
          {state.countries.map((c) => {
            const isOpen = expanded === c.code;
            return (
              <>
                <tr
                  key={c.code}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: c.is_active ? 1 : 0.5,
                  }}
                >
                  <td style={tdMono()}>{c.code}</td>
                  <td style={tdStyle()}>{c.name}</td>
                  <td style={tdStyle()}>{c.default_locale}</td>
                  <td style={tdMono()}>{c.currency_code}</td>
                  <td style={tdStyle()}>{c.default_reminder_channel}</td>
                  <td style={tdMono()}>{c.tz}</td>
                  <td style={tdStyle()}>{c.public_holidays.length}</td>
                  <td style={tdStyle()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        className="btn"
                        href={`/workspace/admin/countries/${encodeURIComponent(c.code)}/provisioning`}
                        style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                        title="Run the F-S4.1 provisioning state machine"
                      >
                        Provision
                      </a>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setExpanded(isOpen ? null : c.code)}
                      >
                        {isOpen ? 'Close' : 'Edit'}
                      </button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${c.code}-edit`}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <EditForm
                        country={c}
                        accessToken={state.accessToken}
                        onSaved={onCountryUpdated}
                        onClose={() => setExpanded(null)}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface EditFormProps {
  country: CountryRow;
  accessToken: string;
  onSaved: (next: CountryRow) => void;
  onClose: () => void;
}

function EditForm({ country, accessToken, onSaved, onClose }: EditFormProps): ReactElement {
  const [locale, setLocale] = useState(country.default_locale);
  const [currency, setCurrency] = useState(country.currency_code);
  const [channel, setChannel] = useState(country.default_reminder_channel);
  const [tz, setTz] = useState(country.tz);
  const [holidays, setHolidays] = useState<PublicHoliday[]>(country.public_holidays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const outcome = await saveCountry(country.code, accessToken, {
        default_locale: locale,
        currency_code: currency,
        default_reminder_channel: channel,
        tz,
        public_holidays: holidays.filter((h) => h.date && h.label),
      });
      if (outcome.kind === 'error') {
        setError(outcome.message);
        return;
      }
      onSaved({ ...outcome.row, public_holidays: outcome.row.public_holidays ?? [] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  function addHoliday(): void {
    setHolidays([...holidays, { date: '', label: '' }]);
  }
  function removeHoliday(idx: number): void {
    setHolidays(holidays.filter((_, i) => i !== idx));
  }
  function updateHoliday(idx: number, patch: Partial<PublicHoliday>): void {
    setHolidays(holidays.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: 16,
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <label style={labelStyle()}>
          Default locale
          <select value={locale} onChange={(e) => setLocale(e.target.value)} style={selectStyle()}>
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle()}>
          Currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={selectStyle()}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle()}>
          Reminder channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            style={selectStyle()}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle()}>
          Timezone (IANA)
          <input
            type="text"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Asia/Tashkent"
            style={inputStyle()}
          />
        </label>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            Public holidays ({holidays.length})
          </span>
          <button
            type="button"
            onClick={addHoliday}
            className="btn"
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            + add
          </button>
        </div>
        {holidays.map((h, i) => (
          <div
            key={`h-${i}-${h.date}`}
            style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}
          >
            <input
              type="date"
              value={h.date}
              onChange={(e) => updateHoliday(i, { date: e.target.value })}
              style={{ ...inputStyle(), width: 140 }}
            />
            <input
              type="text"
              value={h.label}
              onChange={(e) => updateHoliday(i, { label: e.target.value })}
              placeholder="Holiday name"
              style={{ ...inputStyle(), flex: 1 }}
            />
            <button
              type="button"
              onClick={() => removeHoliday(i)}
              className="btn"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {error && <p style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function mutedStyle(): Record<string, string | number> {
  return { fontSize: 14, color: 'var(--muted-foreground)' };
}
function thStyle(): Record<string, string | number> {
  return { padding: '8px 6px', fontWeight: 600, fontSize: 12, color: 'var(--muted-foreground)' };
}
function tdStyle(): Record<string, string | number> {
  return { padding: '8px 6px' };
}
function tdMono(): Record<string, string | number> {
  return { padding: '8px 6px', fontFamily: 'var(--font-mono)' };
}
function labelStyle(): Record<string, string | number> {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    color: 'var(--muted-foreground)',
  };
}
function inputStyle(): Record<string, string | number> {
  return {
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: 14,
  };
}
function selectStyle(): Record<string, string | number> {
  return { ...inputStyle() };
}
