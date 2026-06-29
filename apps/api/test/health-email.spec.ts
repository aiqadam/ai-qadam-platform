// Tests for GET /health/email (ISS-UAT-013-7).
//
// Cases covered:
//   1. getProvider() returns 'smtp'   → { configured: true,  provider: 'smtp' }
//   2. getProvider() returns 'resend' → { configured: true,  provider: 'resend' }
//   3. getProvider() returns 'none'   → { configured: false, provider: 'none' }
//
// No live infra — EmailService.getProvider() is stubbed via vi.fn().

import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/health/health.controller';
import type { EmailService } from '../src/modules/email/email.service';

function makeController(provider: 'smtp' | 'resend' | 'none'): HealthController {
  const emailService = {
    getProvider: vi.fn<[], 'smtp' | 'resend' | 'none'>().mockReturnValue(provider),
  } as unknown as EmailService;
  return new HealthController(emailService);
}

describe('HealthController.emailHealth()', () => {
  it('returns { configured: true, provider: "smtp" } when SMTP is active', () => {
    const ctrl = makeController('smtp');
    expect(ctrl.emailHealth()).toEqual({ configured: true, provider: 'smtp' });
  });

  it('returns { configured: true, provider: "resend" } when Resend is active', () => {
    const ctrl = makeController('resend');
    expect(ctrl.emailHealth()).toEqual({ configured: true, provider: 'resend' });
  });

  it('returns { configured: false, provider: "none" } when no transport is configured', () => {
    const ctrl = makeController('none');
    expect(ctrl.emailHealth()).toEqual({ configured: false, provider: 'none' });
  });
});
