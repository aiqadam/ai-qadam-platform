// Pre-startup port-availability guard for the NestJS api.
//
// Why this exists (ISS-UAT-013-1): when a sibling project's dev server
// (or anything else) is already listening on env.PORT, NestFactory.create
// → app.listen(env.PORT) throws a generic Node "EADDRINUSE: address already
// in use" with no PID, no command, no actionable hint. The developer (and
// the UAT runner) waste minutes tracing the squatter.
//
// What this does: opens a probe socket against the requested port BEFORE
// runMigrations() / NestFactory.create(). If the port is free, the probe
// closes immediately and bootstrap continues. If the port is busy, we
// run a short, bounded OS probe to identify the owning PID + command,
// then throw a typed PortInUseError with the actionable message:
//
//   "Port 3000 is already in use (PID 5008, command '…next start-server.js').
//    Either stop the conflicting process or set PORT=<other>."
//
// Escape hatch: API_SKIP_PORT_GUARD=1 (or 'true') disables the guard for
// CI / Testcontainers / ad-hoc port reassignment. The escape hatch emits
// a Logger.warn so the silent skip is at least visible in boot logs.
// See docs/04-development/infrastructure/runbooks/ports-and-processes.md
// for the foot-gun warning before setting this in prod.
//
// Cross-platform: Windows uses netstat -ano + tasklist (always present);
// macOS / Linux use lsof (always present on macOS, present on most Linux
// distros). Alpine Linux's Testcontainers image lacks lsof — the probe
// degrades gracefully (returns probeUnavailable=true) and the guard still
// throws PortInUseError, just without PID enrichment.
//
// Security: argv is built from port.toString() + an integer PID only —
// no string interpolation of user-supplied data, no shell:true. The
// full CommandLine is captured into error.command for programmatic
// consumers but only the ExecutablePath (Windows "Image Name") is
// written to stderr (see MAX_LOGGED_COMMAND_LENGTH).
import { Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { Socket } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Named constants per AGENTS.md §1 (no magic numbers).
const PORT_PROBE_TIMEOUT_MS = 2_000;
const MAX_LOGGED_COMMAND_LENGTH = 120;
const MIN_PORT = 0;
const MAX_PORT = 65535;
const SKIP_ENV_VAR = 'API_SKIP_PORT_GUARD';
const PORT_GUARD_LOG_CONTEXT = 'PortGuard';

const PROBE_UNAVAILABLE_SENTINEL = {
  pid: undefined,
  command: undefined,
  probeUnavailable: true,
} as const;

export class PortInUseError extends Error {
  public readonly code = 'PORT_IN_USE';
  public readonly port: number;
  public readonly pid: number | undefined;
  public readonly command: string | undefined;
  public readonly probeUnavailable: boolean | undefined;

  constructor(args: {
    port: number;
    pid?: number;
    command?: string;
    probeUnavailable?: boolean;
  }) {
    const pidFragment = args.pid !== undefined ? ` (PID ${args.pid}` : ' (PID unknown';
    const cmdFragment = args.command !== undefined
      ? `, command '${args.command}'`
      : '';
    // The closing paren is needed whenever pidFragment opened one —
    // i.e. always. (Both branches of pidFragment start with ' ('.)
    // Earlier code dropped the ')' when pid was undefined, producing
    // malformed messages like "Port X is already in use (PID unknown."
    const closing = ')';
    super(
      `Port ${args.port} is already in use${pidFragment}${cmdFragment}${closing}. Either stop the conflicting process or set PORT=<other>.`,
    );
    this.name = 'PortInUseError';
    this.port = args.port;
    this.pid = args.pid;
    this.command = args.command;
    this.probeUnavailable = args.probeUnavailable;
  }
}

interface ProbeResult {
  pid: number | undefined;
  command: string | undefined;
  probeUnavailable: boolean | undefined;
}

export async function assertPortAvailable(port: number): Promise<void> {
  // Boundary validation per AGENTS.md §1.5 (one assertion per function)
  // and CLAUDE.md §6. Throws RangeError for invalid ports BEFORE any
  // network call so the diagnostic is instant and reproducible.
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new RangeError(
      `assertPortAvailable: port must be an integer in [${MIN_PORT}, ${MAX_PORT}], got ${String(port)}`,
    );
  }

  // Escape hatch for CI / Testcontainers / ad-hoc port reassignment.
  // '1' / 'true' (matches the SEND_EMAILS / RATE_LIMIT_ENFORCE pattern
  // in env.ts). We do NOT refuse this in production — the runbook
  // documents the foot-gun; the SecurityReviewer will decide whether
  // to harden this further.
  const skipRaw = process.env[SKIP_ENV_VAR];
  if (skipRaw === '1' || skipRaw === 'true') {
    Logger.warn(
      `${SKIP_ENV_VAR}=${skipRaw} — port-guard disabled (skipping pre-startup probe)`,
      PORT_GUARD_LOG_CONTEXT,
    );
    return;
  }

  // Probe strategy: ATTEMPT TO CONNECT to the port. This is the only
  // reliable cross-platform way to detect a busy port.
  //
  // The earlier strategy (bind a probe server and listen for EADDRINUSE)
  // is UNSOUND on Windows: Windows allows multiple sockets to bind the
  // same port by default (no SO_EXCLUSIVEADDRUSE), so binding succeeds
  // even when another process is already listening — the probe reported
  // every port as free. Connect-based detection has the opposite and
  // correct semantics: if connect() SUCCEEDS, something is listening
  // (busy); if it fails with ECONNREFUSED, nothing is listening (free);
  // a timeout or other error is ambiguous → degrade to "probe unknown".
  //
  // We connect to 127.0.0.1 (loopback) rather than the bind interface
  // because the api itself listens on 0.0.0.0 — a peer reachable on any
  // interface is reachable on loopback, and loopback avoids firewall
  // prompts.
  const probeResult = await probeOwnerIfBusy(port, '127.0.0.1');

  if (probeResult === null) {
    return; // connect refused → port is free
  }

  // Port is busy — run the OS probe to enrich the error. Any failure
  // here is a graceful degradation, not a throw.
  const enriched = await probeOwner(port);
  // Prefer the connect-time result if the OS probe couldn't enrich
  // (e.g. lsof/netstat returned nothing), so we still throw with a
  // "busy but PID unknown" error rather than silently passing.
  const merged: ProbeResult = {
    pid: enriched.pid ?? probeResult.pid,
    command: enriched.command ?? probeResult.command,
    probeUnavailable: enriched.probeUnavailable ?? probeResult.probeUnavailable,
  };
  throw new PortInUseError(buildErrorArgs(port, merged));
}

// Connect to (host, port). Returns null if the port is FREE (connect
// failed with ECONNREFUSED), or a ProbeResult if BUSY. On timeout or
// unexpected error, returns { probeUnavailable: true } so the caller
// still throws PortInUseError (fail-closed: a port we can't probe is
// treated as busy, not silently free).
async function probeOwnerIfBusy(port: number, host: string): Promise<ProbeResult | null> {
  return new Promise<ProbeResult | null>((resolve) => {
    const socket = new Socket();
    socket.unref();
    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.destroy();
    };
    const onTimeout = (): void => {
      cleanup();
      resolve({ pid: undefined, command: undefined, probeUnavailable: true });
    };
    const onError = (err: NodeJS.ErrnoException): void => {
      cleanup();
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        resolve(null); // nothing listening → port is free
        return;
      }
      // EACCES, ENETUNREACH, etc. → ambiguous, fail-closed.
      resolve({ pid: undefined, command: undefined, probeUnavailable: true });
    };
    const onConnect = (): void => {
      cleanup();
      // Something answered → port is busy. PID/command enriched later.
      resolve({ pid: undefined, command: undefined, probeUnavailable: false });
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once('timeout', onTimeout);
    socket.once('error', onError);
    socket.once('connect', onConnect);
    socket.connect(port, host);
  });
}

// Build the PortInUseError arg bag without passing undefined keys —
// exactOptionalPropertyTypes: true rejects `{ pid: undefined }`.
function buildErrorArgs(
  port: number,
  probeResult: ProbeResult,
): {
  port: number;
  pid?: number;
  command?: string;
  probeUnavailable?: boolean;
} {
  const args: { port: number; pid?: number; command?: string; probeUnavailable?: boolean } = {
    port,
  };
  if (probeResult.pid !== undefined) args.pid = probeResult.pid;
  if (probeResult.command !== undefined) args.command = probeResult.command;
  if (probeResult.probeUnavailable !== undefined) {
    args.probeUnavailable = probeResult.probeUnavailable;
  }
  return args;
}

// runOsProbe dispatches to the platform-specific probe. Split out from
// probeOwner so each branch stays under the 60-line function cap.
async function probeOwner(port: number): Promise<ProbeResult> {
  if (process.platform === 'win32') {
    return probeOwnerWindows(port);
  }
  return probeOwnerUnix(port);
}

async function probeOwnerWindows(port: number): Promise<ProbeResult> {
  try {
    // argv only — no shell. ${port} is digits-only by the boundary check.
    const { stdout: netstatOut } = await execFileAsync(
      'netstat',
      ['-ano', '-p', 'TCP'],
      { timeout: PORT_PROBE_TIMEOUT_MS, windowsHide: true },
    );
    const listeningPid = parseListeningPidFromNetstat(netstatOut, port);
    if (listeningPid === undefined) {
      return { pid: undefined, command: undefined, probeUnavailable: true };
    }
    const { stdout: tasklistOut } = await execFileAsync(
      'tasklist',
      ['/FI', `PID eq ${listeningPid}`, '/FO', 'LIST', '/V'],
      { timeout: PORT_PROBE_TIMEOUT_MS, windowsHide: true },
    );
    const imageName = parseImageNameFromTasklist(tasklistOut);
    const commandLine = parseCommandLineFromTasklist(tasklistOut);
    // Log only ExecutablePath (Image Name) to stderr. Full CommandLine
    // goes into error.command for programmatic consumers but is NOT
    // written to logs (it can contain the working directory + env
    // vars — see SecurityReviewer focus area 2 in 02-impact-analysis.md).
    if (imageName !== undefined) {
      Logger.warn(
        `port ${port} is held by PID ${listeningPid} (${truncateForLog(imageName)})`,
        PORT_GUARD_LOG_CONTEXT,
      );
    }
    return {
      pid: listeningPid,
      command: commandLine ?? imageName,
      probeUnavailable: false,
    };
  } catch {
    return { ...PROBE_UNAVAILABLE_SENTINEL };
  }
}

async function probeOwnerUnix(port: number): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pc'],
      { timeout: PORT_PROBE_TIMEOUT_MS },
    );
    const parsed = parseLsofMachineFormat(stdout);
    if (parsed.pid === undefined) {
      return { pid: undefined, command: undefined, probeUnavailable: true };
    }
    if (parsed.command !== undefined) {
      Logger.warn(
        `port ${port} is held by PID ${parsed.pid} (${truncateForLog(parsed.command)})`,
        PORT_GUARD_LOG_CONTEXT,
      );
    }
    return { ...parsed, probeUnavailable: false };
  } catch {
    // ENOENT (lsof missing on Alpine), timeout, non-zero exit — degrade.
    return { ...PROBE_UNAVAILABLE_SENTINEL };
  }
}

// parseListeningPidFromNetstat: returns the first PID listening on
// the given TCP port from `netstat -ano -p TCP` output. Each line is
// space-separated: "  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    5008".
function parseListeningPidFromNetstat(stdout: string, port: number): number | undefined {
  const lines = stdout.split(/\r?\n/);
  const portSuffix = `:${port}`;
  for (const line of lines) {
    if (!line.includes('LISTENING')) continue;
    if (!line.includes(portSuffix)) continue;
    const cols = line.trim().split(/\s+/);
    const last = cols[cols.length - 1];
    if (last === undefined) continue;
    const pid = Number.parseInt(last, 10);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return undefined;
}

// parseImageNameFromTasklist: extracts "Image Name: …" value from
// `tasklist /FO LIST /V` output.
function parseImageNameFromTasklist(stdout: string): string | undefined {
  return extractTasklistField(stdout, 'Image Name');
}

// parseCommandLineFromTasklist: extracts "Command Line: …" value.
function parseCommandLineFromTasklist(stdout: string): string | undefined {
  return extractTasklistField(stdout, 'Command Line');
}

function extractTasklistField(stdout: string, field: string): string | undefined {
  const lines = stdout.split(/\r?\n/);
  const prefix = `${field}:`;
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      const value = line.slice(prefix.length).trim();
      if (value.length > 0) return value;
    }
  }
  return undefined;
}

// parseLsofMachineFormat: parses `lsof -F pc` output. Lines start with
// 'p' (PID) or 'c' (command). Returns the first process found.
// Split into two single-purpose helpers to keep complexity under 10.
function parseLsofMachineFormat(stdout: string): ProbeResult {
  const lines = stdout.split(/\r?\n/);
  const pid = extractLsofPid(lines);
  const command = extractLsofCommand(lines);
  return { pid, command, probeUnavailable: false };
}

function extractLsofPid(lines: string[]): number | undefined {
  for (const line of lines) {
    if (line.length < 2 || line[0] !== 'p') continue;
    const parsed = Number.parseInt(line.slice(1), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function extractLsofCommand(lines: string[]): string | undefined {
  for (const line of lines) {
    if (line.length < 2 || line[0] !== 'c') continue;
    return line.slice(1);
  }
  return undefined;
}

function truncateForLog(text: string): string {
  if (text.length <= MAX_LOGGED_COMMAND_LENGTH) return text;
  return `${text.slice(0, MAX_LOGGED_COMMAND_LENGTH)}…`;
}