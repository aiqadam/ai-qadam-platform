// L3 workspace block — <TgSegmentsList>.
//
// Telegram audience segments cabinet. Lists saved segments with a
// DataTable, plus inline create/edit form with live preview.
//
// FR-MIG-014.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type {
  CreateSegmentBody,
  SegmentCriteria,
  SegmentDetail,
  SegmentDraftPreview,
  SegmentSummary,
} from '@/lib/types';
import {
  useCreateTgSegment,
  useDeleteTgSegment,
  useTgSegmentDraftPreview,
  useTgSegmentPreview,
  useTgSegments,
  useUpdateTgSegment,
} from '@/lib/use-tg-segments';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { CriteriaBuilder } from './CriteriaBuilder';
import { DataTable, type DataTableColumn } from './DataTable';

// ─── Preview component ────────────────────────────────────────────────────────

function DraftPreview({
  country,
  criteria,
}: {
  country: string;
  criteria: SegmentCriteria;
}): ReactElement {
  const draftPreview = useTgSegmentDraftPreview();
  const [result, setResult] = useState<SegmentDraftPreview | { error: string } | 'loading' | null>(
    null,
  );

  const triggerPreview = useCallback(() => {
    if (draftPreview.isPending) return;
    setResult('loading');
    draftPreview.mutate(
      { country, criteria },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) =>
          setResult({ error: err instanceof Error ? err.message : 'preview failed' }),
      },
    );
  }, [country, criteria, draftPreview]);

  // Trigger initial preview once on mount — intentionally runs only once
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    triggerPreview();
  }, []);

  return (
    <div
      className="rounded-lg border border-dashed border-border bg-muted/20 p-3"
      data-testid="draft-preview"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Live preview</span>
        <Button type="button" size="sm" variant="secondary" onClick={triggerPreview}>
          Refresh
        </Button>
      </div>
      <div className="mt-2 text-sm">
        {result === null && (
          <span className="text-muted-foreground">Edit criteria to preview match count</span>
        )}
        {result === 'loading' && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Calculating…
          </span>
        )}
        {result && typeof result === 'object' && 'error' in result && (
          <span className="text-destructive">Error: {result.error}</span>
        )}
        {result && typeof result === 'object' && 'match_count' in result && (
          <span>
            <strong>{result.match_count}</strong> matching members
            {result.sample.length > 0 && (
              <span className="ml-2 text-muted-foreground">
                (e.g. {result.sample.map((s) => s.display_name).join(', ')})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Segment form (create / edit) ─────────────────────────────────────────────

function SegmentForm({
  segment,
  onCancel,
  onSuccess,
}: {
  segment: SegmentDetail | undefined;
  onCancel: () => void;
  onSuccess: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const createMutation = useCreateTgSegment();
  const updateMutation = useUpdateTgSegment(segment?.id ?? '');
  const draftPreview = useTgSegmentDraftPreview();

  const isEditing = !!segment;
  const [name, setName] = useState(segment?.name ?? '');
  const [country, setCountry] = useState(segment?.country ?? 'uz');
  const [criteria, setCriteria] = useState<SegmentCriteria>(segment?.criteria ?? { _and: [] });
  const [_preview, setPreview] = useState<
    SegmentDraftPreview | { error: string } | 'loading' | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const _triggerPreview = useCallback(() => {
    if (draftPreview.isPending) return;
    setPreview('loading');
    draftPreview.mutate(
      { country, criteria },
      {
        onSuccess: (data) => setPreview(data),
        onError: (err) =>
          setPreview({ error: err instanceof Error ? err.message : 'preview failed' }),
      },
    );
  }, [country, criteria, draftPreview]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaveError(null);

    try {
      if (isEditing && segment) {
        await updateMutation.mutateAsync({ name, criteria });
      } else {
        const body: CreateSegmentBody = { name, country, criteria };
        await createMutation.mutateAsync(body);
      }
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'tg-segments'] });
      onSuccess();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      {saveError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div>
        <label
          htmlFor="segment-name"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Name
        </label>
        <input
          id="segment-name"
          type="text"
          required
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="e.g. Active members in Tashkent"
        />
      </div>

      <div>
        <label
          htmlFor="segment-country"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Country
        </label>
        <select
          id="segment-country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="uz">Uzbekistan</option>
          <option value="kz">Kazakhstan</option>
          <option value="tj">Tajikistan</option>
        </select>
      </div>

      <div>
        <p className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Criteria
        </p>
        <CriteriaBuilder criteria={criteria} country={country} onChange={setCriteria} />
      </div>

      <DraftPreview country={country} criteria={criteria} />

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save changes' : 'Create segment'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Preview cell renderer ────────────────────────────────────────────────────

function PreviewCell({
  segment,
}: {
  segment: SegmentSummary;
}): ReactElement {
  const previewQuery = useTgSegmentPreview(segment.id);

  if (previewQuery.isLoading) {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading…
      </span>
    );
  }

  if (previewQuery.isError) {
    return <span className="text-sm text-destructive">Error loading preview</span>;
  }

  const data = previewQuery.data;
  if (!data) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <span className="text-sm">
      <strong>{data.match_count}</strong> members
      {data.sample.length > 0 && (
        <span className="ml-1 text-muted-foreground">
          (e.g. {data.sample.map((s) => s.display_name).join(', ')})
        </span>
      )}
    </span>
  );
}

// ─── TgSegmentsList ─────────────────────────────────────────────────────────

function TgSegmentsListInner(): ReactElement {
  const query = useTgSegments();
  const deleteMutation = useDeleteTgSegment();

  const [showForm, setShowForm] = useState(false);
  const [editingSegment, setEditingSegment] = useState<SegmentDetail | undefined>(undefined);

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('Delete this segment? This cannot be undone.')) return;
    await deleteMutation.mutateAsync(id);
  };

  const handleEdit = (segment: SegmentSummary): void => {
    // For now, create a simple form state
    setEditingSegment({
      ...segment,
      criteria: { _and: [] },
      date_updated: null,
    });
    setShowForm(true);
  };

  const columns: ReadonlyArray<DataTableColumn<SegmentSummary>> = [
    {
      key: 'name',
      label: 'Name',
      width: 'lg',
      render: (r) => <span className="font-medium text-foreground">{r.name}</span>,
    },
    {
      key: 'country',
      label: 'Country',
      width: 'sm',
      render: (r) => (
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs uppercase text-muted-foreground">
          {r.country}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      width: 'md',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {new Date(r.date_created).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'preview',
      label: 'Preview',
      render: (r) => <PreviewCell segment={r} />,
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      width: 'sm',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => handleEdit(r)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Edit segment"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(r.id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label="Delete segment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load segments. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {!showForm ? (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New segment
          </Button>
        ) : (
          <div />
        )}
      </div>

      {showForm && (
        <SegmentForm
          segment={editingSegment}
          onCancel={() => {
            setShowForm(false);
            setEditingSegment(undefined);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingSegment(undefined);
            void query.refetch();
          }}
        />
      )}

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={query.isLoading}
        emptyHeading="No segments yet"
        emptyDescription="Create your first audience segment to target Telegram broadcasts."
      />
    </div>
  );
}

export function TgSegmentsList(): ReactElement {
  return (
    <IslandRoot>
      <TgSegmentsListInner />
    </IslandRoot>
  );
}

export default TgSegmentsList;
