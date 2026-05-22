import type { EmailMessage } from '../email.service';

interface TelegramLinkCodeInput {
  recipientEmail: string;
  recipientName?: string;
  code: string;
  expiresInMinutes: number;
}

// Email body for the bot's /link flow per ADR-0034. The 6-digit code is
// short-lived (typically 5 min, configurable in TelegramService); the
// user pastes it back into Telegram to confirm ownership of both
// surfaces. No links here — the entire confirmation happens in the bot
// chat, so we avoid any clickjacking surface.
export function telegramLinkCode(input: TelegramLinkCodeInput): EmailMessage {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : 'Hi,';

  const text = [
    greeting,
    '',
    'Someone just requested to link this email to a Telegram account on AI Qadam.',
    '',
    `Your verification code: ${input.code}`,
    '',
    `This code expires in ${input.expiresInMinutes} minutes. Paste it back into the bot to confirm.`,
    '',
    "If this wasn't you, ignore this email — no link was created.",
    '',
    '— AI Qadam',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>${greeting}</p>
  <p>Someone just requested to link this email to a Telegram account on AI Qadam.</p>
  <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">Your verification code:</p>
  <p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; font-weight: 600; letter-spacing: 0.2em; color: #111; margin: 0;">${escapeHtml(input.code)}</p>
  <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">This code expires in ${input.expiresInMinutes} minutes. Paste it back into the bot to confirm.</p>
  <p style="margin-top: 32px; color: #6b7280; font-size: 13px;">If this wasn't you, ignore this email — no link was created.</p>
  <p style="margin-top: 16px; color: #6b7280; font-size: 13px;">— AI Qadam</p>
</body></html>`;

  return {
    to: input.recipientEmail,
    subject: 'Your AI Qadam Telegram link code',
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
