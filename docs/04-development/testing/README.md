# Layer 4 - Development - Testing

Testing standards live in [../standards.md](../standards.md) Part IV (the test
pyramid, unit/integration/E2E rules, coverage targets). Integration tests use
**Testcontainers** for Postgres/Redis — never mock the database.

E2E conventions (Page Object Model, selector policy, headless defaults) live
with the suite itself in [`apps/e2e/README.md`](../../../apps/e2e/README.md).

Add test-strategy and test-plan documents here as they are written.
