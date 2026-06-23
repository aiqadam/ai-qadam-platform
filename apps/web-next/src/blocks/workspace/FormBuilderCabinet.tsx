// L3 workspace block — <FormBuilderCabinet>.
//
// FR-MIG-013 — form builder cabinet (operator per-form editor).
// Reads form via useFormDetail, renders metadata + FormBuilder,
// persists via useUpdateForm + useArchiveForm.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.
'use client';

import { Button } from '@/kit';
import { Input } from '@/kit/Input';
import { IslandRoot } from '@/lib/island-root';
import { type FieldDef, type WorkspaceFormStatus } from '@/lib/types';
import { useArchiveForm, useFormDetail, useUpdateForm } from '@/lib/use-form-hooks';
import { AlertCircle, Archive, ExternalLink, Save } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { FormBuilder } from './FormBuilder';

export interface FormBuilderCabinetProps {
  formId: string;
}

const STATUS_OPTIONS: { value: WorkspaceFormStatus; label: string }[] = [
  { value: 'draft', label: 'Draft (hidden from public)' },
  { value: 'published', label: 'Published (live at /forms/{slug})' },
  { value: 'archived', label: 'Archived' },
];

function FormBuilderCabinetInner({ formId }: FormBuilderCabinetProps): ReactElement {
  const { data, isLoading, isError, error } = useFormDetail(formId);
  const updateForm = useUpdateForm(formId);
  const archiveForm = useArchiveForm(formId);

  const form = data?.form;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkspaceFormStatus>('draft');
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [schema, setSchema] = useState<FieldDef[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Sync local state when server data arrives.
  useMemo(() => {
    if (!form) return;
    setTitle(form.title);
    setDescription(form.description ?? '');
    setStatus(form.status);
    setAllowAnonymous(form.allow_anonymous);
    setSchema(form.schema.fields);
  }, [form]);

  const dirty = useMemo(
    () =>
      form &&
      (title !== form.title ||
        (form.description ?? '') !== description ||
        status !== form.status ||
        allowAnonymous !== form.allow_anonymous ||
        JSON.stringify(schema) !== JSON.stringify(form.schema.fields)),
    [form, title, description, status, allowAnonymous, schema],
  );

  const handleSave = async (): Promise<void> => {
    setSaveStatus('saving');
    try {
      await updateForm.mutateAsync({
        title,
        description: description || null,
        status,
        allow_anonymous: allowAnonymous,
        schema: { fields: schema },
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  if (isError || !form) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>{isError ? error?.message : 'Form not found'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-mono text-xs text-muted-foreground">{form.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && <span className="text-sm text-green-600">Saved</span>}
          {saveStatus === 'error' && <span className="text-sm text-destructive">Save failed</span>}
          <Button variant="outline" size="sm" asChild>
            <a href={`/workspace/forms/${formId}/responses`}>Responses ({form.submission_count})</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/forms/${form.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              View public form
            </a>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={archiveForm.isPending}
            onClick={() => void archiveForm.mutateAsync()}
          >
            <Archive className="h-4 w-4" />
            Archive
          </Button>
          <Button
            variant="default"
            disabled={!dirty || saveStatus === 'saving'}
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" />
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <label
            htmlFor="fb-title"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Title
          </label>
          <Input
            id="fb-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Form title"
          />
        </div>
        <div>
          <label
            htmlFor="fb-description"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Description (optional)
          </label>
          <textarea
            id="fb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Help respondents understand the purpose of this form"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label
            htmlFor="fb-status"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Status
          </label>
          <select
            id="fb-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkspaceFormStatus)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowAnonymous}
            onChange={(e) => setAllowAnonymous(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>Allow anonymous responses</span>
        </label>
      </div>

      {/* Form builder */}
      <div>
        <h2 className="mb-3 font-medium text-sm">Fields</h2>
        <FormBuilder schema={schema} onChange={setSchema} />
      </div>
    </div>
  );
}

export function FormBuilderCabinet(props: FormBuilderCabinetProps): ReactElement {
  return (
    <IslandRoot>
      <FormBuilderCabinetInner {...props} />
    </IslandRoot>
  );
}
