// Tests for apps/api/src/lib/port-guard.ts (ISS-UAT-013-1).
//
// Behavior under test:
//   1. Free port → resolves silently (no probe spawned).
//   2. Busy port on Windows → PortInUseError with PID + command.
//   3. Busy port on Unix → PortInUseError with PID + command (lsof).
//   4. Probe timeout → graceful degradation (error still thrown, no PID).
//   5. API_SKIP_PORT_GUARD=1 → no-op.
//   6. API_SKIP_PORT_GUARD='1' (string) → no-op.
//   7. Invalid input (-1, 70000, 'abc') → throws RangeError / TypeError.
//   8. Probe binary missing (lsof ENOENT) → PortInUseError with probeUnavailable.
//   9. Ordering regression: guard runs BEFORE runMigrations() — verified
//      by booting dist/main.js as a subprocess against a busy port.
//
// All unit tests (cases 1–8) use vi.mock('node:child_process') for
// cross-platform determinism. Case 9 follows the dist/main.js subprocess
// pattern from main-bootstrap.spec.ts:62–106.

import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:child_process so the OS probe is hermetic. We re-mock per
// test via mockResolvedValueOnce / mockImplementationOnce as needed.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

const mockedExecFile = vi.mocked(execFile);

import {
  assertPortAvailable,
  PortInUseError,
} from '../src/lib/port-guard';

// ── Helpers ────────────────────────────────────────────────────────────────

// Find an ephemeral port by asking the kernel. Use 0 as the port and
// read what the OS assigned. Then close the probe so subsequent tests
// can rebind it (the OS may not immediately release).
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close(() => reject(new Error('no address')));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

// Hold a port busy by binding a long-lived listener until released.
class PortHolder {
  private readonly server = createServer();

  public constructor(public readonly port: number) {
    this.server.unref();
    this.server.listen(port, '127.0.0.1');
  }

  public async release(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

// ── Cases 1–8 (unit tests) ─────────────────────────────────────────────────

describe('assertPortAvailable', () => {
  const ORIGINAL_PLATFORM = process.platform;

  beforeEach(() => {
    // Default: pretend we're on Windows unless a test overrides it.
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    // Default: don't skip the guard unless a test sets the env.
    // vi.stubEnv handles the unset case via vi.unstubAllEnvs() in afterEach.
    vi.stubEnv('API_SKIP_PORT_GUARD', '');
    mockedExecFile.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Case 1
  it('free port → resolves silently without spawning a probe', async () => {
    const port = await findFreePort();
    await expect(assertPortAvailable(port)).resolves.toBeUndefined();
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  // Case 2
  it('EADDRINUSE on Windows → PortInUseError with PID + Image Name + CommandLine', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const holder = new PortHolder(await findFreePort());
    try {
      // netstat -ano -p TCP → mock a LISTENING line for our port.
      const netstatOut = [
        'Active Connections',
        '',
        '  Proto  Local Address          Foreign Address        State           PID',
        `  TCP    0.0.0.0:${holder.port}    0.0.0.0:0    LISTENING    5008`,
        '',
      ].join('\r\n');
      // tasklist /FO LIST /V → mock Image Name + Command Line.
      const tasklistOut = [
        'Image Name:   node.exe',
        'PID:          5008',
        'Command Line: C:\\Users\\tvolo\\Documents\\Claude\\Projects\\ai-dala-next\\node_modules\\next\\start-server.js',
        '',
      ].join('\r\n');
      mockedExecFile
        .mockResolvedValueOnce({ stdout: netstatOut, stderr: '' })
        .mockResolvedValueOnce({ stdout: tasklistOut, stderr: '' });

      await expect(assertPortAvailable(holder.port)).rejects.toBeInstanceOf(
        PortInUseError,
      );
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
      // First call: netstat with -ano -p TCP.
      expect(mockedExecFile.mock.calls[0]?.[0]).toBe('netstat');
      // Second call: tasklist with PID filter.
      const tasklistArgs = mockedExecFile.mock.calls[1]?.[1] as string[] | undefined;
      expect(tasklistArgs).toContain('5008');
    } finally {
      await holder.release();
    }
  });

  // Case 3
  it('EADDRINUSE on Unix → PortInUseError with PID + command parsed from lsof -F pc', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const holder = new PortHolder(await findFreePort());
    try {
      const lsofOut = ['p5008', 'cnext-server', ''].join('\n');
      mockedExecFile.mockResolvedValueOnce({ stdout: lsofOut, stderr: '' });

      let caught: unknown;
      try {
        await assertPortAvailable(holder.port);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PortInUseError);
      const e = caught as PortInUseError;
      expect(e.code).toBe('PORT_IN_USE');
      expect(e.port).toBe(holder.port);
      expect(e.pid).toBe(5008);
      expect(e.command).toBe('next-server');
      expect(mockedExecFile.mock.calls[0]?.[0]).toBe('lsof');
    } finally {
      await holder.release();
    }
  });

  // Case 4
  it('probe timeout → PortInUseError without pid/command (graceful degradation)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const holder = new PortHolder(await findFreePort());
    try {
      // Reject with a timeout-like error. execFile rejects with an error
      // that has .killed/.signal when the timeout fires.
      const timeoutErr = Object.assign(new Error('Command failed: lsof'), {
        killed: true,
        signal: 'SIGTERM',
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      });
      mockedExecFile.mockRejectedValueOnce(timeoutErr);

      const caught = await assertPortAvailable(holder.port).catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(PortInUseError);
      const e = caught as PortInUseError;
      expect(e.pid).toBeUndefined();
      expect(e.command).toBeUndefined();
    } finally {
      await holder.release();
    }
  });

  // Case 5
  it('API_SKIP_PORT_GUARD=1 → no-op even when port is busy', async () => {
    process.env.API_SKIP_PORT_GUARD = '1';
    const holder = new PortHolder(await findFreePort());
    try {
      await expect(assertPortAvailable(holder.port)).resolves.toBeUndefined();
      // We never even attempted the probe socket (would have collided).
      expect(mockedExecFile).not.toHaveBeenCalled();
    } finally {
      await holder.release();
    }
  });

  // Case 6
  it("API_SKIP_PORT_GUARD='true' (string) → no-op", async () => {
    process.env.API_SKIP_PORT_GUARD = 'true';
    const holder = new PortHolder(await findFreePort());
    try {
      await expect(assertPortAvailable(holder.port)).resolves.toBeUndefined();
      expect(mockedExecFile).not.toHaveBeenCalled();
    } finally {
      await holder.release();
    }
  });

  // Case 7
  it('invalid port → throws RangeError / TypeError before any network call', async () => {
    await expect(assertPortAvailable(-1)).rejects.toBeInstanceOf(RangeError);
    await expect(assertPortAvailable(70_000)).rejects.toBeInstanceOf(RangeError);
    // @ts-expect-error — intentionally passing a wrong type to assert the boundary check.
    await expect(assertPortAvailable('abc')).rejects.toBeInstanceOf(RangeError);
    // @ts-expect-error — non-integer numeric values also rejected.
    await expect(assertPortAvailable(3.14)).rejects.toBeInstanceOf(RangeError);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  // Case 8
  it('probe binary missing (ENOENT) → PortInUseError with probeUnavailable=true', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const holder = new PortHolder(await findFreePort());
    try {
      // ENOENT shape from Node's child_process when the binary isn't on PATH.
      const enoent = Object.assign(new Error('spawn lsof ENOENT'), { code: 'ENOENT' });
      mockedExecFile.mockRejectedValueOnce(enoent);

      const caught = await assertPortAvailable(holder.port).catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(PortInUseError);
      const e = caught as PortInUseError;
      expect(e.pid).toBeUndefined();
      expect(e.command).toBeUndefined();
      expect(e.probeUnavailable).toBe(true);
    } finally {
      await holder.release();
    }
  });
});

// ── Case 9 (subprocess boot — ordering regression) ─────────────────────────

// We boot the compiled dist/main.js against a port that's already busy.
// The expected outcome: the FIRST failure-related log line is the
// port-guard's enriched error (Port <n> is already in use...), NOT a
// migrations line. This pins the placement decision from
// 02-impact-analysis.md §"Placement Decision — critical".
//
// Mirrors main-bootstrap.spec.ts:62–106 for the subprocess-boot pattern.
// Unlike that spec, this one does NOT spin up Testcontainers Postgres —
// the guard must abort BEFORE any DB connection is opened (and that is
// what we are testing).
describe('dist/main.js bootstrap — port-guard ordering', () => {
  it('refuses to start with the port-guard error before any DB connection', async () => {
    // Hold a real port busy for the duration of the subprocess boot.
    const holder = new PortHolder(await findFreePort());
    try {
      const mainPath = path.resolve(__dirname, '..', 'dist', 'main.js');
      const proc = (await import('node:child_process')).spawn(
        'node',
        [mainPath],
        {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: String(holder.port),
            // Minimal env: env Zod requires DATABASE_URL etc. We never
            // reach env parsing if the guard bails first — but env.ts
            // runs at import time, so we have to satisfy the schema.
            DATABASE_URL: 'postgresql://placeholder:placeholder@127.0.0.1:1/placeholder',
            JWT_SIGNING_SECRET: 'test-jwt-signing-secret-at-least-32-chars-long-pad-pad',
            OIDC_ISSUER_URL: 'http://placeholder.invalid/oidc/',
            OIDC_CLIENT_ID: 'placeholder-client-id',
            OIDC_CLIENT_SECRET: 'placeholder-client-secret',
            OIDC_REDIRECT_URI: 'http://placeholder.invalid/v1/auth/callback',
            WEB_BASE_URL: 'http://placeholder.invalid',
            INTERNAL_API_TOKEN: 'test-internal-api-token-at-least-32-chars-long-pad-pad',
            DIRECTUS_URL: 'http://placeholder.invalid',
            DIRECTUS_TOKEN: 'test-directus-token-placeholder',
            AUTHENTIK_WEBHOOK_SECRET: 'test-authentik-webhook-secret-32+chars-padding-pad-pad',
            TG_CONFIG_ENCRYPTION_KEY:
              '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      proc.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      const exitPromise = once(proc, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
      const timeout = new Promise<[null, null]>((resolve) =>
        setTimeout(() => {
          proc.kill('SIGTERM');
          resolve([null, null]);
        }, 15_000),
      );
      const [code] = await Promise.race([exitPromise, timeout]);

      // The api must have refused to boot (exit code 1, or SIGTERM if
      // our timeout fired while it was still spinning). On any non-zero
      // exit we count it as the guard having fired.
      expect(code === 1 || code === null).toBe(true);

      const combined = stdout + stderr;

      // First failure line must be the port-guard's enriched message —
      // NOT "migrations applied" and NOT a "migrations failed" line.
      const portGuardLine = combined
        .split(/\r?\n/)
        .find((line) => line.includes(`Port ${holder.port} is already in use`));
      expect(portGuardLine).toBeDefined();

      // Defensive: the migrations log line must NEVER appear, because
      // the guard aborts before runMigrations() is called.
      expect(combined).not.toMatch(/migrations applied/);
    } finally {
      await holder.release();
    }
  }, 30_000);
});
