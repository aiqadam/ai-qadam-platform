// L3 block — <ConsentList>.
//
// /me/profile per-purpose consent toggles. Seven purposes from
// ADR-0033 Part 1: events, marketing, research, recruiting,
// sponsor_share, content, paid_premium. Default off; toggle is the
// member's explicit grant action.
//
// Data-in/element-out at the React boundary: receives no props; reads
// the full profile from useMyFullProfile() and writes via
// useUpdateConsent() — both via lib/use-me-profile (allowed in blocks
// under the lib/use-* convention from PR 1.4).
//
// Wiring: docs/architecture/wiring-map.md → member_consents.

import { Button } from '@/kit';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@/lib/types';
import { useMyFullProfile, useUpdateConsent } from '@/lib/use-me-profile';
import { type ReactElement } from 'react';

const PURPOSE_LABELS: Record<ConsentPurpose, { title: string; description: string }> = {
  events: {
    title: 'Events',
    description: 'Invites + reminders for events in your country. Off = no event mail.',
  },
  marketing: {
    title: 'Marketing',
    description: 'Newsletter + announcements about the AI Qadam platform.',
  },
  research: {
    title: 'Research',
    description: 'Surveys + interviews. ~5 minutes of your time, ~quarterly.',
  },
  recruiting: {
    title: 'Recruiting',
    description:
      'When employer-partners post relevant openings, opt in to be on their candidate feed.',
  },
  sponsor_share: {
    title: 'Sponsor share (aggregated)',
    description: 'Sponsors see aggregated cohort metrics including yours. Never raw personal data.',
  },
  content: {
    title: 'Content',
    description: 'Paid premium content + member-only deep dives when they launch.',
  },
  paid_premium: {
    title: 'Paid premium',
    description: 'Paid offerings (cohort courses, workshops) we may bring to members later.',
  },
};

function consentByPurpose(
  consents: { purpose: ConsentPurpose; granted: boolean }[],
): Record<ConsentPurpose, boolean> {
  const out = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, false] as const)) as Record<
    ConsentPurpose,
    boolean
  >;
  for (const c of consents) out[c.purpose] = c.granted;
  return out;
}

export function ConsentList(): ReactElement {
  const profile = useMyFullProfile();
  const update = useUpdateConsent();

  if (profile.isPending) {
    return <p className="text-xs text-muted-foreground">Loading consents…</p>;
  }
  if (profile.error || !profile.data) {
    return (
      <p className="text-xs text-destructive">Consents unavailable. Reload the page to retry.</p>
    );
  }

  const map = consentByPurpose(profile.data.consents);

  const onToggle = (purpose: ConsentPurpose, next: boolean): void => {
    update.mutate({ purpose, granted: next });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-foreground">Consents</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Default off. Toggle the ones you want. Transactional messages (event confirmations,
          password resets) are always sent.
        </p>
      </div>
      <ul className="list-none p-0 m-0">
        {CONSENT_PURPOSES.map((purpose) => {
          const label = PURPOSE_LABELS[purpose];
          const granted = map[purpose];
          const isPending = update.isPending && update.variables?.purpose === purpose;
          return (
            <li
              key={purpose}
              className="flex items-start gap-4 px-5 py-3.5 border-b border-border last:border-b-0"
            >
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground mb-0.5">{label.title}</p>
                <p className="text-xs text-muted-foreground">{label.description}</p>
              </div>
              <Button
                variant={granted ? 'default' : 'outline'}
                onClick={() => onToggle(purpose, !granted)}
                disabled={isPending}
                aria-pressed={granted}
                className="shrink-0 min-w-[96px]"
              >
                {isPending ? '…' : granted ? 'Granted' : 'Revoked'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ConsentList;
