// L3 workspace block — <PartnersList>.
//
// Partners cabinet island. Read-only directory of sponsors +
// employers + product partners (one row can be all three; role
// chips show which). Detail page (audiences + kit assets) is a
// follow-up — clicking the name TODO links to the slug page once
// it lands.

import { IslandRoot } from '@/lib/island-root';
import type { PartnerSummary } from '@/lib/types';
import { usePartners } from '@/lib/use-partners';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

type RoleFilter = 'all' | 'sponsor' | 'employer' | 'product';

const ROLE_FILTERS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'sponsor', label: 'sponsors' },
  { value: 'employer', label: 'employers' },
  { value: 'product', label: 'product partners' },
];

function RoleChip({ active, children }: { active: boolean; children: ReactNode }): ReactElement {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        active
          ? 'border-primary/30 text-primary bg-primary/10'
          : 'border-border text-muted-foreground bg-card'
      }`}
    >
      {children}
    </span>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<PartnerSummary>> = [
  {
    key: 'name',
    label: 'Name',
    width: 'lg',
    render: (r) => (
      <a
        href={`/workspace/partners/${encodeURIComponent(r.slug)}`}
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
    key: 'roles',
    label: 'Roles',
    width: 'md',
    render: (r) => (
      <div className="flex flex-wrap gap-1">
        <RoleChip active={r.is_sponsor}>sponsor</RoleChip>
        <RoleChip active={r.is_employer}>employer</RoleChip>
        <RoleChip active={r.is_product_partner}>product</RoleChip>
      </div>
    ),
  },
  {
    key: 'industry',
    label: 'Industry',
    width: 'sm',
    render: (r) =>
      r.industry ? (
        <span className="text-xs text-foreground">{r.industry}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'country',
    label: 'CC',
    width: 'sm',
    render: (r) =>
      r.country ? (
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.country}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
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
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

function passesRoleFilter(row: PartnerSummary, role: RoleFilter): boolean {
  if (role === 'all') return true;
  if (role === 'sponsor') return row.is_sponsor;
  if (role === 'employer') return row.is_employer;
  return row.is_product_partner;
}

function PartnersListInner(): ReactElement {
  const query = usePartners();
  const [role, setRole] = useState<RoleFilter>('all');

  const rows = useMemo(() => {
    if (!query.data) return [];
    return query.data.partners.filter((p) => passesRoleFilter(p, role));
  }, [query.data, role]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Role
        </span>
        {ROLE_FILTERS.map((f) => (
          <FilterChip key={f.value} active={role === f.value} onClick={() => setRole(f.value)}>
            {f.label}
          </FilterChip>
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No active partners"
        emptyDescription="Adjust the role filter or onboard a sponsor / employer in Directus."
      />

      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} shown · {query.data.partners.length} total active
        </p>
      )}
    </div>
  );
}

export function PartnersList(): ReactElement {
  return (
    <IslandRoot>
      <PartnersListInner />
    </IslandRoot>
  );
}

export default PartnersList;
