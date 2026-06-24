// L3 workspace block — <TgBroadcastComposer>.
//
// Telegram broadcast composer. Handles both create (new.astro) and
// edit/view ([id].astro) modes.
//
// FR-MIG-015.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.
'use client';

import { Button } from '@/kit';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/kit/Dialog';
import { IslandRoot } from '@/lib/island-root';
import {
  type BroadcastDetail,
  type CreateBroadcastBody,
  type InlineButton,
  type UpdateBroadcastBody,
} from '@/lib/types';
import {
  useCancelBroadcast,
  useCreateBroadcast,
  useDuplicateBroadcast,
  useSegmentPreview,
  useSendBroadcast,
  useSendBroadcastTest,
  useTgBroadcastDetail,
  useUpdateBroadcast,
} from '@/lib/use-tg-broadcasts';
import { AlertCircle, Calendar, Image, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActionBar } from './ActionBar';
import { AsyncSelect, type AsyncSelectOption } from './AsyncSelect';

interface BroadcastComposerProps {
  broadcastId?: string;
}

const MAX_BUTTONS = 8;
const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function SendNowConfirmDialog({
  segmentId,
  broadcastId,
  onConfirm,
}: {
  segmentId: string | null;
  broadcastId: string;
  onConfirm: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const preview = useSegmentPreview(segmentId ?? '');
  const sendNow = useSendBroadcast(broadcastId);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchCount = preview.data?.match_count ?? 0;
  const estimatedSeconds = matchCount > 0 ? Math.round(matchCount / 30) : 0;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
  const isLargeSegment = matchCount > 10000;

  const handleConfirm = useCallback(async () => {
    setIsSending(true);
    setError(null);
    try {
      await sendNow.mutateAsync();
      setOpen(false);
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setIsSending(false);
    }
  }, [sendNow, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <Send className="mr-1.5 h-4 w-4" />
          Send now
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm send</DialogTitle>
          <DialogDescription>
            {preview.isLoading ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading recipient count…
              </span>
            ) : (
              <>
                This will send the broadcast to <strong>{matchCount.toLocaleString()}</strong>{' '}
                recipients.
                {isLargeSegment && (
                  <span className="mt-1 block text-amber-600">
                    Estimated delivery time: ~{estimatedMinutes} minute
                    {estimatedMinutes !== 1 ? 's' : ''}. Large broadcasts may take longer.
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={isSending || preview.isLoading}
          >
            {isSending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BroadcastFormProps {
  broadcast: BroadcastDetail | undefined;
  onSave: (data: CreateBroadcastBody) => void;
  onSaveAndSchedule: (data: CreateBroadcastBody & { scheduled_at: string }) => void;
}

function BroadcastForm({ broadcast, onSave, onSaveAndSchedule }: BroadcastFormProps): ReactElement {
  const [title, setTitle] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [imageAsset, setImageAsset] = useState<string | null>(null);
  const [inlineButtons, setInlineButtons] = useState<InlineButton[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<AsyncSelectOption | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync from existing broadcast
  useEffect(() => {
    if (!broadcast) return;
    setTitle(broadcast.title);
    setHtmlBody(broadcast.html_body);
    setImageAsset(broadcast.image_asset);
    setInlineButtons(broadcast.inline_buttons ?? []);
    if (broadcast.audience_segment) {
      setSelectedSegment({ value: broadcast.audience_segment, label: broadcast.audience_segment });
    }
    setScheduledAt(broadcast.scheduled_at ? broadcast.scheduled_at.slice(0, 16) : '');
    setRecurrence(broadcast.recurrence ?? 'none');
  }, [broadcast]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      onSave({
        title,
        country: broadcast?.country ?? 'uz',
        html_body: htmlBody,
        image_asset: imageAsset,
        inline_buttons: inlineButtons,
        audience_segment: selectedSegment?.value ?? null,
        recurrence: recurrence,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [
    title,
    htmlBody,
    imageAsset,
    inlineButtons,
    selectedSegment,
    recurrence,
    onSave,
    broadcast?.country,
  ]);

  const handleSaveAndSchedule = useCallback(async () => {
    if (!scheduledAt) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      onSaveAndSchedule({
        title,
        country: broadcast?.country ?? 'uz',
        html_body: htmlBody,
        image_asset: imageAsset,
        inline_buttons: inlineButtons,
        audience_segment: selectedSegment?.value ?? null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        recurrence: recurrence,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [
    scheduledAt,
    title,
    htmlBody,
    imageAsset,
    inlineButtons,
    selectedSegment,
    recurrence,
    onSaveAndSchedule,
    broadcast?.country,
  ]);

  const addButton = useCallback(() => {
    if (inlineButtons.length < MAX_BUTTONS) {
      setInlineButtons((prev) => [...prev, { label: '', url: '' }]);
    }
  }, [inlineButtons.length]);

  const removeButton = useCallback((index: number) => {
    setInlineButtons((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateButton = useCallback((index: number, field: 'label' | 'url', value: string) => {
    setInlineButtons((prev) =>
      prev.map((btn, i) => (i === index ? { ...btn, [field]: value } : btn)),
    );
  }, []);

  const loadSegments = useCallback(async (input: string): Promise<AsyncSelectOption[]> => {
    // arch-ignore: no-raw-fetch — async-select loader; refactor to apiClient tracked in ISS-CI-001
    const segments = await fetch('/api/v1/workspace/tg-segments').then((r) => r.json());
    const items = segments.items ?? [];
    return items
      .filter((s: { name: string }) => s.name.toLowerCase().includes(input.toLowerCase()))
      .map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }));
  }, []);

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {saveError}
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="bc-title"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Title
        </label>
        <input
          id="bc-title"
          type="text"
          required
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Broadcast title"
        />
      </div>

      {/* HTML Body */}
      <div>
        <label
          htmlFor="bc-body"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Message body (Telegram-safe HTML)
        </label>
        <textarea
          id="bc-body"
          required
          value={htmlBody}
          onChange={(e) => setHtmlBody(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="<b>Bold</b>, <i>italic</i>, <a href=&quot;https://example.com&quot;>link</a>"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Telegram supports: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;a href&gt;, &lt;code&gt;,
          &lt;pre&gt;
        </p>
      </div>

      {/* Image */}
      <div>
        <p className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Image (optional)
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            id="bc-image-upload"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                // TODO: Upload to Directus assets API
              };
              input.click();
            }}
          >
            <Image className="mr-1.5 h-4 w-4" />
            Upload image
          </Button>
          {imageAsset && <span className="text-sm text-muted-foreground">Image selected</span>}
        </div>
      </div>

      {/* Inline Buttons */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Inline buttons ({inlineButtons.length}/{MAX_BUTTONS})
          </p>
          {inlineButtons.length < MAX_BUTTONS && (
            <Button type="button" variant="ghost" size="sm" onClick={addButton}>
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          )}
        </div>
        {inlineButtons.length === 0 && (
          <p className="text-sm text-muted-foreground">No inline buttons. Click Add to include.</p>
        )}
        <div className="space-y-2">
          {inlineButtons.map((btn, idx) => (
            <div key={btn.label || `btn-new-${idx}`} className="flex items-center gap-2">
              <input
                type="text"
                value={btn.label}
                onChange={(e) => updateButton(idx, 'label', e.target.value)}
                placeholder="Button label"
                maxLength={64}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="url"
                value={btn.url}
                onChange={(e) => updateButton(idx, 'url', e.target.value)}
                placeholder="https://"
                className="flex-[2] rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeButton(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Segment Picker */}
      <div>
        <p className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Audience segment
        </p>
        <AsyncSelect
          loadOptions={loadSegments}
          value={selectedSegment}
          onChange={(opt) => setSelectedSegment(opt)}
          placeholder="Search segments..."
          loadOptionsOnMount={false}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a pre-created segment to target recipients.
        </p>
      </div>

      {/* Schedule */}
      <div>
        <label
          htmlFor="bc-schedule"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Schedule (optional)
        </label>
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            id="bc-schedule"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Recurrence */}
      <div>
        <label
          htmlFor="bc-recurrence"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Recurrence
        </label>
        <select
          id="bc-recurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as 'none' | 'weekly' | 'monthly')}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {RECURRENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="default"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save draft
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSaveAndSchedule()}
          disabled={isSaving || !scheduledAt}
        >
          <Calendar className="mr-1.5 h-4 w-4" />
          Save &amp; schedule
        </Button>
      </div>
    </div>
  );
}

interface TgBroadcastComposerInnerProps {
  broadcastId?: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form state management requires per-field branching for edit/new modes, validation, and action handlers
function TgBroadcastComposerInner({ broadcastId }: TgBroadcastComposerInnerProps): ReactElement {
  const isEditMode = !!broadcastId;
  const id = broadcastId ?? '';
  const detailQuery = useTgBroadcastDetail(id);
  const createMutation = useCreateBroadcast();
  const updateMutation = useUpdateBroadcast(id);
  const sendTest = useSendBroadcastTest(id);
  const cancelMutation = useCancelBroadcast(id);
  const duplicateMutation = useDuplicateBroadcast(id);

  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const broadcast = detailQuery.data;
  const isLoading = isEditMode && detailQuery.isLoading;

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setActionFeedback({ type, msg });
    setTimeout(() => setActionFeedback(null), 3000);
  }, []);

  const buildUpdateData = useCallback((data: CreateBroadcastBody): UpdateBroadcastBody => {
    const updateData: UpdateBroadcastBody = {
      title: data.title,
      html_body: data.html_body,
    };
    if (data.image_asset !== undefined) updateData.image_asset = data.image_asset;
    if (data.inline_buttons !== undefined) updateData.inline_buttons = data.inline_buttons;
    if (data.audience_segment !== undefined) updateData.audience_segment = data.audience_segment;
    if (data.recurrence !== undefined) updateData.recurrence = data.recurrence;
    return updateData;
  }, []);

  const handleSave = useCallback(
    async (data: CreateBroadcastBody) => {
      try {
        if (isEditMode) {
          await updateMutation.mutateAsync(buildUpdateData(data));
          showFeedback('success', 'Broadcast saved');
        } else {
          await createMutation.mutateAsync(data);
          showFeedback('success', 'Broadcast created');
        }
      } catch (err) {
        showFeedback('error', err instanceof Error ? err.message : 'Save failed');
      }
    },
    [isEditMode, createMutation, updateMutation, showFeedback, buildUpdateData],
  );

  const handleSaveAndSchedule = useCallback(
    async (data: CreateBroadcastBody & { scheduled_at: string }) => {
      try {
        if (isEditMode) {
          const updateData = buildUpdateData(data);
          updateData.scheduled_at = data.scheduled_at;
          await updateMutation.mutateAsync(updateData);
          showFeedback('success', 'Broadcast scheduled');
        } else {
          await createMutation.mutateAsync(data);
          showFeedback('success', 'Broadcast scheduled');
        }
      } catch (err) {
        showFeedback('error', err instanceof Error ? err.message : 'Save failed');
      }
    },
    [isEditMode, createMutation, updateMutation, showFeedback, buildUpdateData],
  );

  const handleTest = useCallback(async () => {
    try {
      await sendTest.mutateAsync();
      showFeedback('success', 'Test message sent to you');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Test failed');
    }
  }, [sendTest, showFeedback]);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this broadcast? This cannot be undone.')) return;
    try {
      await cancelMutation.mutateAsync();
      showFeedback('success', 'Broadcast cancelled');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Cancel failed');
    }
  }, [cancelMutation, showFeedback]);

  const handleDuplicate = useCallback(async () => {
    if (!id) return;
    try {
      const result = await duplicateMutation.mutateAsync();
      window.location.href = `/workspace/integrations/telegram/broadcasts/${result.id}`;
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Duplicate failed');
    }
  }, [id, duplicateMutation, showFeedback]);

  const actions = useMemo(() => {
    if (!broadcast) return [];

    const testAction = {
      label: 'Test to me',
      onClick: () => void handleTest(),
      variant: 'outline' as const,
      loading: sendTest.isPending,
      disabled: sendTest.isPending,
    };

    const sendNowAction = ['draft', 'scheduled', 'failed'].includes(broadcast.status)
      ? {
          label: 'Send now',
          onClick: () => {},
          variant: 'default' as const,
          disabled: !broadcast.audience_segment,
        }
      : null;

    const cancelAction =
      broadcast.status === 'scheduled'
        ? {
            label: 'Cancel',
            onClick: () => void handleCancel(),
            variant: 'destructive' as const,
            loading: cancelMutation.isPending,
            disabled: cancelMutation.isPending,
            confirm: {
              title: 'Cancel broadcast?',
              description: 'This will cancel the scheduled broadcast. This cannot be undone.',
              confirmLabel: 'Cancel',
            },
          }
        : null;

    const duplicateAction = {
      label: 'Duplicate',
      onClick: () => void handleDuplicate(),
      variant: 'outline' as const,
      loading: duplicateMutation.isPending,
      disabled: duplicateMutation.isPending,
    };

    return [testAction, sendNowAction, cancelAction, duplicateAction].filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
  }, [
    broadcast,
    handleTest,
    handleCancel,
    handleDuplicate,
    sendTest.isPending,
    cancelMutation.isPending,
    duplicateMutation.isPending,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEditMode && detailQuery.isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>{detailQuery.error?.message ?? 'Failed to load broadcast'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionFeedback && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            actionFeedback.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
              : 'border border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {actionFeedback.msg}
        </div>
      )}

      {isEditMode && broadcast && (
        <>
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p
                className={`font-medium ${
                  broadcast.status === 'sent'
                    ? 'text-green-600'
                    : broadcast.status === 'failed'
                      ? 'text-red-600'
                      : broadcast.status === 'sending'
                        ? 'text-amber-600'
                        : ''
                }`}
              >
                {broadcast.status.charAt(0).toUpperCase() + broadcast.status.slice(1)}
              </p>
              {broadcast.failure_reason && (
                <p className="mt-1 text-sm text-destructive">{broadcast.failure_reason}</p>
              )}
            </div>
            {broadcast.sent_count > 0 && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Sent</p>
                <p className="font-mono text-lg">{broadcast.sent_count.toLocaleString()}</p>
              </div>
            )}
          </div>
          <SendNowConfirmDialog
            segmentId={broadcast.audience_segment}
            broadcastId={id}
            onConfirm={() => void detailQuery.refetch()}
          />
          <ActionBar actions={actions} />
        </>
      )}

      <BroadcastForm
        broadcast={broadcast}
        onSave={handleSave}
        onSaveAndSchedule={handleSaveAndSchedule}
      />
    </div>
  );
}

export function TgBroadcastComposer(props: BroadcastComposerProps): ReactElement {
  return (
    <IslandRoot>
      <TgBroadcastComposerInner {...props} />
    </IslandRoot>
  );
}

export default TgBroadcastComposer;
