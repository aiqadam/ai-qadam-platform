// F-S5.2 — share-URL construction for event detail page buttons.
//
// Three channels for v1: Telegram, X (Twitter), LinkedIn. UTM scheme
// follows docs/02-business-processes/marketing-utm-scheme.md:
//   utm_source = member-share | anon-share  (who's doing the sharing)
//   utm_medium = telegram_share | x_share | linkedin_share  (channel-typed)
//   utm_campaign = event-{id}  (the thing being promoted)
//
// When a signed-in member shares, we append `&ref={code}` so the per-member
// attribution + referral-points loop (F-S3.6 / F-S3.9) lights up. Anonymous
// shares get UTM only — there's no member to attribute to.

export type ShareChannel = 'telegram' | 'x' | 'linkedin';

export interface ShareInput {
  eventId: string;
  eventTitle: string;
  eventUrl: string; // canonical URL of the event detail page
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

export function buildEventTrackedUrl(input: ShareInput, channel: ShareChannel): string {
  const url = new URL(input.eventUrl);
  url.searchParams.set('utm_source', input.referralCode ? 'member-share' : 'anon-share');
  url.searchParams.set('utm_medium', `${channel}_share`);
  url.searchParams.set('utm_campaign', `event-${input.eventId}`);
  if (input.referralCode && input.referralCode.length > 0) {
    url.searchParams.set('ref', input.referralCode);
  }
  return url.toString();
}

export function buildShareLink(input: ShareInput, channel: ShareChannel): ShareLink {
  const trackedUrl = buildEventTrackedUrl(input, channel);
  const text = input.eventTitle;
  const href =
    channel === 'telegram'
      ? `https://t.me/share/url?url=${encodeURIComponent(trackedUrl)}&text=${encodeURIComponent(text)}`
      : channel === 'x'
        ? `https://x.com/intent/post?url=${encodeURIComponent(trackedUrl)}&text=${encodeURIComponent(text)}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(trackedUrl)}`;
  return { channel, href, label: CHANNEL_LABELS[channel] };
}

export const ALL_SHARE_CHANNELS: ShareChannel[] = ['telegram', 'x', 'linkedin'];

export function buildAllShareLinks(input: ShareInput): ShareLink[] {
  return ALL_SHARE_CHANNELS.map((c) => buildShareLink(input, c));
}
