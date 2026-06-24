// L3 workspace block — <BadgesList>.
//
// Badge definitions cabinet. DataTable of all badge definitions with icon,
// name, criteria description, and award count. "Grant badge" action opens
// an inline dialog: member picker via <AsyncSelect> + badge picker + optional
// note. POST /v1/admin/badges/grant.
// FR-MIG-027. Auth gate is in the parent .astro page.

import { AsyncSelect, type AsyncSelectOption } from '@/blocks/workspace/AsyncSelect';
import { DataTable, type DataTableColumn } from '@/blocks/workspace/DataTable';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { BadgeDefinition } from '@/lib/types';
import { searchMembers, useGrantBadge, useBadges } from '@/lib/use-badges';
import { Award, Loader2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';

// ─── Grant dialog ─────────────────────────────────────────────────────────────

interface GrantDialogProps {
  badges: BadgeDefinition[];
}

interface GrantFormState {
  badgeId: string;
  member: AsyncSelectOption | null;
  note: string;
}

const EMPTY_GRANT_STATE: GrantFormState = { badgeId: '', member: null, note: '' };

function GrantDialog({ badges }: GrantDialogProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GrantFormState>(EMPTY_GRANT_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const grantMutation = useGrantBadge();

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) {
      setForm(EMPTY_GRANT_STATE);
      setFormError(null);
      grantMutation.reset();
    }
  }

  async function handleGrant(): Promise<void> {
    if (!form.member) {
      setFormError('Select a member.');
      return;
    }
    if (form.badgeId.length === 0) {
      setFormError('Select a badge.');
      return;
    }
    setFormError(null);
    await grantMutation.mutateAsync({
      badge_id: form.badgeId,
      member_id: form.member.value,
      note: form.note.trim() || null,
    });
    handleOpenChange(false);
  }

  const selectClass =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Award className="h-4 w-4 mr-1.5" />
          Grant badge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant badge</DialogTitle>
          <DialogDescription>
            Award a badge to a community member for an achievement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label
              htmlFor="grant-badge-select"
              className="block font-mono text-[10px] uppercase tracking-wider text-foreground"
            >
              Badge<span className="text-destructive ml-0.5">*</span>
            </label>
            <select
              id="grant-badge-select"
              value={form.badgeId}
              onChange={(e) => setForm((s) => ({ ...s, badgeId: e.target.value }))}
              disabled={grantMutation.isPending}
              className={selectClass}
            >
              <option value="">Select a badge…</option>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="grant-member-select"
              className="block font-mono text-[10px] uppercase tracking-wider text-foreground"
            >
              Member<span className="text-destructive ml-0.5">*</span>
            </label>
            <AsyncSelect
              id="grant-member-select"
              loadOptions={searchMembers}
              value={form.member}
              onChange={(opt) => setForm((s) => ({ ...s, member: opt }))}
              placeholder="Search by name or email…"
              disabled={grantMutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="grant-note"
              className="block font-mono text-[10px] uppercase tracking-wider text-foreground"
            >
              Note (optional)
            </label>
            <Input
              id="grant-note"
              type="text"
              value={form.note}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              disabled={grantMutation.isPending}
              placeholder="Spoke at 3 events"
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          {grantMutation.error && (
            <p className="text-sm text-destructive">{grantMutation.error.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={grantMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleGrant} disabled={grantMutation.isPending}>
            {grantMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {grantMutation.isPending ? 'Granting…' : 'Grant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Badge list columns ────────────────────────────────────────────────────────

const COLUMNS: ReadonlyArray<DataTableColumn<BadgeDefinition>> = [
  {
    key: 'name',
    label: 'Badge',
    width: 'lg',
    render: (r) => (
      <div className="flex items-center gap-3">
        {r.icon_url ? (
          <img src={r.icon_url} alt="" className="h-7 w-7 rounded object-contain" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded bg-muted">
            <Award className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{r.slug}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'criteria_description',
    label: 'Criteria',
    render: (r) =>
      r.criteria_description ? (
        <span className="text-sm text-muted-foreground">{r.criteria_description}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'award_count',
    label: 'Awards',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.award_count}</span>
    ),
  },
];

// ─── Inner component (exported for BadgesCabinet composition) ─────────────────

export function BadgesListInner(): ReactElement {
  const query = useBadges();

  const badges = query.data?.badges ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Badge definitions
        </span>
        {!query.isPending && !query.isError && <GrantDialog badges={badges} />}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={badges}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No badges defined"
        emptyDescription="Badge definitions are created via the admin panel."
      />
      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {badges.length} badge{badges.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function BadgesList(): ReactElement {
  return (
    <IslandRoot>
      <BadgesListInner />
    </IslandRoot>
  );
}
