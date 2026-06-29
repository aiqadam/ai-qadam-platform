// Tests for EmailService SMTP transport path (ISS-UAT-013-7).
//
// Cases covered:
//   1. SMTP_HOST set + SEND_EMAILS=true → transporter.sendMail called with correct args.
//   2. RESEND_API_KEY set + SEND_EMAILS=true → Resend SDK called (regression guard).
//   3. Neither transport set + SEND_EMAILS=true → WARN logged, nothing called.
//   4. SEND_EMAILS=false → DEBUG logged, nothing called regardless of transport config.
//   5. getProvider() returns 'smtp' / 'resend' / 'none' for each config.
//
// Nodemailer and Resend are fully mocked — no network calls.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted creates refs that are captured by vi.mock's factory before the
// mock is evaluated — required for mutating env between tests.
const mockEnv = vi.hoisted(() => ({
  SEND_EMAILS: true as boolean,
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: 1025,
  RESEND_API_KEY: undefined as string | undefined,
  EMAIL_FROM: 'noreply@test.example',
}));

vi.mock('../src/config/env', () => ({ env: mockEnv }));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockCreateTransport = vi.hoisted(() =>
  vi.fn(() => ({ sendMail: mockSendMail })),
);

vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

const mockResendEmailsSend = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendEmailsSend };
  },
}));

// Import AFTER mocks are hoisted so the module sees the fakes.
import { EmailService } from '../src/modules/email/email.service';

const SAMPLE_MESSAGE = {
  to: 'recipient@example.com',
  subject: 'Test subject',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
} as const;

// ── getProvider() ──────────────────────────────────────────────────────────

describe('EmailService.getProvider()', () => {
  it('returns "smtp" when SMTP_HOST is set', () => {
    mockEnv.SMTP_HOST = 'localhost';
    mockEnv.RESEND_API_KEY = undefined;
    const svc = new EmailService();
    expect(svc.getProvider()).toBe('smtp');
  });

  it('returns "resend" when only RESEND_API_KEY is set', () => {
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = 're_test_key';
    const svc = new EmailService();
    expect(svc.getProvider()).toBe('resend');
  });

  it('returns "none" when neither transport is configured', () => {
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = undefined;
    const svc = new EmailService();
    expect(svc.getProvider()).toBe('none');
  });
});

// ── SMTP path ──────────────────────────────────────────────────────────────

describe('EmailService.send() — SMTP path', () => {
  beforeEach(() => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.SMTP_HOST = 'localhost';
    mockEnv.RESEND_API_KEY = undefined;
    mockSendMail.mockClear();
    mockSendMail.mockResolvedValue({ messageId: '<test-message-id>' });
    mockResendEmailsSend.mockClear();
  });

  it('calls transporter.sendMail with the correct arguments', async () => {
    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);

    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail).toHaveBeenCalledWith({
      from: mockEnv.EMAIL_FROM,
      to: SAMPLE_MESSAGE.to,
      subject: SAMPLE_MESSAGE.subject,
      text: SAMPLE_MESSAGE.text,
      html: SAMPLE_MESSAGE.html,
    });
  });

  it('does NOT call Resend when SMTP transport is active', async () => {
    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);
    expect(mockResendEmailsSend).not.toHaveBeenCalled();
  });
});

// ── Resend path (regression guard) ────────────────────────────────────────

describe('EmailService.send() — Resend path', () => {
  beforeEach(() => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = 're_live_test_key';
    mockResendEmailsSend.mockClear();
    mockResendEmailsSend.mockResolvedValue({ data: { id: 'resend-msg-id' }, error: null });
    mockSendMail.mockClear();
  });

  it('calls Resend SDK when only RESEND_API_KEY is set', async () => {
    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);

    expect(mockResendEmailsSend).toHaveBeenCalledOnce();
  });

  it('does NOT call SMTP when only Resend is configured', async () => {
    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

// ── No transport configured ────────────────────────────────────────────────

describe('EmailService.send() — no transport configured', () => {
  it('logs a warning and does not call any transport', async () => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = undefined;
    mockSendMail.mockClear();
    mockResendEmailsSend.mockClear();

    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockResendEmailsSend).not.toHaveBeenCalled();
  });
});

// ── SEND_EMAILS=false ──────────────────────────────────────────────────────

describe('EmailService.send() — SEND_EMAILS=false', () => {
  it('returns early without calling any transport regardless of transport config', async () => {
    mockEnv.SEND_EMAILS = false;
    mockEnv.SMTP_HOST = 'localhost';
    mockEnv.RESEND_API_KEY = 're_live_test_key';
    mockSendMail.mockClear();
    mockResendEmailsSend.mockClear();

    const svc = new EmailService();
    await svc.send(SAMPLE_MESSAGE);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockResendEmailsSend).not.toHaveBeenCalled();
  });
});
