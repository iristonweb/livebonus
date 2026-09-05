---
name: PostgreSQL aggregate timestamps
description: Runtime shape of timestamp values returned by PostgreSQL aggregate expressions
---

Raw PostgreSQL aggregate expressions such as `max(timestamp_column)` are not guaranteed to receive the same runtime `Date` mapping as direct timestamp columns; the node driver may return a string.

**Why:** Calling `toISOString()` directly on an aggregate result caused the finance reconciliation summary to return HTTP 500 even though the underlying timestamp was valid.

**How to apply:** Treat aggregate timestamp results as `Date | string | null`, validate/parse them at the API boundary, and emit an ISO string or `null`.