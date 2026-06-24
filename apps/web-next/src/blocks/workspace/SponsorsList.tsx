// L3 workspace block — <SponsorsList>.
//
// Sponsor management cabinet island. DataTable of sponsor records with
// tier column and tier-filter chips. "New sponsor" button links to
// /workspace/sponsors/new; clicking a row links to the edit page.
// FR-MIG-025.

import { IslandRoot } from '@/lib/island-root';
import type { SponsorSummary, SponsorTier } from '@/lib/types';
import { SPONSOR_TIERS } from '@/lib/types';
import { useSponsors } from '@/lib/use-sponsors';
import { type ReactElement, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';
import { FilterChip } from './FilterChip';

type TierFilter = SponsorTier | 'all';

const TIER_FILTERS: ReadonlyArray<{ value: TierFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...SPONSOR_TIERS.map((t) => ({ value: t as TierFilter, label: t })),
];

const TIER_BADGE_CLASSES: Record<SponsorTier, string> = {
  presenting: 'bg-primary/10 text-primary border-primary/30',
  gold: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  silver: 'bg-zinc-400/10 text-zinc-600 border-zinc-400/30',
  bronze: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  community: 'bg-accent/10 text-accent-foreground border-accent/30',
};

function TierBadge({ tier }: { tier: SponsorTier }): ReactElement {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${TIER_BADGE_CLASSES[tier]}`}
    >
      {tier}
    </span>
  );
}

function LogoCell({ logoUrl, name }: { logoUrl: string | null; name: string }): ReactElement {
  if (!logoUrl) {
    return (
      <span className="text-muted-foreground text-xs">—</span>
    );
  }
  return (
    <img
      src={logoUrl}
      alt={`${name} logo`}
      className="h-6 w-auto max-w-[80px] object-contain"
    />
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<SponsorSummary>> = [
  {
    key: 'name',
    label: 'Name',
    width: 'lg',
    render: (r) => (
      <a
        href={`/workspace/sponsors/${encodeURIComponent(r.id)}`}
        className="flex flex-col gap-0.5 no-underline group"
      >
        <span className="text-foreground font-medium group-hover:text-primary transition-colors">
          {r.name}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">@{r.slug}</span>
      </a>
    ),
  },
  {
    key: 'tier',
    label: 'Tier',
    width: 'sm',
    render: (r) => <TierBadge tier={r.tier} />,
  },
  {
    key: 'logo_url',
    label: 'Logo',
    width: 'sm',
    render: (r) => <LogoCell logoUrl={r.logo_url} name={r.name} />,
  },
  {
    key: 'website',
    label: 'Website',
    render: (r) =>
      r.website ? (
        <a
          href={r.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-foreground hover:text-primary"
        >
          {new URL(r.website).hostname}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'event_count',
    label: 'Events',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.event_count}</span>
    ),
  },
];

function SponsorsHeader(): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Sponsors
      </span>
      <a
        href="/workspace/sponsors/new"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        + New sponsor
      </a>
    </div>
  );
}

function TierFilter({
  active,
  onChange,
}: {
  active: TierFilter;
  onChange: (t: TierFilter) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Tier
      </span>
      {TIER_FILTERS.map((f) => (
        <FilterChip key={f.value} active={active === f.value} onClick={() => onChange(f.value)}>
          {f.label}
        </FilterChip>
      ))}
    </div>
  );
}

function SponsorsListInner(): ReactElement {
  const query = useSponsors();
  const [tier, setTier] = useState<TierFilter>('all');

  const rows = useMemo(() => {
    if (!query.data) return [];
    if (tier === 'all') return query.data.sponsors;
    return query.data.sponsors.filter((s) => s.tier === tier);
  }, [query.data, tier]);

  return (
    <div className="space-y-4">
      <SponsorsHeader />
      <TierFilter active={tier} onChange={setTier} />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No sponsors yet"
        emptyDescription="Create a sponsor record to associate it with events."
      />
      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} shown · {query.data.sponsors.length} total
        </p>
      )}
    </div>
  );
}

export function SponsorsList(): ReactElement {
  return (
    <IslandRoot>
      <SponsorsListInner />
    </IslandRoot>
  );
}
