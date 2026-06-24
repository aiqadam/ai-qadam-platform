'use client';

// L2 marketing island — <UtmUrlBuilder>.
//
// FR-MIG-023 — UTM URL builder for marketing operators. Pure client-side:
// typing previews the URL live; Copy copies to clipboard. No server
// round-trips.
//
// ADR-0038 §Locks #1: uses Tailwind classes only. No inline style=.

import {
  type BuildError,
  type BuildInput,
  UTM_CAMPAIGN_SUGGESTIONS,
  UTM_MEDIUMS,
  UTM_MEDIUM_LABELS,
  UTM_SOURCE_SUGGESTIONS,
  buildUtmUrl,
  type UtmMedium,
} from '@/lib/utm';
import { IslandRoot } from '@/lib/island-root';
import { type ReactElement, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }): ReactElement {
  return <div className="rounded-xl border border-border bg-card">{children}</div>;
}

interface FieldProps {
  id: string;
  label: string;
  help: string;
  error: string | undefined;
  children: ReactElement | ReactElement[];
}

function Field({ id, label, help, error, children }: FieldProps): ReactElement {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-destructive">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UtmUrlBuilder(): ReactElement {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

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
    <IslandRoot>
      <Panel>
        <div className="space-y-5 p-8">
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
              placeholder="https://uz.aiqadam.org/events/12"
              value={form.destinationUrl}
              onChange={(e) => update('destinationUrl', e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fieldError(errors, 'destinationUrl')
                  ? 'border-destructive focus-visible:ring-destructive'
                  : 'border-input'
              }`}
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
              placeholder="binali-li"
              value={form.source}
              onChange={(e) => update('source', e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fieldError(errors, 'source')
                  ? 'border-destructive focus-visible:ring-destructive'
                  : 'border-input'
              }`}
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
              value={form.medium}
              onChange={(e) => update('medium', e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fieldError(errors, 'medium')
                  ? 'border-destructive focus-visible:ring-destructive'
                  : 'border-input'
              }`}
            >
              <option value="">Pick a medium...</option>
              {UTM_MEDIUMS.map((m) => (
                <option key={m} value={m}>
                  {m} — {UTM_MEDIUM_LABELS[m as UtmMedium]}
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
              placeholder="event-12"
              value={form.campaign}
              onChange={(e) => update('campaign', e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fieldError(errors, 'campaign')
                  ? 'border-destructive focus-visible:ring-destructive'
                  : 'border-input'
              }`}
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
              placeholder="headline-a"
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fieldError(errors, 'content')
                  ? 'border-destructive focus-visible:ring-destructive'
                  : 'border-input'
              }`}
            />
          </Field>

          {/* URL Preview */}
          <div
            aria-live="polite"
            className="rounded-lg border border-border bg-muted p-5"
          >
            <div className="mb-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tagged URL
            </div>
            {result.ok ? (
              <>
                <code className="mb-4 block break-all font-mono text-sm leading-relaxed">
                  {result.url}
                </code>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    Reset
                  </button>
                  {copyStatus === 'copied' && (
                    <span className="text-sm text-green-600 dark:text-green-400">
                      Copied.
                    </span>
                  )}
                  {copyStatus === 'failed' && (
                    <span className="text-sm text-destructive">
                      Browser blocked the copy — select the URL and copy manually.
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fill in destination, source, medium, and campaign — the tagged URL appears here.
              </p>
            )}
          </div>
        </div>
      </Panel>
    </IslandRoot>
  );
}
