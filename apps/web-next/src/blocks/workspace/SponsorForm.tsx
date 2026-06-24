// L3 workspace block — <SponsorForm>.
//
// Create/edit sponsor record. Fields: name, tier (select), website,
// custom message, logo (file upload → MinIO via /v1/admin/uploads),
// event associations (multi-select via <AsyncSelect>).
//
// Props:
//   sponsorId?: string — if present, loads the existing sponsor and
//   PATCHes on save; if absent, creates a new record via POST.
//
// FR-MIG-025. Auth gate is in the parent .astro pages.

import { AsyncSelect, type AsyncSelectOption } from '@/blocks/workspace/AsyncSelect';
import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { SPONSOR_TIERS, type SponsorTier } from '@/lib/types';
import {
  useCreateSponsor,
  useSponsorDetail,
  useUpdateSponsor,
  useUploadLogo,
} from '@/lib/use-sponsors';
import { useWorkspaceEvents } from '@/lib/use-workspace-events';
import { Loader2, X } from 'lucide-react';
import { type ChangeEvent, type ReactElement, type ReactNode, useEffect, useState } from 'react';

// ─── Field wrapper ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
}

function Field({ label, htmlFor, children, hint, error, required }: FieldProps): ReactElement {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10px] uppercase tracking-wider text-foreground"
      >
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground m-0">{hint}</p>}
      {error && <p className="text-xs text-destructive m-0">{error}</p>}
    </div>
  );
}

// ─── Logo upload ───────────────────────────────────────────────────────────────

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

function validateLogoFile(file: File): string | null {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return 'Only PNG, JPEG, SVG, or WebP files are allowed.';
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return 'File must be under 2 MB.';
  }
  return null;
}

interface LogoUploadProps {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  onClear: () => void;
  disabled: boolean;
}

function LogoUpload({ currentUrl, onUploaded, onClear, disabled }: LogoUploadProps): ReactElement {
  const uploadMutation = useUploadLogo();
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    try {
      const result = await uploadMutation.mutateAsync(file);
      onUploaded(result.url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  return (
    <div className="space-y-2">
      {currentUrl && (
        <div className="flex items-center gap-3">
          <img
            src={currentUrl}
            alt="Current sponsor logo"
            className="h-10 w-auto max-w-[120px] object-contain rounded border border-border p-1"
          />
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            aria-label="Remove logo"
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <label
          htmlFor="logo-upload"
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted transition-colors ${disabled || uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {uploadMutation.isPending ? 'Uploading…' : currentUrl ? 'Replace' : 'Choose file'}
        </label>
        <input
          id="logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="sr-only"
          disabled={disabled || uploadMutation.isPending}
          onChange={handleFileChange}
        />
        <span className="text-xs text-muted-foreground">PNG, JPEG, SVG, or WebP · max 2 MB</span>
      </div>
      {localError && <p className="text-xs text-destructive">{localError}</p>}
    </div>
  );
}

// ─── Event association multi-select ───────────────────────────────────────────

interface EventPickerProps {
  selected: AsyncSelectOption[];
  onAdd: (opt: AsyncSelectOption) => void;
  onRemove: (value: string) => void;
  disabled: boolean;
}

function EventPicker({ selected, onAdd, onRemove, disabled }: EventPickerProps): ReactElement {
  const eventsQuery = useWorkspaceEvents();

  async function loadOptions(input: string): Promise<AsyncSelectOption[]> {
    const events = eventsQuery.data?.events ?? [];
    const lower = input.toLowerCase();
    const filtered = lower.length === 0
      ? events
      : events.filter((e) => e.title.toLowerCase().includes(lower));
    const selectedIds = new Set(selected.map((s) => s.value));
    return filtered
      .filter((e) => !selectedIds.has(e.id))
      .slice(0, 20)
      .map((e) => ({ value: e.id, label: e.title }));
  }

  function handleChange(opt: AsyncSelectOption | null): void {
    if (opt) onAdd(opt);
  }

  return (
    <div className="space-y-2">
      <AsyncSelect
        loadOptions={loadOptions}
        value={null}
        onChange={handleChange}
        placeholder="Search events…"
        loadOptionsOnMount
        disabled={disabled}
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {opt.label}
              <button
                type="button"
                onClick={() => onRemove(opt.value)}
                disabled={disabled}
                aria-label={`Remove ${opt.label}`}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tier select ──────────────────────────────────────────────────────────────

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  tier: SponsorTier;
  website: string;
  customMessage: string;
  logoUrl: string | null;
  eventLinks: AsyncSelectOption[];
}

const DEFAULT_STATE: FormState = {
  name: '',
  tier: 'bronze',
  website: '',
  customMessage: '',
  logoUrl: null,
  eventLinks: [],
};

interface FormErrors {
  name?: string;
  website?: string;
}

function validateForm(state: FormState): FormErrors {
  const errors: FormErrors = {};
  if (state.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (state.website && !/^https?:\/\/.+/.test(state.website)) {
    errors.website = 'Must be a valid URL starting with http:// or https://';
  }
  return errors;
}

// ─── Submit helper ────────────────────────────────────────────────────────────

function buildPayload(state: FormState) {
  return {
    name: state.name.trim(),
    tier: state.tier,
    website: state.website.trim() || null,
    logo_url: state.logoUrl,
    custom_message: state.customMessage.trim() || null,
    event_ids: state.eventLinks.map((e) => e.value),
  };
}

// ─── Loading/error guards ──────────────────────────────────────────────────────

function LoadingState(): ReactElement {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

function ErrorState({ message }: { message: string }): ReactElement {
  return <p className="text-sm text-destructive">Failed to load sponsor: {message}</p>;
}

// ─── Inner form ──────────────────────────────────────────────────────────────

interface SponsorFormInnerProps {
  sponsorId?: string | undefined;
}

// ─── Form fields sub-component (extracted to keep SponsorFormInner ≤10) ───────

interface SponsorFormFieldsProps {
  state: FormState;
  errors: FormErrors;
  isPending: boolean;
  isEdit: boolean;
  mutationError: Error | null;
  saved: boolean;
  onNameChange: (v: string) => void;
  onTierChange: (v: SponsorTier) => void;
  onWebsiteChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onLogoUploaded: (url: string) => void;
  onLogoClear: () => void;
  onEventAdd: (opt: AsyncSelectOption) => void;
  onEventRemove: (value: string) => void;
}

function SponsorFormFields({
  state,
  errors,
  isPending,
  isEdit,
  mutationError,
  saved,
  onNameChange,
  onTierChange,
  onWebsiteChange,
  onMessageChange,
  onLogoUploaded,
  onLogoClear,
  onEventAdd,
  onEventRemove,
}: SponsorFormFieldsProps): ReactElement {
  return (
    <>
      <Field label="Name" htmlFor="sponsor-name" required error={errors.name}>
        <Input
          id="sponsor-name"
          type="text"
          value={state.name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={isPending}
          placeholder="Acme Corp"
          className={errors.name ? 'border-destructive' : ''}
        />
      </Field>

      <Field label="Tier" htmlFor="sponsor-tier" required>
        <select
          id="sponsor-tier"
          value={state.tier}
          onChange={(e) => onTierChange(e.target.value as SponsorTier)}
          disabled={isPending}
          className={SELECT_CLASS}
        >
          {SPONSOR_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Website" htmlFor="sponsor-website" error={errors.website}>
        <Input
          id="sponsor-website"
          type="url"
          value={state.website}
          onChange={(e) => onWebsiteChange(e.target.value)}
          disabled={isPending}
          placeholder="https://example.com"
          className={errors.website ? 'border-destructive' : ''}
        />
      </Field>

      <Field
        label="Custom message"
        htmlFor="sponsor-message"
        hint="Shown on event pages alongside the logo."
      >
        <textarea
          id="sponsor-message"
          value={state.customMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          disabled={isPending}
          rows={3}
          placeholder="Gold sponsor of AI Qadam UZ"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </Field>

      <Field label="Logo" htmlFor="logo-upload" hint="Stored in MinIO.">
        <LogoUpload
          currentUrl={state.logoUrl}
          onUploaded={onLogoUploaded}
          onClear={onLogoClear}
          disabled={isPending}
        />
      </Field>

      <Field
        label="Event associations"
        htmlFor="event-picker"
        hint="Select events to link this sponsor."
      >
        <EventPicker
          selected={state.eventLinks}
          onAdd={onEventAdd}
          onRemove={onEventRemove}
          disabled={isPending}
        />
      </Field>

      {mutationError && <p className="text-sm text-destructive">{mutationError.message}</p>}
      {saved && <p className="text-sm text-primary">Sponsor saved successfully.</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          {!isPending && (isEdit ? 'Save changes' : 'Create sponsor')}
          {isPending && 'Saving…'}
        </Button>
        <a
          href="/workspace/sponsors"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </a>
      </div>
    </>
  );
}

function SponsorFormInner({ sponsorId }: SponsorFormInnerProps): ReactElement {
  const isEdit = sponsorId !== undefined && sponsorId.length > 0;

  const detailQuery = useSponsorDetail(sponsorId ?? '');
  const createMutation = useCreateSponsor();
  const updateMutation = useUpdateSponsor();

  const [state, setState] = useState<FormState>(DEFAULT_STATE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!detailQuery.data) return;
    const d = detailQuery.data;
    setState({
      name: d.name,
      tier: d.tier,
      website: d.website ?? '',
      customMessage: d.custom_message ?? '',
      logoUrl: d.logo_url,
      eventLinks: d.events.map((ev) => ({ value: ev.event_id, label: ev.event_title })),
    });
  }, [detailQuery.data]);

  const isPending =
    createMutation.isPending || updateMutation.isPending || (isEdit && detailQuery.isPending);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSaved(false);
    const validation = validateForm(state);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    const payload = buildPayload(state);
    if (isEdit && sponsorId) {
      await updateMutation.mutateAsync({ id: sponsorId, body: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setSaved(true);
  }

  if (isEdit && detailQuery.isPending) return <LoadingState />;
  if (isEdit && detailQuery.isError) return <ErrorState message={detailQuery.error.message} />;

  function addEventLink(opt: AsyncSelectOption): void {
    setState((s) => ({
      ...s,
      eventLinks: s.eventLinks.some((e) => e.value === opt.value)
        ? s.eventLinks
        : [...s.eventLinks, opt],
    }));
  }

  function removeEventLink(value: string): void {
    setState((s) => ({ ...s, eventLinks: s.eventLinks.filter((e) => e.value !== value) }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <SponsorFormFields
        state={state}
        errors={errors}
        isPending={isPending}
        isEdit={isEdit}
        mutationError={createMutation.error ?? updateMutation.error}
        saved={saved}
        onNameChange={(v) => setState((s) => ({ ...s, name: v }))}
        onTierChange={(v) => setState((s) => ({ ...s, tier: v }))}
        onWebsiteChange={(v) => setState((s) => ({ ...s, website: v }))}
        onMessageChange={(v) => setState((s) => ({ ...s, customMessage: v }))}
        onLogoUploaded={(url) => setState((s) => ({ ...s, logoUrl: url }))}
        onLogoClear={() => setState((s) => ({ ...s, logoUrl: null }))}
        onEventAdd={addEventLink}
        onEventRemove={removeEventLink}
      />
    </form>
  );
}

// ─── Public export ─────────────────────────────────────────────────────────────

export interface SponsorFormProps {
  sponsorId?: string | undefined;
}

export function SponsorForm({ sponsorId }: SponsorFormProps): ReactElement {
  return (
    <IslandRoot>
      <SponsorFormInner sponsorId={sponsorId} />
    </IslandRoot>
  );
}
