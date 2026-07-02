// Tests for GET /health/email (ISS-UAT-013-7).
//
// Cases covered (6 total):
//   1. SMTP active     → { configured: true,  provider: 'smtp',    mode: 'uat' }
//   2. Resend active   → { configured: true,  provider: 'resend',  mode: 'production' }
//   3. No transport    → { configured: false, provider: 'none',    mode: 'disabled' }
//   4. Disabled tri-state via stubbed getMode() — even with provider 'smtp'
//      mode can be 'disabled' (e.g. SEND_EMAILS=false overrides transport).
//   5. UAT tri-state via stubbed getMode() — SMTP + development.
//   6. Production tri-state via stubbed getMode() — Resend + production.
//
// No live infra — EmailService.getProvider() and getMode() are stubbed via vi.fn().

import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/health/health.controller';
import type { EmailService } from '../src/modules/email/email.service';

// All literal provider / mode strings used in this file live here so a future
// change to the union type updates them in one place. AGENTS.md §1.3.
const PROVIDER_SMTP = 'smtp' as const;
const PROVIDER_RESEND = 'resend' as const;
const PROVIDER_NONE = 'none' as const;
const MODE_UAT = 'uat' as const;
const MODE_PRODUCTION = 'production' as const;
const MODE_DISABLED = 'disabled' as const;

type Provider = typeof PROVIDER_SMTP | typeof PROVIDER_RESEND | typeof PROVIDER_NONE;
type Mode = typeof MODE_UAT | typeof MODE_PRODUCTION | typeof MODE_DISABLED;

function makeController(provider: Provider, mode: Mode): HealthController {
  const emailService = {
    getProvider: vi.fn<[], Provider>().mockReturnValue(provider),
    getMode: vi.fn<[], Mode>().mockReturnValue(mode),
  } as unknown as EmailService;
  return new HealthController(emailService);
}

describe('HealthController.emailHealth()', () => {
  it('returns { configured: true, provider: "smtp", mode: "uat" } when SMTP is active in dev', () => {
    const ctrl = makeController(PROVIDER_SMTP, MODE_UAT);
    expect(ctrl.emailHealth()).toEqual({
      configured: true,
      provider: PROVIDER_SMTP,
      mode: MODE_UAT,
    });
  });

  it('returns { configured: true, provider: "resend", mode: "production" } when Resend is active in prod', () => {
    const ctrl = makeController(PROVIDER_RESEND, MODE_PRODUCTION);
    expect(ctrl.emailHealth()).toEqual({
      configured: true,
      provider: PROVIDER_RESEND,
      mode: MODE_PRODUCTION,
    });
  });

  it('returns { configured: false, provider: "none", mode: "disabled" } when nothing is configured', () => {
    const ctrl = makeController(PROVIDER_NONE, MODE_DISABLED);
    expect(ctrl.emailHealth()).toEqual({
      configured: false,
      provider: PROVIDER_NONE,
      mode: MODE_DISABLED,
    });
  });

  it('returns mode "disabled" even when a transport is configured (SEND_EMAILS=false override)', () => {
    // Edge case: SEND_EMAILS=false short-circuits everything in send(),
    // so a stale SMTP_HOST config still reports mode=disabled.
    const ctrl = makeController(PROVIDER_SMTP, MODE_DISABLED);
    expect(ctrl.emailHealth()).toEqual({
      configured: true,
      provider: PROVIDER_SMTP,
      mode: MODE_DISABLED,
    });
  });

  it('returns mode "uat" when provider is smtp and NODE_ENV is development', () => {
    const ctrl = makeController(PROVIDER_SMTP, MODE_UAT);
    expect(ctrl.emailHealth().mode).toBe(MODE_UAT);
  });

  it('returns mode "production" when provider is resend and NODE_ENV is production', () => {
    const ctrl = makeController(PROVIDER_RESEND, MODE_PRODUCTION);
    expect(ctrl.emailHealth().mode).toBe(MODE_PRODUCTION);
  });
});