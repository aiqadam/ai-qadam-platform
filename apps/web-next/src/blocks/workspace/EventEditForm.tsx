// L3 workspace block — <EventEditForm>.
//
// Operator event control panel — metadata edit (M2.2a). Loads the
// event detail, seeds a controlled form, PATCHes /v1/workspace/events/:id.
// Followups checklist + regenerate-social-card land in M2.2b.
//
// The survey-form picker is a static <select> fed by useWorkspaceForms
// (a country has a handful of forms — no async search needed). A
// generic <Form> block is deliberately NOT extracted yet: this is the
// first write-cabinet; the shared shape gets factored out once a
// 2nd/3rd consumer (announce, forms-meta) proves it (rule of three).
//
// Split into a loader (<EventEditForm>) + seeded fields (<EditFields>)
// so the controlled state initialises cleanly from async-loaded data.

import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import {
  type UpdateEventBody,
  WORKSPACE_EVENT_STATUSES,
  type WorkspaceEventDetail,
  type WorkspaceEventStatus,
} from '@/lib/types';
import { useUpdateEvent, useWorkspaceEvent } from '@/lib/use-workspace-events';
import { useWorkspaceForms } from '@/lib/use-workspace-forms';
import { type FormEvent, type ReactElement, type ReactNode, useState } from 'react';

// ISO ⇄ <input type="datetime-local"> (local YYYY-MM-DDTHH:mm).
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  const d = new Date(local);
  return Number.isFinite(d.getTime()) ? d.toISOString() : local;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}
function Field({ label, htmlFor, children, hint }: FieldProps): ReactElement {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground m-0">{hint}</p>}
    </div>
  );
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface EditFieldsState {
  title: string;
  description: string;
  status: WorkspaceEventStatus;
  starts_at: string;
  ends_at: string;
  capacity: string;
  location: string;
  survey: string;
}

function seedFrom(e: WorkspaceEventDetail): EditFieldsState {
  return {
    title: e.title,
    description: e.description,
    status: e.status,
    starts_at: isoToLocalInput(e.starts_at),
    ends_at: isoToLocalInput(e.ends_at),
    capacity: e.capacity == null ? '' : String(e.capacity),
    location: e.location ?? '',
    survey: e.post_event_survey_form ?? '',
  };
}

function EditFields({ event }: { event: WorkspaceEventDetail }): ReactElement {
  const update = useUpdateEvent(event.id);
  const forms = useWorkspaceForms();
  const [f, setF] = useState<EditFieldsState>(() => seedFrom(event));
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof EditFieldsState>(k: K, v: EditFieldsState[K]): void => {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  const onSubmit = (ev: FormEvent<HTMLFormElement>): void => {
    ev.preventDefault();
    const body: UpdateEventBody = {
      title: f.title.trim(),
      description: f.description.trim(),
      status: f.status,
      starts_at: localInputToIso(f.starts_at),
      ends_at: localInputToIso(f.ends_at),
      capacity: f.capacity.trim() === '' ? null : Number.parseInt(f.capacity, 10),
      location: f.location.trim() === '' ? null : f.location.trim(),
      post_event_survey_form: f.survey === '' ? null : f.survey,
    };
    update.mutate(body, { onSuccess: () => setSaved(true) });
  };

  const formOptions = forms.data?.forms ?? [];

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl">
      <Field label="Title" htmlFor="ev-title">
        <Input
          id="ev-title"
          value={f.title}
          onChange={(e) => set('title', e.target.value)}
          required
        />
      </Field>

      <Field label="Description" htmlFor="ev-desc">
        <textarea
          id="ev-desc"
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
          rows={5}
          maxLength={20000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Status" htmlFor="ev-status">
          <select
            id="ev-status"
            value={f.status}
            onChange={(e) => set('status', e.target.value as WorkspaceEventStatus)}
            className={SELECT_CLASS}
          >
            {WORKSPACE_EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Capacity" htmlFor="ev-capacity" hint="Blank = uncapped">
          <Input
            id="ev-capacity"
            type="number"
            min={0}
            value={f.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
        <Field label="Starts" htmlFor="ev-starts">
          <Input
            id="ev-starts"
            type="datetime-local"
            value={f.starts_at}
            onChange={(e) => set('starts_at', e.target.value)}
          />
        </Field>
        <Field label="Ends" htmlFor="ev-ends">
          <Input
            id="ev-ends"
            type="datetime-local"
            value={f.ends_at}
            onChange={(e) => set('ends_at', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Location" htmlFor="ev-location" hint="Blank = TBA">
        <Input
          id="ev-location"
          value={f.location}
          onChange={(e) => set('location', e.target.value)}
        />
      </Field>

      <Field
        label="Post-event survey form"
        htmlFor="ev-survey"
        hint="Attach a forms-library template, or none"
      >
        <select
          id="ev-survey"
          value={f.survey}
          onChange={(e) => set('survey', e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">— none —</option>
          {formOptions.map((form) => (
            <option key={form.id} value={form.id}>
              {form.title}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {saved && !update.isPending && <span className="text-xs text-primary">✓ Saved</span>}
        {update.error && <span className="text-xs text-destructive">{update.error.message}</span>}
      </div>
    </form>
  );
}

function EventEditFormInner({ eventId }: { eventId: string }): ReactElement {
  const query = useWorkspaceEvent(eventId);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading event…</p>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {query.error?.message ?? 'Event not found.'}
      </div>
    );
  }
  return <EditFields event={query.data.event} />;
}

export function EventEditForm(props: { eventId: string }): ReactElement {
  return (
    <IslandRoot>
      <EventEditFormInner {...props} />
    </IslandRoot>
  );
}

export default EventEditForm;
