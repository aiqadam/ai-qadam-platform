// L3 workspace block — <PartnerDetail>.
//
// Read-only per-partner view for /workspace/partners/[slug]. Renders
// the role/identity header, consented audiences (cohort shares), and
// co-marketing kit assets. The API exposes no partner PATCH, so this
// is view-only — onboarding/edits stay in Directus until a write
// endpoint lands.
//
// Reads via usePartnerDetail(slug) from lib/use-partners (operator-only,
// client-fetched like the other workspace cabinets).

import { IslandRoot } from '@/lib/island-root';
import { type PartnerDetail as PartnerDetailData } from '@/lib/types';
import { usePartnerDetail } from '@/lib/use-partners';
import type { ReactElement, ReactNode } from 'react';

interface Props {
  slug: string;
}

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

function Header({ p }: { p: PartnerDetailData }): ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <RoleChip active={p.is_sponsor}>sponsor</RoleChip>
        <RoleChip active={p.is_employer}>employer</RoleChip>
        <RoleChip active={p.is_product_partner}>product</RoleChip>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {p.status}
          {p.country ? ` · ${p.country}` : ''}
          {p.industry ? ` · ${p.industry}` : ''}
        </span>
      </div>
      {p.website && (
        <a
          href={p.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-foreground hover:text-primary"
        >
          {p.website}
        </a>
      )}
    </div>
  );
}

function Audiences({ p }: { p: PartnerDetailData }): ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground m-0">Audiences</h2>
      {p.audiences.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">No consented audience shares yet.</p>
      ) : (
        <ul className="list-none p-0 m-0 space-y-2">
          {p.audiences.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground m-0 truncate">{a.cohort_name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0 mt-0.5">
                  {a.purpose}
                  {a.expires_at
                    ? ` · expires ${new Date(a.expires_at).toISOString().slice(0, 10)}`
                    : ''}
                </p>
              </div>
              <span className="font-mono text-sm text-foreground shrink-0">
                {a.member_count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KitAssets({ p }: { p: PartnerDetailData }): ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground m-0">Co-marketing kit</h2>
      {p.kit_assets.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">No kit assets available.</p>
      ) : (
        <ul className="list-none p-0 m-0 space-y-2">
          {p.kit_assets.map((k) => (
            <li
              key={k.id}
              className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground m-0 truncate">{k.title}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0 mt-0.5">
                  {k.category}
                  {k.is_partner_exclusive ? ' · exclusive' : ' · shared'}
                </p>
              </div>
              {k.file_url && (
                <a
                  href={k.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline shrink-0"
                >
                  Download ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PartnerDetailInner({ slug }: Props): ReactElement {
  const query = usePartnerDetail(slug);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading partner…</p>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {query.error?.message ?? 'Partner not found.'}
      </div>
    );
  }

  const p = query.data;
  return (
    <div className="space-y-8">
      <Header p={p} />
      <Audiences p={p} />
      <KitAssets p={p} />
    </div>
  );
}

export function PartnerDetail(props: Props): ReactElement {
  return (
    <IslandRoot>
      <PartnerDetailInner {...props} />
    </IslandRoot>
  );
}

export default PartnerDetail;
