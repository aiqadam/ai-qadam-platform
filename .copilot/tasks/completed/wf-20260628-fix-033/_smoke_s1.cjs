// Standalone smoke for the S1 hardening: API_SKIP_PORT_GUARD=1 in NODE_ENV=production.
// Bypasses vitest + vite-node entirely — loads the compiled
// dist/lib/port-guard.js and exercises two cases:
//   CASE 1. dev path (NODE_ENV=test): API_SKIP_PORT_GUARD=1 → resolves silently
//           even when the port is busy. Mirrors vitest cases #5/#6.
//   CASE 2. prod path (NODE_ENV=production): API_SKIP_PORT_GUARD=1 → throws plain
//           Error (NOT PortInUseError) with the expected runbook message.
//           Mirrors vitest case #10 (the S1 hardening test).
//
// Run from repo root: node .copilot/tasks/active/wf-20260628-fix-033/_smoke_s1.cjs
// Exit 0 = both cases passed.
const path = require("node:path");
const { createServer } = require("node:net");

const guard = require(path.resolve(
  __dirname,
  "..", "..", "..", "..",
  "apps", "api", "dist", "lib", "port-guard.js",
));

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close(() => reject(new Error("no address")));
        return;
      }
      s.close(() => resolve(addr.port));
    });
  });
}

async function holdPort(port) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
}

// Expected substrings (case 2). The exact full message is constructed
// inside port-guard.ts via a template literal:
//   `${SKIP_ENV_VAR}=${skipRaw} is forbidden in NODE_ENV=production. ...`
// We verify two independent substrings so a partial-regression doesn't pass.
const REFUSE_SUBSTRING = "API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production";
const RUNBOOK_SUBSTRING = "ports-and-processes.md";

(async () => {
  let failed = 0;

  // ── CASE 1: dev path — API_SKIP_PORT_GUARD=1 with NODE_ENV=test → resolves ──
  // Mirrors vitest cases #5 (#6 spelling). The skip must be honored in non-prod.
  try {
    const freePort = await findFreePort();
    await new Promise((r) => setTimeout(r, 50));
    const holder = await holdPort(freePort);
    const prevSkip = process.env.API_SKIP_PORT_GUARD;
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.API_SKIP_PORT_GUARD = "1";
      process.env.NODE_ENV = "test";
      const result = await guard.assertPortAvailable(freePort, "127.0.0.1");
      if (result === undefined) {
        console.log("CASE 1 PASS: dev path (NODE_ENV=test) — skip-guard resolves even on busy port");
      } else {
        console.log("CASE 1 FAIL: dev path — expected undefined, got", result);
        failed++;
      }
    } finally {
      if (prevSkip === undefined) delete process.env.API_SKIP_PORT_GUARD;
      else process.env.API_SKIP_PORT_GUARD = prevSkip;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      await new Promise((r) => holder.close(() => r()));
    }
  } catch (err) {
    console.log("CASE 1 FAIL: dev path — threw:", err && err.name, err && err.message);
    failed++;
  }

  // ── CASE 2: prod path — API_SKIP_PORT_GUARD=1 + NODE_ENV=production → throws plain Error ──
  // Mirrors vitest case #10 (S1 hardening). The escape hatch must be refused.
  try {
    const freePort = await findFreePort();
    await new Promise((r) => setTimeout(r, 50));
    const holder = await holdPort(freePort);
    const prevSkip = process.env.API_SKIP_PORT_GUARD;
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.API_SKIP_PORT_GUARD = "1";
      process.env.NODE_ENV = "production";
      let caught = null;
      try {
        await guard.assertPortAvailable(freePort, "127.0.0.1");
      } catch (err) {
        caught = err;
      }
      if (caught === null) {
        console.log("CASE 2 FAIL: prod path — API_SKIP_PORT_GUARD=1 did NOT throw");
        failed++;
      } else if (caught instanceof guard.PortInUseError) {
        console.log("CASE 2 FAIL: prod path — threw PortInUseError (expected plain Error)");
        failed++;
      } else if (!(caught instanceof Error)) {
        console.log("CASE 2 FAIL: prod path — threw non-Error:", typeof caught);
        failed++;
      } else if (!caught.message.includes(REFUSE_SUBSTRING)) {
        console.log("CASE 2 FAIL: prod path — message missing refuse substring. Got:", caught.message);
        failed++;
      } else if (!caught.message.includes(RUNBOOK_SUBSTRING)) {
        console.log("CASE 2 FAIL: prod path — message missing runbook reference. Got:", caught.message);
        failed++;
      } else {
        console.log("CASE 2 PASS: prod path — refused with:", caught.message);
      }
    } finally {
      if (prevSkip === undefined) delete process.env.API_SKIP_PORT_GUARD;
      else process.env.API_SKIP_PORT_GUARD = prevSkip;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      await new Promise((r) => holder.close(() => r()));
    }
  } catch (err) {
    console.log("CASE 2 FAIL: prod path — setup error:", err && err.message);
    failed++;
  }

  // ── CASE 3: prod path, free port, no skip env var → resolves (control) ──
  // Sanity check: the prod-refusal must NOT break the normal free-port boot path.
  try {
    const freePort = await findFreePort();
    await new Promise((r) => setTimeout(r, 50));
    const prevSkip = process.env.API_SKIP_PORT_GUARD;
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.API_SKIP_PORT_GUARD;
      process.env.NODE_ENV = "production";
      const result = await guard.assertPortAvailable(freePort, "127.0.0.1");
      if (result === undefined) {
        console.log("CASE 3 PASS: prod path free port (no skip) resolves normally");
      } else {
        console.log("CASE 3 FAIL: prod free port — expected undefined, got", result);
        failed++;
      }
    } finally {
      if (prevSkip === undefined) delete process.env.API_SKIP_PORT_GUARD;
      else process.env.API_SKIP_PORT_GUARD = prevSkip;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
    }
  } catch (err) {
    console.log("CASE 3 FAIL: prod free port — threw:", err && err.name, err && err.message);
    failed++;
  }

  if (failed > 0) {
    console.log(`SMOKE_S1: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log("SMOKE_S1: all cases passed");
  process.exit(0);
})();
