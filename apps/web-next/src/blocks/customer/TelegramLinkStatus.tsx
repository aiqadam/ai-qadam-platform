// L3 block — <TelegramLinkStatus>.
//
// Read-only Telegram link status section on /me. Shows the linked
// @username when present, or a plain-text instruction to link via the
// bot. Phase 1 per FR-AUTH-005 requirement validation: no QR code,
// no in-page initiation flow — just status display + bot CTA.
//
// Wiring: reads telegram_user_id / telegram_username from
// useMyFullProfile() (profile.data.profile). Same data-in pattern
// as ConsentList and SkillTagger.

import { IslandRoot } from '@/lib/island-root';
import { useMyFullProfile } from '@/lib/use-me-profile';
import { MessageSquare } from 'lucide-react';
import { type ReactElement } from 'react';

function TelegramLinkStatusInner(): ReactElement {
  const profile = useMyFullProfile();

  if (profile.isPending) {
    return <p className="text-xs text-muted-foreground">Loading Telegram status…</p>;
  }
  if (profile.error || !profile.data) {
    return (
      <p className="text-xs text-destructive">
        Telegram status unavailable. Reload the page to retry.
      </p>
    );
  }

  const { telegram_user_id, telegram_username } = profile.data.profile;
  const isLinked = telegram_user_id != null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <MessageSquare
          size={20}
          stroke="currentColor"
          className="text-muted-foreground shrink-0"
          aria-hidden="true"
        />
        <h2 className="font-display text-lg font-semibold text-foreground">Telegram</h2>
      </div>
      <div className="px-5 py-4">
        {isLinked ? (
          <p className="text-sm text-foreground">
            {telegram_username ? (
              <>
                <span className="font-mono text-[13px]">@{telegram_username}</span>
                {' — linked'}
              </>
            ) : (
              'Account linked'
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {'Not linked — type '}
            <span className="font-mono text-[13px] text-foreground">/link</span>
            {' in '}
            <span className="font-mono text-[13px] text-foreground">@aiqadam_bot</span>
            {' to connect your account.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function TelegramLinkStatus(): ReactElement {
  return (
    <IslandRoot>
      <TelegramLinkStatusInner />
    </IslandRoot>
  );
}
