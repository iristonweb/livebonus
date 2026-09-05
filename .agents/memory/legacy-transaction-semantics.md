---
name: Legacy transaction semantics
description: The distinction between legacy purchase amounts and the bonus value that changes user balances
---

Legacy transaction `amountRub` represents the underlying purchase amount, not the bonus value. The points delta is the balance-changing value, converted at 0.80 RUB per point.

**Why:** Legacy earn records can contain large purchase amounts while awarding only a small points amount; adding `amountRub` to the monetary balance would create immediate drift.

**How to apply:** When writing a legacy transaction, serialize on the user balance row and apply the actual points delta to both the points and monetary snapshots.