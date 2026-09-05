---
name: Disposable database configuration
description: Release integration tests require a valid PostgreSQL admin connection URL stored as a secret.
---

The presence of `DISPOSABLE_DATABASE_URL` in Replit Secrets does not validate its value. It must be a complete `postgres://` or `postgresql://` connection URL with a database name; passwords or arbitrary strings are not sufficient.

**Why:** The integration runner derives a uniquely named temporary database from this connection, applies schema changes there, and removes it after the tests. Invalid values fail before isolation can be established.

**How to apply:** Validate the URL without logging it, keep the release gate strict instead of falling back to `DATABASE_URL`, and configure the secret through Replit's secure secrets flow.