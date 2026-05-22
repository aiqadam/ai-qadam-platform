import { type FormEvent, type ReactElement, useState } from 'react';

// F-S1.6 — lead capture form (anonymous, no auth required).
//
// POSTs to /api/v1/leads. Server schema (leads.controller.ts):
//   email (required) | city | interestTopics[] | sourceUrl | honeypot | acquisitionSource
// On success → inline thank-you message (we don't navigate so the page
// keeps its hero context). On dupe / already-member the API also returns
// 202 to keep the UX uniform; the user sees the same confirmation.

const INTEREST_PRESETS = [
  'AI/ML',
  'LLMs',
  'fintech',
  'robotics',
  'devtools',
  'infra',
  'data',
  'computer-vision',
  'nlp',
  'mlops',
  'hands-on-builder',
] as const;

type Phase = 'idle' | 'submitting' | 'success' | 'error';

interface FormState {
  email: string;
  city: string;
  topics: string[];
  honeypot: string;
}

const EMPTY: FormState = { email: '', city: '', topics: [], honeypot: '' };

interface LeadRequestBody {
  email: string;
  honeypot: string;
  city?: string;
  interestTopics?: string[];
  sourceUrl?: string;
  acquisitionSource?: { first_touch: Record<string, string> };
}

function readUtmFirstTouch(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = params.get(key);
    if (v) utm[key] = v;
  }
  if (Object.keys(utm).length === 0) return null;
  return { ...utm, ts: new Date().toISOString() };
}

async function submitLead(form: FormState): Promise<void> {
  const firstTouch = readUtmFirstTouch();
  const body: LeadRequestBody = {
    email: form.email.trim(),
    honeypot: form.honeypot,
    ...(form.city.trim() ? { city: form.city.trim() } : {}),
    ...(form.topics.length > 0 ? { interestTopics: form.topics } : {}),
    ...(typeof window !== 'undefined' ? { sourceUrl: window.location.href } : {}),
    ...(firstTouch ? { acquisitionSource: { first_touch: firstTouch } } : {}),
  };
  const res = await fetch('/api/v1/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/v1/leads → ${res.status}`);
}

interface TopicChipProps {
  topic: string;
  selected: boolean;
  onToggle: () => void;
}

function TopicChip({ topic, selected, onToggle }: TopicChipProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        padding: '6px 12px',
        borderRadius: 20,
        border: '1px solid var(--border)',
        background: selected ? 'var(--primary)' : 'transparent',
        color: selected ? 'var(--primary-foreground)' : 'var(--foreground)',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
      }}
    >
      {topic}
    </button>
  );
}

function SuccessPanel(): ReactElement {
  return (
    <div
      style={{
        padding: 24,
        border: '1px solid color-mix(in oklch, var(--primary) 40%, var(--border))',
        borderRadius: 12,
        background: 'color-mix(in oklch, var(--primary) 8%, var(--card))',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 18,
          margin: '0 0 6px',
        }}
      >
        Check your inbox
      </p>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        We just sent a confirmation link. Click it to start receiving event updates.
      </p>
    </div>
  );
}

interface FieldsProps {
  form: FormState;
  setForm: (next: FormState) => void;
  disabled: boolean;
}

function Fields({ form, setForm, disabled }: FieldsProps): ReactElement {
  const toggleTopic = (topic: string) => {
    const next = form.topics.includes(topic)
      ? form.topics.filter((t) => t !== topic)
      : [...form.topics, topic];
    setForm({ ...form, topics: next });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          disabled={disabled}
          placeholder="you@domain.com"
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>City (optional)</span>
        <input
          type="text"
          list="lead-city-presets"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          disabled={disabled}
          placeholder="Tashkent, Almaty, Dushanbe…"
          maxLength={80}
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        />
        <datalist id="lead-city-presets">
          <option value="Tashkent" />
          <option value="Samarkand" />
          <option value="Almaty" />
          <option value="Astana" />
          <option value="Dushanbe" />
          <option value="Khujand" />
        </datalist>
      </label>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 8 }}>
          Topics you care about (optional)
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {INTEREST_PRESETS.map((t) => (
            <TopicChip
              key={t}
              topic={t}
              selected={form.topics.includes(t)}
              onToggle={() => toggleTopic(t)}
            />
          ))}
        </div>
      </fieldset>
      <input
        type="text"
        name="company"
        value={form.honeypot}
        onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
      />
    </div>
  );
}

export function LeadCaptureForm(): ReactElement {
  const [phase, setPhase] = useState<Phase>('idle');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setPhase('submitting');
    setErrorMsg('');
    try {
      await submitLead(form);
      setPhase('success');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'submit failed');
    }
  };

  if (phase === 'success') return <SuccessPanel />;
  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: 24,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        position: 'relative',
      }}
    >
      <div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 18,
            margin: '0 0 4px',
          }}
        >
          Get events in your city
        </h3>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          Monthly digest. No spam. Unsubscribe in one click.
        </p>
      </div>
      <Fields form={form} setForm={setForm} disabled={phase === 'submitting'} />
      {phase === 'error' && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: 0 }}>{errorMsg}</p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={phase === 'submitting' || form.email.trim().length === 0}
        style={{ alignSelf: 'flex-start' }}
      >
        {phase === 'submitting' ? 'Sending…' : 'Send me a confirmation'}
      </button>
    </form>
  );
}
