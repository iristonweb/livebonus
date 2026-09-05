---
name: Split-process auth fixtures
description: Authentication behavior for integration tests that launch the API in a separate process.
---

Integration tests that launch a separately bundled API process cannot rely on parent-process in-memory auth fixtures. Test-only fixture tokens must be signed and verified inside the child process, while production session validation remains unchanged.

**Why:** The financial integration runner exercises real HTTP boundaries, so process-local token maps cannot authenticate requests after the server is spawned.

**How to apply:** Keep any fixture-token acceptance gated to `NODE_ENV=test` and use the same signing secret/configuration in the runner and child process; never broaden the production auth path.