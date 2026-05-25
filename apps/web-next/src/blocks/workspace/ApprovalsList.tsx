// L3 workspace block — <ApprovalsList>.
//
// Operator approval queue cabinet island. Two surfaces:
//   1. Source readiness panel — three planned source kinds (sponsor
//      onboarding, speaker proposal, operator-assisted interaction).
//      Each flips from "pending wiring" to "ready" as its loader
//      lands in the API.
//   2. DataTable of pending items — currently empty (no source
//      ready in v1); future PRs surface real rows here.

import type { ApprovalItem, ApprovalKind, ApprovalsResult } from '@/lib/types';
import { useApprovals } from '@/lib/use-approvals';
import { type ReactElement, type ReactNode } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

const KIND_LABEL: Record<ApprovalKind, string> = {
  sponsor_onboarding: 'Sponsor onboarding',
  speaker_proposal: 'Speaker proposal',
  operator_assisted_interaction: 'Op-assisted interaction',
};

const COLUMNS: ReadonlyArray<DataTableColumn<ApprovalItem>> = [
  {
    key: 'kind',
    label: 'Kind',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">{KIND_LABEL[r.kind]}</span>
    ),
  },
  {
    key: 'title',
    label: 'Title',
    width: 'lg',
    render: (r) => <span className="text-foreground">{r.title}</span>,
  },
  {
    key: 'summary',
    label: 'Summary',
    render: (r) => <span className="text-xs text-muted-foreground">{r.summary}</span>,
  },
  {
    key: 'submittedAt',
    label: 'Submitted',
    width: 'sm',
    render: (r) => (
      <time dateTime={r.submittedAt} className="font-mono text-[10px] text-muted-foreground">
        {new Date(r.submittedAt).toISOString().slice(0, 10)}
      </time>
    ),
  },
  {
    key: 'open',
    label: '',
    align: 'right',
    render: (r) => (
      <a
        href={r.href}
        className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
      >
        Review →
      </a>
    ),
  },
];

function SourceRow({
  source,
}: {
  source: ApprovalsResult['sources'][number];
}): ReactElement {
  const toneClass = source.ready ? 'border-primary/30 bg-primary/[0.06]' : 'border-border bg-card';
  const dotClass = source.ready ? 'bg-primary' : 'bg-muted-foreground';
  return (
    <li className={`rounded-md border ${toneClass} px-3 py-2.5 flex items-start gap-3`}>
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass} mt-1.5 shrink-0`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0">
          {KIND_LABEL[source.kind]}
          {source.ready ? ' · ready' : ' · pending'}
        </p>
        <p className="text-xs text-foreground mt-0.5 m-0">{source.note}</p>
      </div>
    </li>
  );
}

function SourcePanel({
  sources,
}: {
  sources: ApprovalsResult['sources'];
}): ReactElement {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header>
        <h2 className="font-display text-base font-semibold text-foreground m-0">
          Source readiness
        </h2>
        <p className="text-xs text-muted-foreground mt-1 m-0">
          Each source flips from "pending" to "ready" as its loader ships.
        </p>
      </header>
      <ul className="list-none p-0 m-0 space-y-1.5">
        {sources.map((s) => (
          <SourceRow key={s.kind} source={s} />
        ))}
      </ul>
    </section>
  );
}

function emptyDesc(sources: ApprovalsResult['sources']): ReactNode {
  const readyCount = sources.filter((s) => s.ready).length;
  return readyCount === 0
    ? 'No source loaders ready yet — see source readiness above for status.'
    : 'No pending approvals right now.';
}

export function ApprovalsList(): ReactElement {
  const query = useApprovals();

  return (
    <div className="space-y-6">
      {query.data && <SourcePanel sources={query.data.sources} />}

      <section className="space-y-3">
        <header>
          <h2 className="font-display text-lg font-semibold text-foreground m-0">Pending review</h2>
        </header>
        <DataTable
          columns={COLUMNS}
          rows={query.data?.items ?? []}
          rowKey={(r) => r.id}
          isLoading={query.isPending}
          errorMessage={query.error?.message ?? null}
          emptyHeading="Queue clear"
          emptyDescription={query.data ? String(emptyDesc(query.data.sources)) : ''}
        />
      </section>
    </div>
  );
}

export default ApprovalsList;
