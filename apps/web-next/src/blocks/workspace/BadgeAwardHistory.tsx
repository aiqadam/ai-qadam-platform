// L3 workspace block — <BadgeAwardHistory>.
//
// Award history tab. DataTable of all badge grants (member, badge,
// granted-by, date, note). Filterable by badge type via <FilterChip>.
// Revoke action opens a confirm dialog with a required reason note.
// POST /v1/admin/badges/awards/:id/revoke.
// FR-MIG-027. Auth gate is in the parent .astro page.

import { DataTable, type DataTableColumn } from '@/blocks/workspace/DataTable';
import { FilterChip } from '@/blocks/workspace/FilterChip';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { BadgeAwardRow, BadgeDefinition } from '@/lib/types';
import { useBadgeAwards, useBadges, useRevokeBadgeAward } from '@/lib/use-badges';
import { Loader2, Trash2 } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

// ─── Badge filter ─────────────────────────────────────────────────────────────

type BadgeFilter = string | 'all';

interface BadgeFilterBarProps {
  badges: BadgeDefinition[];
  active: BadgeFilter;
  onChange: (id: BadgeFilter) => void;
}

function BadgeFilterBar({ badges, active, onChange }: BadgeFilterBarProps): ReactElement {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Badge
      </span>
      <FilterChip active={active === 'all'} onClick={() => onChange('all')}>
        All
      </FilterChip>
      {badges.map((b) => (
        <FilterChip key={b.id} active={active === b.id} onClick={() => onChange(b.id)}>
          {b.name}
        </FilterChip>
      ))}
    </div>
  );
}

// ─── Revoke dialog ─────────────────────────────────────────────────────────────

interface RevokeDialogProps {
  award: BadgeAwardRow;
  onClose: () => void;
}

function RevokeDialog({ award, onClose }: RevokeDialogProps): ReactElement {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const revokeMutation = useRevokeBadgeAward();

  async function handleRevoke(): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setFormError('Reason is required.');
      return;
    }
    setFormError(null);
    await revokeMutation.mutateAsync({ awardId: award.id, body: { reason: trimmed } });
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Revoke badge award</DialogTitle>
        <DialogDescription>
          Revoke <strong>{award.badge_name}</strong> from{' '}
          <strong>{award.member_name ?? award.member_email}</strong>. A reason is required.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <label
            htmlFor="revoke-reason"
            className="block font-mono text-[10px] uppercase tracking-wider text-foreground"
          >
            Reason<span className="text-destructive ml-0.5">*</span>
          </label>
          <textarea
            id="revoke-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={revokeMutation.isPending}
            rows={3}
            placeholder="Award granted in error — criteria not met."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          {revokeMutation.error && (
            <p className="text-xs text-destructive">{revokeMutation.error.message}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={revokeMutation.isPending}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={handleRevoke} disabled={revokeMutation.isPending}>
          {revokeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function RevokeCell({
  award,
  onRevoke,
}: {
  award: BadgeAwardRow;
  onRevoke: (a: BadgeAwardRow) => void;
}): ReactElement {
  if (award.revoked_at !== null) {
    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Revoked
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onRevoke(award)}
      className="text-muted-foreground hover:text-destructive transition-colors"
      aria-label={`Revoke ${award.badge_name} from ${award.member_email}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function buildColumns(
  onRevoke: (a: BadgeAwardRow) => void,
): ReadonlyArray<DataTableColumn<BadgeAwardRow>> {
  return [
    {
      key: 'badge_name',
      label: 'Badge',
      width: 'md',
      render: (r) => (
        <span className="font-medium text-foreground">{r.badge_name}</span>
      ),
    },
    {
      key: 'member_email',
      label: 'Member',
      width: 'lg',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          {r.member_name && (
            <span className="text-sm font-medium text-foreground">{r.member_name}</span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">{r.member_email}</span>
        </div>
      ),
    },
    {
      key: 'granted_by_email',
      label: 'Granted by',
      render: (r) => (
        <span className="font-mono text-[10px] text-muted-foreground">{r.granted_by_email}</span>
      ),
    },
    {
      key: 'note',
      label: 'Note',
      render: (r) =>
        r.note ? (
          <span className="text-sm text-muted-foreground">{r.note}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'created_at',
      label: 'Date',
      width: 'sm',
      render: (r) => (
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'revoked_at',
      label: '',
      width: 'sm',
      render: (r) => <RevokeCell award={r} onRevoke={onRevoke} />,
    },
  ];
}

// ─── Inner component (exported for BadgesCabinet composition) ─────────────────

export function BadgeAwardHistoryInner(): ReactElement {
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>('all');
  const [revokeTarget, setRevokeTarget] = useState<BadgeAwardRow | null>(null);

  const badgesQuery = useBadges();
  const awardsQuery = useBadgeAwards(badgeFilter === 'all' ? undefined : badgeFilter);

  const rows = useMemo(() => {
    return awardsQuery.data?.awards ?? [];
  }, [awardsQuery.data]);

  const badges = badgesQuery.data?.badges ?? [];

  const columns = useMemo(() => buildColumns(setRevokeTarget), []);

  return (
    <div className="space-y-4">
      <BadgeFilterBar badges={badges} active={badgeFilter} onChange={setBadgeFilter} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={awardsQuery.isPending}
        errorMessage={awardsQuery.error?.message ?? null}
        emptyHeading="No awards yet"
        emptyDescription="Grant a badge from the Badges tab to see it here."
      />
      {awardsQuery.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} award{rows.length !== 1 ? 's' : ''}
        </p>
      )}

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        {revokeTarget !== null && (
          <RevokeDialog award={revokeTarget} onClose={() => setRevokeTarget(null)} />
        )}
      </Dialog>
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function BadgeAwardHistory(): ReactElement {
  return (
    <IslandRoot>
      <BadgeAwardHistoryInner />
    </IslandRoot>
  );
}
