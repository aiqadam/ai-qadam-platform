import { type ReactElement, useEffect, useState } from 'react';
import { type ShareLink, buildAllShareLinks } from '../lib/share-urls';

// F-S5.2 — share buttons on event detail page.
//
// Signed-in members: fetch their referral code and embed `?ref=CODE` in
// the shared URL so the per-member attribution + referral-points loop
// (F-S3.6 / F-S3.9) credits them when the click converts.
// Anonymous viewers: share without a code — UTM still tracks the channel.
//
// The /v1/referrals/mine call is best-effort: 401 / network error → we
// just render anonymous-mode buttons. Never blocks the buttons from
// rendering.

interface Props {
  eventId: string;
  eventTitle: string;
  eventUrl: string;
}

interface ReferralCode {
  id: string;
  code: string;
  shareUrl: string;
  validUntil: string | null;
  createdAt: string;
}

async function tryFetchOwnReferralCode(): Promise<string | null> {
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) return null;
    const { accessToken } = (await refresh.json()) as { accessToken: string };
    const res = await fetch('/api/v1/referrals/mine', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const { codes } = (await res.json()) as { codes: ReferralCode[] };
    return codes[0]?.code ?? null;
  } catch {
    return null;
  }
}

export default function EventShareButtons({ eventId, eventTitle, eventUrl }: Props): ReactElement {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    tryFetchOwnReferralCode().then((code) => {
      if (!cancelled) {
        setReferralCode(code);
        setResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render anon-mode buttons immediately; swap to member-mode once the
  // code resolves. No spinner — the buttons work either way; the only
  // visible difference is the ref= query parameter on the shared link.
  const links: ShareLink[] = buildAllShareLinks({
    eventId,
    eventTitle,
    eventUrl,
    referralCode,
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 16,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--card)',
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          margin: 0,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Share
        {resolved && referralCode ? (
          <span style={{ marginLeft: 8, color: 'var(--primary)' }}>· brings you +25 pts</span>
        ) : null}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {links.map((link) => (
          <a
            key={link.channel}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            data-share-channel={link.channel}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
