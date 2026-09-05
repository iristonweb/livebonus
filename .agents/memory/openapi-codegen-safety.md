---
name: OpenAPI codegen safety
description: Orval cleans generated output before validating the OpenAPI input.
---

Validate OpenAPI edits before running the generator when possible; a malformed specification can temporarily remove all generated client and Zod files because Orval cleans its output first.

**Why:** A failed generation left dependent packages unable to typecheck until the specification was corrected and generation was rerun.

**How to apply:** Make small contract patches, inspect the affected YAML block for duplicate keys or misplaced properties, use the repository's existing inline `{ error: string }` response shape unless a shared error schema exists, then run codegen and immediately run library typechecks.