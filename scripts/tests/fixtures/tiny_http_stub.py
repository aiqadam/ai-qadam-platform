#!/usr/bin/env python3
"""Tiny HTTP stub for bats tests of directus-retry-helper.bash.

Pure stdlib — no pip dependencies. Listens on 127.0.0.1 only (security:
never bind on 0.0.0.0 in CI). Serves a deterministic, FIFO-popped
HTTP-code sequence on a single port.

CLI:
    --port <N>            Port to bind on (required, integer).
    --response-code <seq> Comma-separated HTTP codes (e.g. "503,503,200").
                          On every request, pop the next code from the
                          sequence (FIFO). When exhausted, repeat the
                          LAST code forever.

Behavior:
    - Listens on 127.0.0.1 only.
    - Handles GET, POST, PATCH, DELETE.
    - Returns the current code + a 16-byte JSON-ish body that varies
      by status class:
          2xx → {"stub":"ok"}
          5xx → {"stub":"under_pressure"}
          401 → {"stub":"unauth"}
          other → {"stub":"other"}
    - Logs each request as one line to
      /tmp/tiny_http_stub_<port>.log in the format:
          <ISO-8601> <method> <path> -> <code>
      so a failed test can introspect how many requests reached the
      stub (and is also the readiness marker setup() polls for).
    - Handles SIGTERM cleanly (exits 0).
    - Uses ThreadingHTTPServer so concurrent bats cases (if the user
      runs them in parallel later) don't serialize.

This is a TEST FIXTURE, not a production component. Kept under
scripts/tests/fixtures/ so it ships with the bats suite and is
discoverable by anyone reading the harness.
"""

import argparse
import datetime as dt
import http.server
import signal
import socketserver
import sys


class Handler(http.server.BaseHTTPRequestHandler):
    # Populated by main() before serve_forever().
    codes = []
    # Position counter (shared per-process, so use a class-level list
    # wrapper — a plain int is fine because Handler runs single-threaded
    # *per request* on the ThreadingMixIn pool, but the sequence is
    # monotonic so a non-atomic += under thread races is harmless here:
    # we don't care about request ORDER, only that the right code is
    # served. We rely on the GIL to keep `idx` increments observable.)
    _idx = [0]
    log_path = ""

    def do_GET(self):    self._respond("GET")
    def do_POST(self):   self._respond("POST")
    def do_PATCH(self):  self._respond("PATCH")
    def do_DELETE(self): self._respond("DELETE")

    def _respond(self, method):
        # Readiness probe path: returns 204 (No Content) without
        # touching the FIFO code sequence. Lets setup() verify the
        # stub is listening WITHOUT consuming the first response
        # code the test was actually planning to assert on. Checked
        # BEFORE the FIFO increment so the probe never disturbs the
        # code stream — critical for short sequences like "503,200".
        if self.path == "/_probe":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            try:
                with open(Handler.log_path, "a", encoding="utf-8") as fh:
                    fh.write(f"{dt.datetime.now(dt.timezone.utc).isoformat()} "
                             f"{method} {self.path} -> 204 (probe)\n")
            except OSError:
                pass
            return

        # Determine next code: FIFO with last-code repeat on exhaustion.
        if not Handler.codes:
            code = 200  # sensible default if not configured
        else:
            i = Handler._idx[0]
            if i < len(Handler.codes):
                code = Handler.codes[i]
            else:
                code = Handler.codes[-1]
            Handler._idx[0] = i + 1

        # Append-only request log.
        try:
            with open(Handler.log_path, "a", encoding="utf-8") as fh:
                fh.write(f"{dt.datetime.now(dt.timezone.utc).isoformat()} "
                         f"{method} {self.path} -> {code}\n")
        except OSError:
            # Log file unwritable — the request still gets answered,
            # we just lose the diagnostic. Don't crash the server.
            pass

        # Body by status class — the 16-byte JSON-ish payload per
        # the test strategy §"Mock Strategy".
        if 200 <= code < 300:
            body = b'{"stub":"ok"}'
        elif code == 401:
            body = b'{"stub":"unauth"}'
        elif 500 <= code < 600:
            body = b'{"stub":"under_pressure"}'
        else:
            body = b'{"stub":"other"}'

        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        # Suppress stderr access log (we have our own /tmp log file).
        return


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """HTTPServer with per-request thread pool (daemon threads).

    Daemon threads so an aborted test run can never leave a Python
    child hanging the CI runner.
    """
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, required=True,
                    help="Port to bind on 127.0.0.1")
    ap.add_argument("--response-code", required=True,
                    help="Comma-separated HTTP code sequence; last "
                         "code repeats on sequence exhaustion")
    args = ap.parse_args()

    if args.port < 1 or args.port > 65535:
        ap.error(f"--port out of range: {args.port}")

    Handler.codes = [int(c) for c in args.response_code.split(",") if c]
    if not Handler.codes:
        ap.error("--response-code must contain at least one int")

    Handler.log_path = f"/tmp/tiny_http_stub_{args.port}.log"

    # Bind 127.0.0.1 only — never 0.0.0.0 (security per test contract).
    server = ThreadedServer(("127.0.0.1", args.port), Handler)

    # Clean exit on SIGTERM (setup()/teardown() rely on this).
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
