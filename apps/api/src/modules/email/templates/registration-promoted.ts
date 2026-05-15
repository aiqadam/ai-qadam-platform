import type { EmailMessage } from '../email.service';

interface RegistrationPromotedInput {
  recipientEmail: string;
  recipientName?: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventLocation: string | null;
  webBaseUrl: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function registrationPromoted(input: RegistrationPromotedInput): EmailMessage {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : 'Hi,';
  const when = dateFormatter.format(input.eventStartsAt);
  const where = input.eventLocation ?? 'Online';
  const eventsUrl = `${input.webBaseUrl}/events`;

  const text = [
    greeting,
    '',
    `A spot opened up — you're now confirmed for ${input.eventTitle}!`,
    '',
    `When: ${when}`,
    `Where: ${where}`,
    '',
    `See your registrations: ${eventsUrl}`,
    '',
    '— AI Qadam',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>${greeting}</p>
  <p>A spot opened up — you're now confirmed for <strong>${escapeHtml(input.eventTitle)}</strong>!</p>
  <p style="margin-top: 24px;"><strong>When:</strong> ${escapeHtml(when)}<br/><strong>Where:</strong> ${escapeHtml(where)}</p>
  <p style="margin-top: 24px;"><a href="${escapeHtml(eventsUrl)}" style="color: #4f46e5;">View your registrations →</a></p>
  <p style="margin-top: 32px; color: #6b7280; font-size: 13px;">— AI Qadam</p>
</body></html>`;

  return {
    to: input.recipientEmail,
    subject: `You're confirmed: ${input.eventTitle}`,
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
