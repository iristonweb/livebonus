---
name: Incremental contract output
description: TypeScript incremental builds can report generated declarations as current while emitted files are stale.
---

Generated declaration validation must compare source/output freshness and exports directly rather than trusting only TypeScript's incremental build metadata.

**Why:** A stale tsbuildinfo file can make `tsc --build` skip declaration emission even when API consumers would resolve older output and report misleading missing exports.

**How to apply:** Keep API-only validation ahead of server typechecking and regenerate declarations with a forced project build when the guard reports drift.