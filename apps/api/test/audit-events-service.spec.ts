import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEventsService } from '../src/modules/audit/audit-events.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import { DirectusError } from '../src/modules/directus/directus.client';
import type { DirectusClient } from '../src/modules/directus/directus.client';

type FakeDirectus = { post: ReturnType<typeof vi.fn> };
type FakeBridge = { resolveDirectusId: ReturnType<typeof vi.fn> };

let directus: FakeDirectus;
let bridge: FakeBridge;
let svc: AuditEventsService;

beforeEach(() => {
  directus = { post: vi.fn().mockResolvedValue({ data: { id: 'ae-1' } }) };
  bridge = { resolveDirectusId: vi.fn().mockResolvedValue('directus-uuid-of-caller') };
  svc = new AuditEventsService(
    directus as unknown as DirectusClient,
    bridge as unknown as DirectusUsersBridgeService,
  );
});

describe('AuditEventsService.emit', () => {
  it('persists the row with bridge-resolved actor_id + defaults', async () => {
    await svc.emit({
      event: 'invite.created',
      severity: 'high',
      actorId: 'local-user-uuid',
      targetKind: 'invite',
      targetId: 'invite-1',
      country: 'kz',
      payload: { target_email: 'x@y.org' },
    });
    expect(bridge.resolveDirectusId).toHaveBeenCalledWith('local-user-uuid');
    const row = directus.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(row.event).toBe('invite.created');
    expect(row.severity).toBe('high');
    expect(row.actor_id).toBe('directus-uuid-of-caller');
    expect(row.target_kind).toBe('invite');
    expect(row.target_id).toBe('invite-1');
    expect(row.country).toBe('kz');
    expect((row.payload_json as Record<string, unknown>).target_email).toBe('x@y.org');
    expect(typeof row.ts).toBe('string');
  });

  it('defaults severity to info when omitted', async () => {
    await svc.emit({ event: 'something.happened' });
    const row = directus.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(row.severity).toBe('info');
    expect(row.actor_id).toBeNull();
    expect(bridge.resolveDirectusId).not.toHaveBeenCalled();
  });

  it('swallows Directus failure (audit is fire-and-forget)', async () => {
    directus.post.mockRejectedValueOnce(
      new DirectusError(503, '/items/audit_events', 'unavailable'),
    );
    // Must NOT throw — the caller's business path is unaffected by audit failure.
    await expect(svc.emit({ event: 'x.y' })).resolves.toBeUndefined();
  });
});
