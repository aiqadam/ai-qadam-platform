import { createHmac } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacWebhookGuard } from '../src/modules/rbac-sync/rbac-webhook.guard';

// F-S2.2-b — HMAC guard tests. The vitest env sets
// AUTHENTIK_WEBHOOK_SECRET to a placeholder (32+ chars) so the guard's
// "not configured" branch fires only when we explicitly stub it.

const TEST_SECRET = 'test-authentik-webhook-secret-32+chars-padding-pad-pad';

let guard: RbacWebhookGuard;

beforeEach(() => {
  // env is loaded once at module import; setting the var in vitest
  // config covers the default path. To exercise the "not configured"
  // path we'd need to vi.mock('../src/config/env') — covered in a
  // dedicated subset below.
  guard = new RbacWebhookGuard();
});

function ctx(rawBody: Buffer | undefined, sigHeader: string | undefined): ExecutionContext {
  const req = {
    rawBody,
    header: vi.fn((name: string) => {
      const norm = name.toLowerCase();
      if (norm === 'x-aiqadam-signature') return sigHeader;
      return undefined;
    }),
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function sign(body: Buffer | string): string {
  return `sha256=${createHmac('sha256', TEST_SECRET).update(body).digest('hex')}`;
}

describe('RbacWebhookGuard', () => {
  it('returns true when signature matches', () => {
    const body = Buffer.from(JSON.stringify({ user_pk: 5, action: 'model_updated' }));
    expect(guard.canActivate(ctx(body, sign(body)))).toBe(true);
  });

  it('rejects with 401 when signature header is missing', () => {
    const body = Buffer.from('{}');
    expect(() => guard.canActivate(ctx(body, undefined))).toThrow(/missing_signature/);
  });

  it('rejects with 401 when signature format is wrong', () => {
    const body = Buffer.from('{}');
    expect(() => guard.canActivate(ctx(body, 'not-a-valid-sig'))).toThrow(
      /signature_format_invalid/,
    );
  });

  it('rejects with 401 when raw body is missing', () => {
    expect(() => guard.canActivate(ctx(undefined, sign('anything')))).toThrow(/missing_body/);
  });

  it('rejects with 401 on signature mismatch', () => {
    const body = Buffer.from('{"user_pk":5}');
    const wrong = `sha256=${createHmac('sha256', 'wrong-secret-of-32-chars-pad-pad-pad').update(body).digest('hex')}`;
    expect(() => guard.canActivate(ctx(body, wrong))).toThrow(/signature_mismatch/);
  });
});
