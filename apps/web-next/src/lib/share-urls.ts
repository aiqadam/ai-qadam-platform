// Share-URL builder for event detail page <ShareButtons>.
//
// Three channels: Telegram, X (Twitter), LinkedIn. UTM scheme follows
// docs/02-business-processes/marketing-utm-scheme.md:
//
//   utm_source   = member-share | anon-share   (who shared)
//   utm_medium   = telegram_share | x_share | linkedin_share (channel)
//   utm_campaign = event-{id}                  (the thing being promoted)
//
// Member-share with a referral code appends `&ref={code}` so the
// referral-points loop credits the sharer (F-S3.6 / F-S3.9). Anonymous
// shares get UTM only.
//
// Pure builder — zero IO. Phase 1.4 ships anonymous-only; the member-
// referral-code lookup lands in Phase 1.5 alongside the member graph
// blocks (ProfileCard etc.) so we have one place to fetch referral
// codes server-side.

export type ShareChannel = 'telegram' | 'x' | 'linkedin';

export interface ShareInput {
  eventId: string;
  eventTitle: string;
  eventUrl: string;
  referralCode?: string | null;
}

export interface ShareLink {
  channel: ShareChannel;
  href: string;
  label: string;
}

const CHANNEL_LABELS: Record<ShareChannel, string> = {
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
};

function buildTrackedUrl(input: ShareInput, channel: ShareChannel): string {
  const url = new URL(input.eventUrl);
  url.searchParams.set('utm_source', input.referralCode ? 'member-share' : 'anon-share');
  url.searchParams.set('utm_medium', `${channel}_share`);
  url.searchParams.set('utm_campaign', `event-${input.eventId}`);
  if (input.referralCode && input.referralCode.length > 0) {
    url.searchParams.set('ref', input.referralCode);
  }
  return url.toString();
}

function telegramShare(input: ShareInput): string {
  const tracked = buildTrackedUrl(input, 'telegram');
  const url = new URL('https://t.me/share/url');
  url.searchParams.set('url', tracked);
  url.searchParams.set('text', input.eventTitle);
  return url.toString();
}

function xShare(input: ShareInput): string {
  const tracked = buildTrackedUrl(input, 'x');
  const url = new URL('https://twitter.com/intent/tweet');
  url.searchParams.set('text', input.eventTitle);
  url.searchParams.set('url', tracked);
  return url.toString();
}

function linkedinShare(input: ShareInput): string {
  const tracked = buildTrackedUrl(input, 'linkedin');
  const url = new URL('https://www.linkedin.com/sharing/share-offsite/');
  url.searchParams.set('url', tracked);
  return url.toString();
}

export function buildAllShareLinks(input: ShareInput): ShareLink[] {
  return [
    { channel: 'telegram', href: telegramShare(input), label: CHANNEL_LABELS.telegram },
    { channel: 'x', href: xShare(input), label: CHANNEL_LABELS.x },
    { channel: 'linkedin', href: linkedinShare(input), label: CHANNEL_LABELS.linkedin },
  ];
}
