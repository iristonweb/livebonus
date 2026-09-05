---
name: API test bundling
description: Bundled API route tests that include CommonJS dependencies need the production-style Node require bridge.
---

API route tests bundled with esbuild for Node must provide a `createRequire(import.meta.url)` bridge when they include Express or other CommonJS dependencies.

**Why:** Without the bridge, the ESM test bundle can fail on esbuild's dynamic CommonJS require shim even though the API production bundle starts correctly.

**How to apply:** Keep the test bundle command aligned with the API build banner and use Node's force-exit option when imported modules register intentional long-lived intervals.