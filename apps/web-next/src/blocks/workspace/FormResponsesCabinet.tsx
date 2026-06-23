// L3 workspace block — <FormResponsesCabinet>.
//
// FR-MIG-013 — form responses cabinet (operator responses inbox).
// Reads aggregate + submissions via useFormAggregate + useFormSubmissions,
// renders per-field aggregate cards and a submissions table with CSV export.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.
'use client';

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { type FieldAggregate, type FormAggregate, type FormSubmission } from '@/lib/types';
import { useFormAggregate, useFormSubmissions } from '@/lib/use-form-hooks';
import { cn } from '@/lib/utils';
import { AlertCircle, BarChart3, Download } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FormResponsesCabinetProps {
  formId: string;
}

// ─── Root component ─────────────────────────────────────────────────────────────

function FormResponsesCabinetInner({ formId }: FormResponsesCabinetProps): ReactElement {
  const { data: aggData, isLoading: aggLoading, isError: aggError } = useFormAggregate(formId);
  const { data: subData, isLoading: subLoading, isError: subError } = useFormSubmissions(formId);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [eventFilter, setEventFilter] = useState<string | 'all'>('all');

  const aggregate = aggData?.aggregate;
  const allSubmissions = subData?.submissions ?? [];

  const filteredSubmissions = useMemo(
    () =>
      eventFilter === 'all'
        ? allSubmissions
        : allSubmissions.filter((s) => (s.event ?? '') === eventFilter),
    [allSubmissions, eventFilter],
  );

  const effectiveAggregate = useMemo(() => {
    if (eventFilter === 'all' || !aggregate) return aggregate;
    return computeAggregate(aggregate, filteredSubmissions);
  }, [aggregate, filteredSubmissions, eventFilter]);

  const handleToggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const handleExport = useCallback(() => exportToCsv(filteredSubmissions), [filteredSubmissions]);

  if (aggLoading || subLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  if (aggError || subError || !aggregate) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load responses</span>
      </div>
    );
  }

  return (
    <FormResponsesContent
      aggregate={effectiveAggregate ?? aggregate}
      submissions={filteredSubmissions}
      eventFilter={eventFilter}
      onEventFilterChange={setEventFilter}
      expanded={expanded}
      onToggle={handleToggle}
      onExportCsv={handleExport}
    />
  );
}

// ─── Content component (split to reduce root complexity) ───────────────────────

function FormResponsesContent({
  aggregate,
  submissions,
  eventFilter,
  onEventFilterChange,
  expanded,
  onToggle,
  onExportCsv,
}: {
  aggregate: FormAggregate;
  submissions: FormSubmission[];
  eventFilter: string | 'all';
  onEventFilterChange: (f: string | 'all') => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onExportCsv: () => void;
}): ReactElement {
  const totalResponses = aggregate.total_responses;

  return (
    <div className="space-y-8">
      <ResponsesSummary aggregate={aggregate} />
      <EventFilterChips
        aggregate={aggregate}
        selected={eventFilter}
        onChange={onEventFilterChange}
      />
      {totalResponses === 0 ? (
        <EmptyState />
      ) : (
        <>
          <AggregateSection aggregate={aggregate} />
          <SubmissionsSection
            submissions={submissions}
            expanded={expanded}
            onToggle={onToggle}
            onExportCsv={onExportCsv}
          />
        </>
      )}
    </div>
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function ResponsesSummary({ aggregate }: { aggregate: FormAggregate }): ReactElement {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {aggregate.total_responses} {aggregate.total_responses === 1 ? 'response' : 'responses'}
        {aggregate.anonymous_count > 0 ? ` · ${aggregate.anonymous_count} anonymous` : ''}
        {aggregate.by_event.length > 1 ? ` · ${aggregate.by_event.length} events` : ''}
      </p>
    </div>
  );
}

// ─── Event filter chips ────────────────────────────────────────────────────────

function EventFilterChips({
  aggregate,
  selected,
  onChange,
}: {
  aggregate: FormAggregate;
  selected: string | 'all';
  onChange: (f: string | 'all') => void;
}): ReactElement | null {
  if (aggregate.by_event.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 pb-4 border-b">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">
        Filter
      </span>
      <FilterChip active={selected === 'all'} onClick={() => onChange('all')}>
        All events ({aggregate.total_responses})
      </FilterChip>
      {aggregate.by_event.map((b) => {
        const id = b.event_id ?? '';
        const label = b.event_id ? `evt ${b.event_id.slice(0, 8)}` : 'No event';
        return (
          <FilterChip key={id} active={selected === id} onClick={() => onChange(id)}>
            {label} ({b.count})
          </FilterChip>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full border text-xs font-mono transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border bg-transparent hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState(): ReactElement {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="text-sm text-muted-foreground">No responses yet.</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Share the public form link or attach this form to an event as the post-event survey.
      </p>
    </div>
  );
}

// ─── Aggregate section ────────────────────────────────────────────────────────

function AggregateSection({ aggregate }: { aggregate: FormAggregate }): ReactElement {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Aggregate</h2>
      </div>
      <div className="grid gap-3">
        {aggregate.fields.map((field) => (
          <AggregateCard key={field.key} field={field} />
        ))}
      </div>
    </section>
  );
}

function AggregateCard({ field }: { field: FieldAggregate }): ReactElement {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium">{field.label}</p>
          <code className="text-[10px] text-muted-foreground">{field.key}</code>
        </div>
        <span className="text-xs text-muted-foreground">
          {field.response_count} {field.response_count === 1 ? 'response' : 'responses'}
        </span>
      </div>
      <AggregateBody field={field} />
    </div>
  );
}

function AggregateBody({ field }: { field: FieldAggregate }): ReactElement {
  if (field.type === 'short_text' || field.type === 'long_text') {
    return (
      <p className="text-xs text-muted-foreground">
        Open the table below to read individual responses.
      </p>
    );
  }
  if (field.type === 'scale') return <ScaleBody field={field} />;
  if (field.type === 'yes_no') return <YesNoBody field={field} />;
  if (field.type === 'select_one' || field.type === 'select_many')
    return <SelectBody field={field} />;
  return <p className="text-xs text-muted-foreground">Unknown field type.</p>;
}

function ScaleBody({ field }: { field: Extract<FieldAggregate, { type: 'scale' }> }): ReactElement {
  if (field.response_count === 0)
    return <p className="text-xs text-muted-foreground">No data yet.</p>;
  const maxCount = Math.max(...field.distribution.map((d) => d.count), 1);
  return (
    <div>
      <p className="text-2xl font-display font-semibold">
        {field.mean === null ? '—' : field.mean.toFixed(1)}
        <span className="ml-2 text-xs font-normal text-muted-foreground">mean</span>
      </p>
      <div className="flex items-end gap-1 h-14 mt-3">
        {field.distribution.map((d) => {
          const barH = Math.max((d.count / maxCount) * 100, 4);
          return (
            <div
              key={d.value}
              className="flex-1 flex flex-col items-center"
              title={`${d.value}: ${d.count}`}
            >
              <span className="text-[10px] text-muted-foreground mb-0.5">{d.count}</span>
              <Bar height={barH} />
              <span className="text-[10px] text-muted-foreground mt-0.5">{d.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ height }: { height: number }): ReactElement {
  // Map percentage to predefined Tailwind arbitrary value classes
  const hClass = height >= 100 ? 'h-full' : `h-[${height}%]`;
  return <div className={`w-full bg-primary rounded-t ${hClass}`} />;
}

function YesNoBody({
  field,
}: { field: Extract<FieldAggregate, { type: 'yes_no' }> }): ReactElement {
  const total = field.yes + field.no;
  if (total === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  const yesPct = Math.round((field.yes / total) * 100);
  return (
    <div className="flex gap-6 text-sm">
      <div>
        <span className="text-green-600 font-medium">Yes:</span> {field.yes} ({yesPct}%)
      </div>
      <div>
        <span className="text-red-500 font-medium">No:</span> {field.no} ({100 - yesPct}%)
      </div>
    </div>
  );
}

function SelectBody({
  field,
}: { field: Extract<FieldAggregate, { type: 'select_one' | 'select_many' }> }): ReactElement {
  const maxCount = Math.max(...field.counts.map((c) => c.count), 1);
  return (
    <div className="space-y-2">
      {field.counts.map((c) => {
        const barW = (c.count / maxCount) * 100;
        const wClass = barW >= 100 ? 'w-full' : `w-[${barW}%]`;
        return (
          <div key={c.value}>
            <div className="flex justify-between text-xs mb-1">
              <span>{c.label}</span>
              <span className="text-muted-foreground">{c.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full bg-primary rounded-full ${wClass}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Submissions section ───────────────────────────────────────────────────────

function SubmissionsSection({
  submissions,
  expanded,
  onToggle,
  onExportCsv,
}: {
  submissions: FormSubmission[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onExportCsv: () => void;
}): ReactElement {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">All responses ({submissions.length})</h2>
        <Button variant="outline" size="sm" onClick={onExportCsv}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Submitted
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Respondent
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Source
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <SubmissionRow
                key={s.id}
                submission={s}
                isOpen={expanded.has(s.id)}
                onToggle={() => onToggle(s.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubmissionRow({
  submission,
  isOpen,
  onToggle,
}: {
  submission: FormSubmission;
  isOpen: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        tabIndex={0}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs">{fmtDateTime(submission.date_created)}</span>
        </td>
        <td className="px-4 py-3">
          <RespondentCell submission={submission} />
        </td>
        <td className="px-4 py-3">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            {submission.source}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-muted-foreground">{isOpen ? '−' : '+'}</td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-muted/20">
          <td colSpan={4} className="px-4 py-3">
            <PayloadView payload={submission.payload} />
          </td>
        </tr>
      )}
    </>
  );
}

function RespondentCell({ submission }: { submission: FormSubmission }): ReactElement {
  if (submission.is_anonymous) {
    return <span className="text-xs italic text-muted-foreground">Anonymous</span>;
  }
  if (submission.member) {
    const name = [submission.member.first_name, submission.member.last_name]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="text-xs">
        <p className="font-medium">{name || submission.member.email}</p>
        {name && submission.member.email && (
          <p className="text-muted-foreground">{submission.member.email}</p>
        )}
      </div>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Unlinked TG ({submission.telegram_user_id})
    </span>
  );
}

function PayloadView({ payload }: { payload: Record<string, unknown> }): ReactElement {
  return (
    <div className="rounded-md bg-background p-3 text-xs space-y-2">
      {Object.entries(payload).map(([key, value]) => (
        <div key={key}>
          <p className="font-mono text-[10px] text-muted-foreground">{key}</p>
          <p className="mt-0.5 break-all">{fmtValue(value)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtValue(v: unknown): string {
  if (v == null) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtDateTime(s: string): string {
  try {
    return new Date(s).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

// ─── Aggregate recomputation (per-event filter) ──────────────────────────────

function computeAggregate(base: FormAggregate, subs: FormSubmission[]): FormAggregate {
  const anonymousCount = subs.filter((s) => s.is_anonymous).length;
  return {
    ...base,
    total_responses: subs.length,
    anonymous_count: anonymousCount,
    attributed_count: subs.length - anonymousCount,
    fields: base.fields.map((f) => computeFieldAggregate(f, subs)),
  };
}

function computeFieldAggregate(f: FieldAggregate, subs: FormSubmission[]): FieldAggregate {
  const values = subs.map((s) => s.payload[f.key]).filter((v) => v != null && v !== '');
  if (f.type === 'short_text' || f.type === 'long_text') {
    return { ...f, response_count: values.length };
  }
  if (f.type === 'scale') return computeScaleAggregate(f, values);
  if (f.type === 'yes_no') return computeYesNoAggregate(f, values);
  if (f.type === 'select_one' || f.type === 'select_many') return computeSelectAggregate(f, values);
  return f;
}

type ScaleAggregate = Extract<FieldAggregate, { type: 'scale' }>;
type YesNoAggregate = Extract<FieldAggregate, { type: 'yes_no' }>;
type SelectAggregate = Extract<FieldAggregate, { type: 'select_one' | 'select_many' }>;

function computeScaleAggregate(f: ScaleAggregate, values: unknown[]): ScaleAggregate {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const distMap = new Map<number, number>();
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
    distMap.set(n, (distMap.get(n) ?? 0) + 1);
  }
  return {
    ...f,
    response_count: nums.length,
    mean: nums.length === 0 ? null : sum / nums.length,
    distribution: Array.from(distMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value),
    min: nums.length === 0 ? 0 : min,
    max: nums.length === 0 ? 0 : max,
  };
}

function computeYesNoAggregate(f: YesNoAggregate, values: unknown[]): YesNoAggregate {
  let yes = 0;
  let no = 0;
  for (const v of values) {
    if (v === true) yes++;
    else if (v === false) no++;
  }
  return { ...f, response_count: yes + no, yes, no };
}

function computeSelectAggregate(f: SelectAggregate, values: unknown[]): SelectAggregate {
  const counts = tallySelectCounts(values);
  return {
    ...f,
    response_count: values.length,
    counts: f.counts.map((c) => ({ ...c, count: counts.get(c.value) ?? 0 })),
  };
}

function tallySelectCounts(values: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) {
    collectFromSelectValue(v, counts);
  }
  return counts;
}

function collectFromSelectValue(v: unknown, counts: Map<string, number>): void {
  if (typeof v === 'string') {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  } else if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === 'string') counts.set(x, (counts.get(x) ?? 0) + 1);
    }
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportToCsv(submissions: FormSubmission[]): void {
  if (submissions.length === 0) return;

  const allKeys = new Set<string>();
  for (const s of submissions) {
    for (const k of Object.keys(s.payload)) allKeys.add(k);
  }

  const headers = [
    'id',
    'date_created',
    'source',
    'is_anonymous',
    'respondent',
    'email',
    ...allKeys,
  ];
  const rows = submissions.map((s) => {
    const respondent = s.member
      ? [s.member.first_name, s.member.last_name].filter(Boolean).join(' ') || ''
      : s.is_anonymous
        ? 'Anonymous'
        : `TG ${s.telegram_user_id ?? ''}`;
    const row: string[] = [
      s.id,
      s.date_created,
      s.source,
      String(s.is_anonymous),
      respondent,
      s.member?.email ?? '',
    ];
    for (const k of allKeys) row.push(fmtValue(s.payload[k]));
    return row;
  });

  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `form-responses-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Island wrapper ───────────────────────────────────────────────────────────

export function FormResponsesCabinet(props: FormResponsesCabinetProps): ReactElement {
  return (
    <IslandRoot>
      <FormResponsesCabinetInner {...props} />
    </IslandRoot>
  );
}
