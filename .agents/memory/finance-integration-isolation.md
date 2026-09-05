---
name: Finance integration isolation
description: Shared development database behavior that affects repeatability of finance integration tests
---

Finance integration tests currently run against shared development data, so an aborted run can leave partial balance or transaction mutations that make later tests fail for the wrong reason.

**Why:** Finance scenarios often mutate the demo user's balance before reaching their cleanup assertions; process-level teardown cannot restore state when a test exits early or an assertion fails.

**How to apply:** Prefer a disposable or resettable test database for the full suite. Drizzle tables default to public, so a per-run schema filter does not isolate newly created tables; use a temporary database and push the normal schema there. When validating one scenario against shared development data, use isolated fixture users and a test-name filter, and treat later failures as potentially contaminated until the fixture state is checked.

Rental settlement coverage should use its own tenant, landlord, and lease fixtures rather than the shared demo account, because the invariant spans two balances and prior purchase tests consume the demo balance.

**Why:** A rental payment can appear correct for one user while silently duplicating or omitting the landlord-side records; isolated two-party fixtures make both sides observable without depending on demo state.

**How to apply:** Create temporary fixture users with zero balances, settle through the provider-confirmed checkout path, assert both sides, and remove dependent ledger, participant, transaction, deal, lease, and user rows during teardown.