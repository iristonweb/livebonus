---
name: Points balance source of truth
description: Where the loyalty balance really comes from and how to seed demo data correctly
---

The dashboard "баланс" is read from the `users.points_balance` column, NOT computed from the `transactions` table. Only the transactions POST endpoint updates the column (earn/bonus add, redeem/expire subtract).

**Why:** Seeding `transactions` via direct SQL left balances at 0 while "earned this month" showed real numbers — the two can silently diverge.

**How to apply:** When seeding or fixing demo data, insert transactions AND update `users.points_balance` to the matching sum. Any future seed script must do both. Unauthenticated API requests fall back to user id 1 (see auth route DEFAULT_USER_ID), which is what the Expo preview displays.
