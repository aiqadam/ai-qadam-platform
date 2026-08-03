// L3 block — <ChannelToggles>.
//
// FR-NTF-005 — Master notification channel toggles (email on/off, Telegram on/off).
//
// Fetches channel state from GET /v1/me/preferences/consents (extended in FR-NTF-005)
// and updates via PATCH /v1/me/preferences/consents. These toggles suppress ALL
// notifications on the respective channel, overriding per-topic consents.
//
// Wiring: docs/04-development/architecture/wiring-map.md → directus_users.notification_*_enabled

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactElement } from 'react';

interface ChannelToggles {
  notification_email_enabled: boolean;
  notification_telegram_enabled: boolean;
}

interface PreferencesResponse {
  consents: Array<{ topic: string; granted: boolean }>;
  channels: ChannelToggles;
}

async function fetchPreferences(): Promise<PreferencesResponse> {
  const res = await fetch('/v1/me/preferences/consents', {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  return res.json();
}

async function updateChannelToggle(
  channel: 'notification_email_enabled' | 'notification_telegram_enabled',
  enabled: boolean,
): Promise<ChannelToggles> {
  const res = await fetch('/v1/me/preferences/consents', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [channel]: enabled }),
  });
  if (!res.ok) throw new Error('Failed to update channel toggle');
  const data = await res.json();
  return data.channels;
}

function ChannelTogglesInner(): ReactElement {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: fetchPreferences,
  });

  const emailMutation = useMutation({
    mutationFn: (enabled: boolean) => updateChannelToggle('notification_email_enabled', enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['preferences'] });
    },
  });

  const telegramMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateChannelToggle('notification_telegram_enabled', enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['preferences'] });
    },
  });

  if (query.isPending) {
    return <p className="text-xs text-muted-foreground">Loading channel toggles…</p>;
  }
  if (query.error || !query.data) {
    return (
      <p className="text-xs text-destructive">
        Channel toggles unavailable. Reload the page to retry.
      </p>
    );
  }

  const { channels } = query.data;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-foreground">Notification Channels</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Master toggles. Turning off a channel stops ALL notifications on that channel,
          overriding all other settings.
        </p>
      </div>
      <ul className="list-none p-0 m-0">
        <li className="flex items-start gap-4 px-5 py-3.5 border-b border-border">
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground mb-0.5">Email notifications</p>
            <p className="text-xs text-muted-foreground">
              Includes reminders, announcements, and confirmations. Turn off to stop all emails.
            </p>
          </div>
          <Button
            variant={channels.notification_email_enabled ? 'default' : 'outline'}
            onClick={() => emailMutation.mutate(!channels.notification_email_enabled)}
            disabled={emailMutation.isPending}
            aria-pressed={channels.notification_email_enabled}
            className="shrink-0 min-w-[96px]"
          >
            {emailMutation.isPending ? '…' : channels.notification_email_enabled ? 'On' : 'Off'}
          </Button>
        </li>
        <li className="flex items-start gap-4 px-5 py-3.5">
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground mb-0.5">Telegram notifications</p>
            <p className="text-xs text-muted-foreground">
              Direct messages from the bot. Turn off to stop all Telegram DMs.
            </p>
          </div>
          <Button
            variant={channels.notification_telegram_enabled ? 'default' : 'outline'}
            onClick={() => telegramMutation.mutate(!channels.notification_telegram_enabled)}
            disabled={telegramMutation.isPending}
            aria-pressed={channels.notification_telegram_enabled}
            className="shrink-0 min-w-[96px]"
          >
            {telegramMutation.isPending
              ? '…'
              : channels.notification_telegram_enabled
                ? 'On'
                : 'Off'}
          </Button>
        </li>
      </ul>
    </div>
  );
}

export function ChannelToggles(): ReactElement {
  return (
    <IslandRoot>
      <ChannelTogglesInner />
    </IslandRoot>
  );
}

export default ChannelToggles;
