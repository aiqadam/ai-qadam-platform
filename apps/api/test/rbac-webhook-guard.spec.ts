import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { RbacWebhookGuard } from '../src/modules/rbac-sync/rbac-webhook.guard';

// F-S2.2-h — URL-path-secret guard tests. The vitest env sets
// AUTHENTIK_WEBHOOK_SECRET to a placeholder; the guard timing-safe
// compares req.params.secret against it.

const TEST_SECRET = 'test-authentik-webhook-secret-32+chars-padding-pad-pad';

let guard: RbacWebhookGuard;

beforeEach(() => {
  guard = new RbacWebhookGuard();
});

function ctx(secretParam: string | undefined): ExecutionContext {
  const req = { params: secretParam === undefined ? {} : { secret: secretParam } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RbacWebhookGuard (URL-path secret)', () => {
  it('returns true when path secret matches', () => {
    expect(guard.canActivate(ctx(TEST_SECRET))).toBe(true);
  });

  it('rejects with 401 when secret param is missing', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(/missing_secret/);
  });

  it('rejects with 401 when secret length differs', () => {
    expect(() => guard.canActivate(ctx('too-short'))).toThrow(/secret_mismatch/);
  });

  it('rejects with 401 when secret value differs but length matches', () => {
    const wrong = 'x'.repeat(TEST_SECRET.length);
    expect(() => guard.canActivate(ctx(wrong))).toThrow(/secret_mismatch/);
  });
});
