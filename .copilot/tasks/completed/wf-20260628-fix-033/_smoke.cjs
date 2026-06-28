// Standalone smoke for the fixed assertPortAvailable.
// Bypasses vitest + vite-node entirely — loads the compiled
// dist/lib/port-guard.js and exercises the two cases that prove the
// bug fix worked:
//   1. free port → resolves to undefined (was the bug: always threw)
//   2. busy port → rejects with PortInUseError
//
// Run from repo root: node .copilot/tasks/active/wf-20260628-fix-033/_smoke.cjs
// Exit 0 = both cases passed.
const path = require('node:path');
const { createServer } = require('node:net');

const guard = require(path.resolve(
  __dirname,
  '..', '..', '..', '..',
  'apps', 'api', 'dist', 'lib', 'port-guard.js',
));

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close(() => reject(new Error('no address')));
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
    s.on('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

(async () => {
  let failed = 0;

  // ── Case 1: free port → resolves to undefined ──
  try {
    const freePort = await findFreePort();
    // Small delay to let the kernel release the port.
    await new Promise((r) => setTimeout(r, 50));
    const result = await guard.assertPortAvailable(freePort, '127.0.0.1');
    if (result === undefined) {
      console.log('CASE 1 PASS: assertPortAvailable(freePort) resolved to undefined');
    } else {
      console.log('CASE 1 FAIL: expected undefined, got', result);
      failed++;
    }
  } catch (err) {
    console.log('CASE 1 FAIL: free port threw:', err && err.message);
    failed++;
  }

  // ── Case 2: busy port → rejects with PortInUseError ──
  try {
    const freePort = await findFreePort();
    await new Promise((r) => setTimeout(r, 50));
    const holder = await holdPort(freePort);
    try {
      await guard.assertPortAvailable(freePort, '127.0.0.1');
      console.log('CASE 2 FAIL: busy port did NOT throw');
      failed++;
    } catch (err) {
      if (err && err.name === 'PortInUseError' && err.code === 'PORT_IN_USE') {
        console.log(
          'CASE 2 PASS: busy port threw PortInUseError — message:',
          err.message,
        );
      } else {
        console.log(
          'CASE 2 FAIL: busy port threw the wrong error:',
          err && err.name,
          err && err.message,
        );
        failed++;
      }
    } finally {
      await new Promise((r) => holder.close(() => r()));
    }
  } catch (err) {
    console.log('CASE 2 FAIL: setup error:', err && err.message);
    failed++;
  }

  if (failed > 0) {
    console.log(`SMOKE: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log('SMOKE: both cases passed');
  process.exit(0);
})();