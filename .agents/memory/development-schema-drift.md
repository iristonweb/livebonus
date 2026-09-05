---
name: Development schema drift
description: Development PostgreSQL may not contain columns already present in the committed Drizzle schema.
---

The development database can lag behind the repository schema after earlier schema changes, causing startup queries to fail with a missing-column error before the API begins listening.

**Why:** The API's committed partner schema included a managed-logo column while the development database still had the older table shape.

**How to apply:** When a startup failure names a schema column that is already present in the committed schema, verify the development database and apply the project's normal additive schema-sync flow before debugging application code.