---
name: Generated output cleanup
description: TypeScript declaration output can retain files removed from the current source graph.
---

Generated declaration builds do not reliably remove an old `.d.ts` when its source file is no longer present in the current project graph. Regeneration must compare the current source and declaration trees and remove orphan declarations before the fresh build.

**Why:** An OpenAPI type removed by Orval remained in the ignored declaration output and caused the release contract guard to fail even after a successful codegen and typecheck.

**How to apply:** For generated TypeScript contracts, run an explicit source-to-output orphan cleanup as part of codegen; remove matching declaration maps too, then run the forced declaration build and the contract guard.