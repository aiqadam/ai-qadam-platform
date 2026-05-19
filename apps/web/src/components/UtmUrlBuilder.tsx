import { type ReactElement, useMemo, useState } from 'react';
import {
  type BuildError,
  type BuildInput,
  UTM_CAMPAIGN_SUGGESTIONS,
  UTM_MEDIUMS,
  UTM_MEDIUM_LABELS,
  UTM_SOURCE_SUGGESTIONS,
  buildUtmUrl,
} from '../lib/utm';

// Marketing URL builder — Sprint 0.8.
//
// The single supported way for operators to construct UTM-tagged links.
// Pure client-side: typing previews the URL live; "Copy" copies to the
// clipboard. No server round-trips, no analytics — the page is meta.
// Errors render under each field; the result block stays hidden until
// all four required fields validate.

interface FormState {
  destinationUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

const INITIAL: FormState = {
  destinationUrl: '',
  source: '',
  medium: '',
  campaign: '',
  content: '',
};

type CopyStatus = 'idle' | 'copied' | 'failed';

function fieldError(
  errors: BuildError['fieldErrors'] | null,
  key: keyof FormState,
): string | undefined {
  if (errors && key in errors) return errors[key as keyof BuildError['fieldErrors']];
  return undefined;
}

export function UtmUrlBuilder(): ReactElement {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

  // Recompute every render. The work is cheap (one URL parse + a few
  // regex checks) and avoids the useEffect / useReducer ceremony.
  const result = useMemo(() => {
    const input: BuildInput = {
      destinationUrl: form.destinationUrl,
      source: form.source,
      medium: form.medium,
      campaign: form.campaign,
    };
    if (form.content.length > 0) input.content = form.content;
    return buildUtmUrl(input);
  }, [form]);

  const errors = result.ok ? null : result.fieldErrors;

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (copyStatus !== 'idle') setCopyStatus('idle');
  }

  async function onCopy(): Promise<void> {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  function onReset(): void {
    setForm(INITIAL);
    setCopyStatus('idle');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          id="destination-url"
          label="Destination URL"
          help="The page on aiqadam.org you're sending people to. Must start with https://."
          error={fieldError(errors, 'destinationUrl')}
        >
          <input
            id="destination-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            className={`input${fieldError(errors, 'destinationUrl') ? ' error' : ''}`}
            placeholder="https://uz.aiqadam.org/events/12"
            value={form.destinationUrl}
            onChange={(e) => update('destinationUrl', e.target.value)}
          />
        </Field>

        <Field
          id="utm-source"
          label="utm_source"
          help="The account or channel that drove the click. Pick from the list or type a sponsor/speaker/member slug."
          error={fieldError(errors, 'source')}
        >
          <input
            id="utm-source"
            type="text"
            list="utm-source-suggestions"
            autoComplete="off"
            spellCheck={false}
            className={`input${fieldError(errors, 'source') ? ' error' : ''}`}
            placeholder="binali-li"
            value={form.source}
            onChange={(e) => update('source', e.target.value)}
          />
          <datalist id="utm-source-suggestions">
            {UTM_SOURCE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <Field
          id="utm-medium"
          label="utm_medium"
          help="The channel type. Canonical list — adding a new one needs an ADR."
          error={fieldError(errors, 'medium')}
        >
          <select
            id="utm-medium"
            className={`input${fieldError(errors, 'medium') ? ' error' : ''}`}
            value={form.medium}
            onChange={(e) => update('medium', e.target.value)}
          >
            <option value="">Pick a medium…</option>
            {UTM_MEDIUMS.map((m) => (
              <option key={m} value={m}>
                {m} — {UTM_MEDIUM_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="utm-campaign"
          label="utm_campaign"
          help="The specific event or campaign. e.g. event-12, quarterly-digest-q2-26, country-launch-kz."
          error={fieldError(errors, 'campaign')}
        >
          <input
            id="utm-campaign"
            type="text"
            list="utm-campaign-suggestions"
            autoComplete="off"
            spellCheck={false}
            className={`input${fieldError(errors, 'campaign') ? ' error' : ''}`}
            placeholder="event-12"
            value={form.campaign}
            onChange={(e) => update('campaign', e.target.value)}
          />
          <datalist id="utm-campaign-suggestions">
            {UTM_CAMPAIGN_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field
          id="utm-content"
          label="utm_content (optional)"
          help="Only set this when running an A/B test. e.g. headline-a, image-v2."
          error={fieldError(errors, 'content')}
        >
          <input
            id="utm-content"
            type="text"
            autoComplete="off"
            spellCheck={false}
            className={`input${fieldError(errors, 'content') ? ' error' : ''}`}
            placeholder="headline-a"
            value={form.content}
            onChange={(e) => update('content', e.target.value)}
          />
        </Field>
      </section>

      <section
        aria-live="polite"
        style={{
          padding: 20,
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Tagged URL
        </div>
        {result.ok ? (
          <>
            <code
              style={{
                wordBreak: 'break-all',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                color: 'var(--foreground)',
                lineHeight: 1.5,
              }}
            >
              {result.url}
            </code>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={onCopy}>
                Copy URL
              </button>
              <button type="button" className="btn btn-ghost" onClick={onReset}>
                Reset
              </button>
              {copyStatus === 'copied' && (
                <span className="helper" style={{ margin: 0 }}>
                  Copied.
                </span>
              )}
              {copyStatus === 'failed' && (
                <span className="helper error" style={{ margin: 0 }}>
                  Browser blocked the copy — select the URL and copy manually.
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="helper" style={{ margin: 0 }}>
            Fill in destination, source, medium, and campaign — the tagged URL appears here.
          </p>
        )}
      </section>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  help: string;
  // `error` is undefined when the field is valid; explicit `| undefined`
  // because tsconfig has `exactOptionalPropertyTypes: true`.
  error: string | undefined;
  children: ReactElement | ReactElement[];
}

function Field({ id, label, help, error, children }: FieldProps): ReactElement {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="helper error">{error}</p>
      ) : help ? (
        <p className="helper">{help}</p>
      ) : null}
    </div>
  );
}
