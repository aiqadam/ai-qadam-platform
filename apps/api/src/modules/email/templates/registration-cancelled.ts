import type { EmailMessage } from '../email.service';

interface RegistrationCancelledInput {
  recipientEmail: string;
  recipientName?: string;
  eventTitle: string;
  webBaseUrl: string;
}

export function registrationCancelled(input: RegistrationCancelledInput): EmailMessage {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : 'Hi,';
  const eventsUrl = `${input.webBaseUrl}/events`;

  const text = [
    greeting,
    '',
    `Your registration for ${input.eventTitle} has been cancelled.`,
    '',
    `If this was a mistake, you can re-register from ${eventsUrl}.`,
    '',
    '— AI Qadam',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>${greeting}</p>
  <p>Your registration for <strong>${escapeHtml(input.eventTitle)}</strong> has been cancelled.</p>
  <p style="margin-top: 24px;">If this was a mistake, you can re-register: <a href="${escapeHtml(eventsUrl)}" style="color: #4f46e5;">browse events →</a></p>
  <p style="margin-top: 32px; color: #6b7280; font-size: 13px;">— AI Qadam</p>
</body></html>`;

  return {
    to: input.recipientEmail,
    subject: `Cancelled: ${input.eventTitle}`,
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
