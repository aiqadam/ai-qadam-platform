// L3 block — <LinkedAccountsPanel>.
//
// FR-AUTH-007: shows all four sign-in providers (Email, Google, GitHub,
// Telegram) with linked state and link/unlink actions. Replaces the
// previous single-provider <TelegramLinkStatus> block on /me.
//
// Link flow for Google/GitHub: top-level browser navigation to
// /api/v1/auth/link?provider=<p> — the API reads the refresh cookie,
// sets a LINK_COOKIE, and redirects to Authentik. On return the callback
// redirects to /me?linked=<p> and this panel detects the query param to
// show a success toast.

import { IslandRoot } from '@/lib/island-root';
import {
  type LinkedAccountEntry,
  type LinkedProvider,
  useLinkedAccounts,
  useUnlinkProvider,
} from '@/lib/use-linked-accounts';
import { Github, Mail, MessageSquare, MonitorSmartphone } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

// Provider display metadata — maps API provider slug to UI labels and icons.
const PROVIDER_META: Record<
  LinkedProvider,
  { label: string; Icon: (props: { size: number; className: string; 'aria-hidden': true }) => ReactElement }
> = {
  email: {
    label: 'Email',
    Icon: (props) => <Mail {...props} />,
  },
  google: {
    label: 'Google',
    // Lucide has no Chrome/Google icon; MonitorSmartphone is a neutral
    // fallback that doesn't introduce a non-Lucide library (AGENTS.md §11).
    Icon: (props) => <MonitorSmartphone {...props} />,
  },
  github: {
    label: 'GitHub',
    Icon: (props) => <Github {...props} />,
  },
  telegram: {
    label: 'Telegram',
    Icon: (props) => <MessageSquare {...props} />,
  },
};

function ProviderRow({
  entry,
  onUnlink,
  isUnlinking,
}: {
  entry: LinkedAccountEntry;
  onUnlink: (provider: LinkedProvider) => void;
  isUnlinking: boolean;
}): ReactElement {
  const meta = PROVIDER_META[entry.provider];
  const { Icon } = meta;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <Icon size={20} className="text-muted-foreground shrink-0" aria-hidden={true} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{meta.label}</p>
        {entry.linked && entry.handle ? (
          <p className="text-xs text-muted-foreground font-mono truncate">{entry.handle}</p>
        ) : entry.linked ? (
          <p className="text-xs text-muted-foreground">Linked</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not linked</p>
        )}
      </div>
      <div className="shrink-0">
        {entry.provider === 'email' ? null : entry.provider === 'telegram' ? (
          !entry.linked ? (
            <p className="text-xs text-muted-foreground font-mono">
              /link in @aiqadam_bot
            </p>
          ) : entry.canUnlink ? (
            <button
              type="button"
              onClick={() => onUnlink(entry.provider)}
              disabled={isUnlinking}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Unlink
            </button>
          ) : null
        ) : entry.linked ? (
          entry.canUnlink ? (
            <button
              type="button"
              onClick={() => onUnlink(entry.provider)}
              disabled={isUnlinking}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Unlink
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={() => {
              window.location.href = `/api/v1/auth/link?provider=${entry.provider}`;
            }}
            className="text-xs text-primary hover:underline"
          >
            Link
          </button>
        )}
      </div>
    </div>
  );
}

function LinkedAccountsPanelInner(): ReactElement {
  const accounts = useLinkedAccounts();
  const unlink = useUnlinkProvider();
  const [successProvider, setSuccessProvider] = useState<string | null>(null);

  // Detect ?linked={provider} on mount — set by callback() after a link flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    if (linked) {
      setSuccessProvider(linked);
      // Remove the param from the URL without a page reload.
      const url = new URL(window.location.href);
      url.searchParams.delete('linked');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  if (accounts.isPending) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-xs text-muted-foreground">Loading sign-in methods…</p>
      </div>
    );
  }

  if (accounts.error || !accounts.data) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-xs text-destructive">
          Could not load sign-in methods. Reload the page to retry.
        </p>
      </div>
    );
  }

  function handleUnlink(provider: LinkedProvider): void {
    unlink.mutate(provider);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-foreground">Sign-in methods</h2>
      </div>

      {successProvider ? (
        <div className="px-5 py-2 bg-success/10 border-b border-border">
          <p className="text-xs text-success font-medium">
            {successProvider.charAt(0).toUpperCase() + successProvider.slice(1)} linked
            successfully.
          </p>
        </div>
      ) : null}

      {unlink.isError ? (
        <div className="px-5 py-2 bg-destructive/10 border-b border-border">
          <p className="text-xs text-destructive">
            {unlink.error.message.includes('must keep at least one')
              ? 'You must keep at least one sign-in method.'
              : 'Unlink failed. Please try again.'}
          </p>
        </div>
      ) : null}

      <div className="px-5">
        {accounts.data.map((entry) => (
          <ProviderRow
            key={entry.provider}
            entry={entry}
            onUnlink={handleUnlink}
            isUnlinking={unlink.isPending}
          />
        ))}
      </div>
    </div>
  );
}

export function LinkedAccountsPanel(): ReactElement {
  return (
    <IslandRoot>
      <LinkedAccountsPanelInner />
    </IslandRoot>
  );
}
