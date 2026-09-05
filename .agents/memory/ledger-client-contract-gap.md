---
name: Ledger client contract gap
description: Mobile ledger responses may contain server metadata before generated client types are refreshed.
---

The finance ledger API can return category and merchant metadata while a generated client declaration still omits those optional fields. Treat the response metadata as optional at the mobile boundary until the contract artifacts are regenerated.

**Why:** Category-aware history needs the server's joined transaction and merchant data, but regenerating the shared client can be a separate release concern.

**How to apply:** Prefer the generated hooks and add a narrow optional response-type boundary; do not introduce a second manual fetch layer.