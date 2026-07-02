// Tests for EmailService.getMode() — the tri-state derivation that
// drives /health/email and the UAT pre-flight.
//
// Rule (set in wf-20260701-uat-045 handoff.product_decisions.mode_derivation):
//   - SEND_EMAILS=false              → 'disabled'   (regardless of NODE_ENV)
//   - SEND_EMAILS=true  + production → 'production'
//   - SEND_EMAILS=true  + development/test/anything-else → 'uat'
//
// Cases covered (6 total):
//   1. SEND_EMAILS=false + NODE_ENV=development → 'disabled'
//   2. SEND_EMAILS=false + NODE_ENV=production  → 'disabled'  (disabled wins)
//   3. SEND_EMAILS=true  + NODE_ENV=production  → 'production'
//   4. SEND_EMAILS=true  + NODE_ENV=development → 'uat'
//   5. SEND_EMAILS=true  + NODE_ENV=test       → 'uat'
//   6. Idempotence on instance reuse — two calls return the same value
//      and don't depend on SMTP_HOST / RESEND_API_KEY (provider independence).
//
// vi.hoisted mirrors the pattern in email-service-smtp.spec.ts — mutating env
// between tests is safe because the mock factory captures the ref.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  SEND_EMAILS: true as boolean,
  NODE_ENV: 'development' as 'development' | 'test' | 'production',
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: 1025,
  RESEND_API_KEY: undefined as string | undefined,
  EMAIL_FROM: 'noreply@test.example',
}));

vi.mock('../src/config/env', () => ({ env: mockEnv }));

const mockSendMail = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

// Import AFTER mocks are hoisted so the module sees the fakes.
import { EmailService } from '../src/modules/email/email.service';

// Named constants for the three mode values (AGENTS.md §1.3 — no magic strings).
const MODE_DISABLED = 'disabled' as const;
const MODE_PRODUCTION = 'production' as const;
const MODE_UAT = 'uat' as const;

describe('EmailService.getMode()', () => {
  beforeEach(() => {
    // Reset to a known-neutral baseline before every case.
    mockEnv.SEND_EMAILS = true;
    mockEnv.NODE_ENV = 'development';
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = undefined;
  });

  it('returns "disabled" when SEND_EMAILS=false, regardless of NODE_ENV=development', () => {
    mockEnv.SEND_EMAILS = false;
    mockEnv.NODE_ENV = 'development';
    const svc = new EmailService();
    expect(svc.getMode()).toBe(MODE_DISABLED);
  });

  it('returns "disabled" when SEND_EMAILS=false, even if NODE_ENV=production', () => {
    // The disabled rule is checked FIRST, so production does not override it.
    mockEnv.SEND_EMAILS = false;
    mockEnv.NODE_ENV = 'production';
    const svc = new EmailService();
    expect(svc.getMode()).toBe(MODE_DISABLED);
  });

  it('returns "production" when SEND_EMAILS=true and NODE_ENV=production', () => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.NODE_ENV = 'production';
    const svc = new EmailService();
    expect(svc.getMode()).toBe(MODE_PRODUCTION);
  });

  it('returns "uat" when SEND_EMAILS=true and NODE_ENV=development', () => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.NODE_ENV = 'development';
    const svc = new EmailService();
    expect(svc.getMode()).toBe(MODE_UAT);
  });

  it('returns "uat" when SEND_EMAILS=true and NODE_ENV=test', () => {
    mockEnv.SEND_EMAILS = true;
    mockEnv.NODE_ENV = 'test';
    const svc = new EmailService();
    expect(svc.getMode()).toBe(MODE_UAT);
  });

  it('is idempotent on instance reuse and provider-independent', () => {
    // Two different transport configurations must yield the same mode
    // (only SEND_EMAILS + NODE_ENV matter — not SMTP_HOST/RESEND_API_KEY).
    mockEnv.SEND_EMAILS = true;
    mockEnv.NODE_ENV = 'development';

    mockEnv.SMTP_HOST = 'localhost';
    mockEnv.RESEND_API_KEY = undefined;
    const svcA = new EmailService();
    const first = svcA.getMode();
    const second = svcA.getMode();
    expect(first).toBe(MODE_UAT);
    expect(second).toBe(MODE_UAT);
    expect(first).toBe(second);

    // Swap the transport — mode must NOT change.
    mockEnv.SMTP_HOST = undefined;
    mockEnv.RESEND_API_KEY = 're_test_key';
    const svcB = new EmailService();
    expect(svcB.getMode()).toBe(MODE_UAT);
  });
});