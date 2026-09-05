---
name: Object storage provisioning restriction
description: App Storage setup can be rejected by account-level permissions even when the application code is ready.
---

App Storage provisioning may fail with an account-level `permission_denied`; keep the storage integration explicit and report the restriction instead of replacing managed storage with external URLs or database blobs.

**Why:** The managed storage setup callback was rejected before a bucket or storage environment variables could be created.

**How to apply:** Treat missing storage configuration as an environment prerequisite, validate the code path independently, and retry provisioning only after the account restriction is resolved.