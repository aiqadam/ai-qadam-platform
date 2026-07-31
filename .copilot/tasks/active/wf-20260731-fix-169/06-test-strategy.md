# Step 6/7 — Test Strategy & Design

This issue's fix IS the test file (`BP-UAT-010.spec.ts`) — there is no
separate production code to regression-test. The "would have failed
before, passes after" requirement is satisfied structurally: the OLD spec
asserted `POST /v1/registrations` (201) and `GET /v1/points/me`, both
nonexistent routes in `apps/api` — those assertions could never have
passed against the real stack (confirmed: `GET /v1/points/me` returns 404,
verified live in Step 8). The NEW spec asserts the real routes/status
codes/field values and is proven to pass live against the real local stack
in Step 8, with an independent Directus cross-reference (not just DOM
text) on the two status-sensitive ACs (AC-1, AC-6).

No new production-code regression test is needed or applicable — this is
a test-design/doc correctness issue, not a product defect (per the issue's
own header: "Severity: minor (doc/test-design — no product defect)").

## Gate Result

gate_result:
  status: passed
  summary: "Fix-is-the-test; fail-before/pass-after satisfied structurally (old spec targeted nonexistent routes, new spec live-verified against real routes)."
  findings: []
