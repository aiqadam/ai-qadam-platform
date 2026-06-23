// L3 block — <ReferralDashboard>.
//
// FR-MIG-018 — referral code display + stats on /me/referrals.
// Shows the member's primary referral code with a copy-to-clipboard
// button and aggregate stats (attended referrees, brought-a-friend badge).
//
// Attribution history table deferred — no dedicated endpoint in MVP.
//
// Data-in at the React boundary: receives no props, reads from
// useMyReferralCodes() + useMyReferralStats(). Lives under blocks/customer/
// per ADR-0038.
//
// Wiring: docs/04-development/architecture/wiring-map.md → member_referrals.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { MyReferralStats, ReferralCodeView } from '@/lib/types';
import { useMyReferralCodes, useMyReferralStats } from '@/lib/use-referrals';
import { type ReactElement, useState } from 'react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 text-center">
      <p className="font-mono text-2xl font-semibold text-foreground">{value ?? '—'}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function LoadingState(): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <p className="text-xs text-muted-foreground">Loading referral data...</p>
    </div>
  );
}

function ErrorState(): ReactElement {
  return (
    <div className="rounded-xl border border-destructive bg-card p-6 text-center">
      <p className="text-xs text-destructive">
        Unable to load referral data. Reload the page to retry.
      </p>
    </div>
  );
}

function NoCodeState(): ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground mb-1">No referral code yet.</p>
      <p className="text-xs text-muted-foreground">
        A code is generated automatically after your first event attendance.
      </p>
    </div>
  );
}

function ReferralCodeCard({
  code,
  onCopy,
  copied,
}: {
  code: ReferralCodeView;
  onCopy: () => void;
  copied: boolean;
}): ReactElement {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-6">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
        Your referral code
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <code className="font-mono text-2xl font-semibold text-foreground tracking-widest">
          {code.code}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={copied}
          aria-label="Copy referral link to clipboard"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Share{' '}
        <a href={code.shareUrl} className="text-primary hover:underline">
          {code.shareUrl}
        </a>{' '}
        with someone who might benefit from AI Qadam. You earn points when they attend their first
        event.
      </p>
      {code.validUntil && (
        <p className="text-xs text-muted-foreground mt-2">
          Valid until {formatDate(code.validUntil)}
        </p>
      )}
    </div>
  );
}

function StatsGrid({ stats }: { stats: MyReferralStats }): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard label="Referred attendees" value={stats.attendedReferreesCount} />
      <StatCard label="Brought a friend badges" value={stats.broughtAFriendBadge?.count ?? 0} />
    </div>
  );
}

function BadgeDetail({ stats }: { stats: MyReferralStats }): ReactElement | null {
  if (!stats.broughtAFriendBadge) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">
        First badge earned: {formatDate(stats.broughtAFriendBadge.firstAwardedAt)}
      </p>
    </div>
  );
}

function ReferralDashboardInner(): ReactElement {
  const codes = useMyReferralCodes();
  const stats = useMyReferralStats();
  const [copied, setCopied] = useState(false);

  const isPending = codes.isPending || stats.isPending;
  const hasError = codes.error || stats.error || !codes.data;

  if (isPending) return <LoadingState />;
  if (hasError) return <ErrorState />;

  const code = codes.data?.[0] ?? null;
  const statsData = stats.data ?? { attendedReferreesCount: 0, broughtAFriendBadge: null };

  const onCopy = async (): Promise<void> => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure context) — silently ignore
    }
  };

  return (
    <div className="space-y-6">
      {code ? <ReferralCodeCard code={code} onCopy={onCopy} copied={copied} /> : <NoCodeState />}
      <StatsGrid stats={statsData} />
      <BadgeDetail stats={statsData} />
    </div>
  );
}

export function ReferralDashboard(): ReactElement {
  return (
    <IslandRoot>
      <ReferralDashboardInner />
    </IslandRoot>
  );
}

export default ReferralDashboard;
