import { type FormEvent, type ReactElement, useState } from 'react';

// F-S1.6 — lead capture form (anonymous, no auth required).
//
// POSTs to /api/v1/leads. Server schema (leads.controller.ts):
//   email (required) | city | interestTopics[] | sourceUrl | honeypot | acquisitionSource
// On success → inline thank-you message (we don't navigate so the page
// keeps its hero context). On dupe / already-member the API also returns
// 202 to keep the UX uniform; the user sees the same confirmation.
//
// ADR-0038 §Locks #2: uses apiClient (not raw fetch).

// arch-ignore: no-api-import-in-blocks — apiClient is the approved abstraction here (not raw fetch)
import { apiClient } from '@/lib/api-client';

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
  await apiClient<void>('/v1/leads', {
    method: 'POST',
    body: body as unknown as Record<string, unknown>,
  });
}

interface TopicChipProps {
  topic: string;
  selected: boolean;
  onToggle: () => void;
}

function TopicChip({ topic, selected, onToggle }: TopicChipProps): ReactElement {
  const chipClass = selected
    ? 'bg-primary text-primary-foreground border-primary'
    : 'bg-transparent text-foreground border-border';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`px-3 py-1.5 rounded-full border text-xs font-mono cursor-pointer ${chipClass}`}
    >
      {topic}
    </button>
  );
}

interface Translations {
  heading: string;
  subheading: string;
  email_label: string;
  email_placeholder: string;
  city_label: string;
  city_placeholder: string;
  topics_label: string;
  submit_idle: string;
  submit_pending: string;
  submit_error_fallback: string;
  success_heading: string;
  success_body: string;
}

function SuccessPanel({ t }: { t: Translations }): ReactElement {
  return (
    <div className="p-6 border border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] rounded-xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] text-center">
      <p className="font-display font-semibold text-lg mb-1.5">{t.success_heading}</p>
      <p className="text-[13px] text-muted-foreground m-0">{t.success_body}</p>
    </div>
  );
}

interface TopicsFieldProps {
  topics: string[];
  onToggle: (topic: string) => void;
  label: string;
}

function TopicsField({ topics, onToggle, label }: TopicsFieldProps): ReactElement {
  return (
    <fieldset className="border-none p-0 m-0">
      <legend className="text-[13px] text-muted-foreground mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {INTEREST_PRESETS.map((topic) => (
          <TopicChip
            key={topic}
            topic={topic}
            selected={topics.includes(topic)}
            onToggle={() => onToggle(topic)}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface FieldsProps {
  form: FormState;
  setForm: (next: FormState) => void;
  disabled: boolean;
  t: Translations;
}

function Fields({ form, setForm, disabled, t }: FieldsProps): ReactElement {
  const toggleTopic = (topic: string) => {
    const next = form.topics.includes(topic)
      ? form.topics.filter((existing) => existing !== topic)
      : [...form.topics, topic];
    setForm({ ...form, topics: next });
  };
  return (
    <div className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{t.email_label}</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          disabled={disabled}
          placeholder={t.email_placeholder}
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{t.city_label}</span>
        <input
          type="text"
          list="lead-city-presets"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          disabled={disabled}
          placeholder={t.city_placeholder}
          maxLength={80}
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
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
      <TopicsField topics={form.topics} onToggle={toggleTopic} label={t.topics_label} />
      <input
        type="text"
        name="company"
        value={form.honeypot}
        onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="sr-only"
      />
    </div>
  );
}

export function LeadCaptureForm({ t }: { t: Translations }): ReactElement {
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
      setErrorMsg(err instanceof Error ? err.message : t.submit_error_fallback);
    }
  };

  if (phase === 'success') return <SuccessPanel t={t} />;
  return (
    <form
      onSubmit={onSubmit}
      className="p-6 border border-border rounded-xl bg-card flex flex-col gap-4 relative"
    >
      <div>
        <h3 className="font-display font-semibold text-lg mb-1">{t.heading}</h3>
        <p className="text-[13px] text-muted-foreground m-0">{t.subheading}</p>
      </div>
      <Fields form={form} setForm={setForm} disabled={phase === 'submitting'} t={t} />
      {phase === 'error' && <p className="text-xs text-destructive m-0">{errorMsg}</p>}
      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={phase === 'submitting' || form.email.trim().length === 0}
      >
        {phase === 'submitting' ? t.submit_pending : t.submit_idle}
      </button>
    </form>
  );
}
