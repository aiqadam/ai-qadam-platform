import type { EmailMessage } from '../email.service';

// First-event welcome (T-1 from customer-surface-finishline plan).
// Fires once per member, when their first registration row flips to
// `status='registered'`. Distinct from registration-confirmed which
// fires for EVERY registration — this one is the personal welcome
// that should arrive alongside (or just after) the per-event ticket.
//
// Copy is intentionally low-key and free of spam-filter triggers:
//   - No ALL CAPS, no exclamation chains, no "FREE" / "URGENT" / "ACT NOW"
//   - One outbound link (the /me dashboard)
//   - Plain text + minimal HTML, both mirror each other
//   - Sender: no-reply@aiqadam.org (DKIM/SPF/DMARC pass on outbound)
//   - Subject under 60 chars, no clickbait

interface FirstEventWelcomeInput {
  recipientEmail: string;
  recipientName?: string;
  eventTitle: string;
  eventStartsAt: Date;
  webBaseUrl: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function firstEventWelcome(input: FirstEventWelcomeInput): EmailMessage {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : 'Hi,';
  const when = dateFormatter.format(input.eventStartsAt);
  const meUrl = `${input.webBaseUrl}/me`;

  const text = [
    greeting,
    '',
    `Thanks for joining AI Qadam. You're signed up for ${input.eventTitle} on ${when} — your first event with us.`,
    '',
    "Here's what to expect from here on out:",
    '',
    '- A separate confirmation with your check-in QR code arrives in your inbox shortly.',
    "- We'll send one short reminder the day before the event. No other email until then.",
    '- Once you check in at the door, your account picks up a starter badge and your first points on the leaderboard.',
    '',
    `Your dashboard with registrations, badges, and recommended events lives here: ${meUrl}`,
    '',
    'If a question comes up before the event, replying to this email reaches a real person.',
    '',
    '— Binali Rustamov',
    'Founder, AI Qadam',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111; line-height: 1.55;">
  <p>${greeting}</p>
  <p>Thanks for joining AI Qadam. You're signed up for <strong>${escapeHtml(input.eventTitle)}</strong> on ${escapeHtml(when)} — your first event with us.</p>
  <p>Here's what to expect from here on out:</p>
  <ul>
    <li>A separate confirmation with your check-in QR code arrives in your inbox shortly.</li>
    <li>We'll send one short reminder the day before the event. No other email until then.</li>
    <li>Once you check in at the door, your account picks up a starter badge and your first points on the leaderboard.</li>
  </ul>
  <p>Your dashboard with registrations, badges, and recommended events lives here: <a href="${escapeHtml(meUrl)}" style="color: #0d8a8b;">${escapeHtml(meUrl)}</a></p>
  <p>If a question comes up before the event, replying to this email reaches a real person.</p>
  <p style="margin-top: 32px;">— Binali Rustamov<br/><span style="color: #6b7280; font-size: 13px;">Founder, AI Qadam</span></p>
</body></html>`;

  return {
    to: input.recipientEmail,
    subject: `Welcome to AI Qadam — ${input.eventTitle} is locked in`,
    text,
    html,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
