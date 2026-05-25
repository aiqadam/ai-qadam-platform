import { describe, expect, it, vi } from 'vitest';
import { TickLockService } from '../src/modules/internal-cron/tick-lock.service';

// TickLockService — Redis SET-NX distributed mutex tests.
// We mock the ioredis client (only set + eval are used).

interface FakeRedis {
  set: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
}

function makeService(redis: FakeRedis): TickLockService {
  return new TickLockService(redis as never);
}

describe('TickLockService.acquire', () => {
  it('returns true when SET NX succeeds', async () => {
    const redis: FakeRedis = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn() };
    const svc = makeService(redis);
    const ok = await svc.acquire('my-tick', 60);
    expect(ok).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'tick-lock:my-tick',
      expect.stringContaining('aiqadam-api:'),
      'EX',
      60,
      'NX',
    );
  });

  it('returns false when SET NX returns null (key existed)', async () => {
    const redis: FakeRedis = { set: vi.fn().mockResolvedValue(null), eval: vi.fn() };
    const svc = makeService(redis);
    expect(await svc.acquire('my-tick', 60)).toBe(false);
  });
});

describe('TickLockService.release', () => {
  it('runs the Lua CAS script with holder id', async () => {
    const redis: FakeRedis = { set: vi.fn(), eval: vi.fn().mockResolvedValue(1) };
    const svc = makeService(redis);
    await svc.release('my-tick');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      1,
      'tick-lock:my-tick',
      expect.stringContaining('aiqadam-api:'),
    );
  });

  it('swallows Redis errors (TTL is the safety net)', async () => {
    const redis: FakeRedis = {
      set: vi.fn(),
      eval: vi.fn().mockRejectedValue(new Error('connection lost')),
    };
    const svc = makeService(redis);
    await expect(svc.release('my-tick')).resolves.toBeUndefined();
  });
});

describe('TickLockService.withLock', () => {
  it('runs fn + returns its value when lock acquired', async () => {
    const redis: FakeRedis = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn() };
    const svc = makeService(redis);
    const out = await svc.withLock('my-tick', 60, async () => 'result');
    expect(out).toBe('result');
    expect(redis.eval).toHaveBeenCalled(); // released
  });

  it('returns undefined + skips fn when lock NOT acquired', async () => {
    const redis: FakeRedis = { set: vi.fn().mockResolvedValue(null), eval: vi.fn() };
    const svc = makeService(redis);
    const fn = vi.fn().mockResolvedValue('result');
    const out = await svc.withLock('my-tick', 60, fn);
    expect(out).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled(); // no release if not acquired
  });

  it('releases the lock even when fn throws', async () => {
    const redis: FakeRedis = { set: vi.fn().mockResolvedValue('OK'), eval: vi.fn() };
    const svc = makeService(redis);
    await expect(
      svc.withLock('my-tick', 60, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(redis.eval).toHaveBeenCalled(); // released despite throw
  });
});
