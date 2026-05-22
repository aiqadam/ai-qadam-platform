import { Injectable, Logger } from '@nestjs/common';

// F-S3.7 — operator approval queue (empty-shell v1).
//
// The cabinet aggregates "items pending an operator's one-click approve"
// across these sources (per [roadmap §7 Sprint 3.7](docs/community-platform-roadmap.md)):
//
//   - Sponsor onboarding submissions  → lands with F-S3.5 sponsor cabinet
//                                        (companies.onboarding_status enum + queue source)
//   - Speaker proposals                → lands with F-S4.x speaker pipeline
//                                        (speaker_proposals collection + queue source)
//   - Operator-assisted Interactions   → lands when the dispatcher gains a
//                                        `requires_operator_approval` flag
//                                        (interactions.status='pending_approval')
//
// None of these sources exists in the schema today. v1 ships the cabinet
// shell + this service that returns `{ items: [] }` so the URL, layout,
// and empty-state are correct. As each source lands, plug a SOURCES entry
// in here; the cabinet doesn't change.

export type ApprovalKind =
  | 'sponsor_onboarding'
  | 'speaker_proposal'
  | 'operator_assisted_interaction';

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  title: string;
  submittedAt: string;
  /** Free-text preview line for the queue view. */
  summary: string;
  /** Workspace URL the operator should open to act on the item. */
  href: string;
}

export interface ApprovalsResult {
  items: ApprovalItem[];
  sources: Array<{ kind: ApprovalKind; ready: boolean; note: string }>;
}

/**
 * Source registry. Each entry's `loader` returns the live pending items
 * for that source. v1 has none ready; future PRs flip `ready: true` and
 * implement the loader.
 */
const SOURCES: Array<{
  kind: ApprovalKind;
  ready: boolean;
  note: string;
  loader: () => Promise<ApprovalItem[]>;
}> = [
  {
    kind: 'sponsor_onboarding',
    ready: false,
    note: 'Lands with F-S3.5 sponsor cabinet (companies.onboarding_status enum).',
    loader: () => Promise.resolve([]),
  },
  {
    kind: 'speaker_proposal',
    ready: false,
    note: 'Lands with F-S4.x speaker pipeline (speaker_proposals collection).',
    loader: () => Promise.resolve([]),
  },
  {
    kind: 'operator_assisted_interaction',
    ready: false,
    note: 'Lands when the dispatcher exposes requires_operator_approval (status=pending_approval).',
    loader: () => Promise.resolve([]),
  },
];

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  async list(): Promise<ApprovalsResult> {
    const itemsPerSource = await Promise.all(SOURCES.filter((s) => s.ready).map((s) => s.loader()));
    const items = itemsPerSource.flat().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return {
      items,
      sources: SOURCES.map((s) => ({ kind: s.kind, ready: s.ready, note: s.note })),
    };
  }
}
