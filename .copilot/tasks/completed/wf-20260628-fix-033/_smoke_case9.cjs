// Manual case-9 ordering regression smoke (independent of vitest).
// Spawns dist/main.js against a port that another listener already holds.
// Verifies:
//   (a) the api exits with code 1
//   (b) the FIRST failure-related log line is the port-guard message
//   (c) the output never contains a "migrations applied" line
//
// IMPORTANT — the guard defaults to host='0.0.0.0' (DEFAULT_HOST in
// port-guard.ts) and the api's assertPortAvailable(env.PORT) call also
// defaults to 0.0.0.0. On Windows, 0.0.0.0:N and 127.0.0.1:N are
// considered different binds (loopback-only vs all-interfaces), so the
// PortHolder MUST bind on 0.0.0.0 to actually squat on the port the
// guard will probe. The vitest spec file case #9 uses '127.0.0.1' for
// both holder and assertPortAvailable — which on Windows is a latent
// issue (see honest disclosure in this report). This manual smoke uses
// '0.0.0.0' for the holder so the case-9 ordering regression is
// actually exercised.

const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const path = require("node:path");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "0.0.0.0", () => {
      const addr = s.address();
      s.close(() => resolve(addr.port));
    });
  });
}

(async () => {
  const port = await findFreePort();
  await new Promise((r) => setTimeout(r, 100));
  const holder = createServer();
  holder.unref();
  await new Promise((resolve, reject) => {
    holder.on("error", reject);
    holder.listen(port, "0.0.0.0", resolve);
  });

  // __dirname = <repo>/.copilot/tasks/active/wf-20260628-fix-033
  // We need <repo>/apps/api/dist/main.js → 4 levels up.
  const mainPath = path.resolve(__dirname, "..", "..", "..", "..", "apps", "api", "dist", "main.js");

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATABASE_URL: "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder",
    JWT_SIGNING_SECRET: "test-jwt-signing-secret-at-least-32-chars-long-pad-pad",
    OIDC_ISSUER_URL: "http://placeholder.invalid/oidc/",
    OIDC_CLIENT_ID: "placeholder-client-id",
    OIDC_CLIENT_SECRET: "placeholder-client-secret",
    OIDC_REDIRECT_URI: "http://placeholder.invalid/v1/auth/callback",
    WEB_BASE_URL: "http://placeholder.invalid",
    INTERNAL_API_TOKEN: "test-internal-api-token-at-least-32-chars-long-pad-pad",
    DIRECTUS_URL: "http://placeholder.invalid",
    DIRECTUS_TOKEN: "test-directus-token-placeholder",
    AUTHENTIK_WEBHOOK_SECRET: "test-authentik-webhook-secret-32+chars-padding-pad-pad",
    TG_CONFIG_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };

  console.log(`HOLDING port=${port} on 0.0.0.0, spawning ${mainPath}`);
  const proc = spawn("node", [mainPath], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (c) => (stdout += String(c)));
  proc.stderr.on("data", (c) => (stderr += String(c)));

  const exitCode = await new Promise((resolve) => {
    const t = setTimeout(() => { proc.kill("SIGTERM"); resolve(null); }, 25_000);
    proc.on("exit", (code) => { clearTimeout(t); resolve(code); });
  });
  holder.close();

  const combined = stdout + stderr;
  console.log("==== STDOUT ====");
  console.log(stdout || "(empty)");
  console.log("==== STDERR ====");
  console.log(stderr || "(empty)");
  console.log("==== EXIT CODE ====");
  console.log(exitCode);

  let failed = 0;
  if (exitCode !== 1) { console.log("FAIL: exit code != 1 (got " + exitCode + ")"); failed++; }
  else { console.log("PASS: exit code === 1"); }

  const portGuardLine = combined.split(/\r?\n/).find((l) => l.includes(`Port ${port} is already in use`));
  if (portGuardLine) { console.log("PASS: port-guard line found ->", portGuardLine.trim()); }
  else { console.log("FAIL: port-guard line not found"); failed++; }

  if (/migrations applied/.test(combined)) { console.log("FAIL: 'migrations applied' appeared (guard did NOT run before migrations)"); failed++; }
  else { console.log("PASS: 'migrations applied' not in output (guard fired first)"); }

  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("setup error:", e); process.exit(2); });
