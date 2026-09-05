---
name: Reconciliation export history
description: How audit exports should preserve correction history while filtering current reconciliation state
---

Correction history classification is based on the balance snapshot before the correction, not the user’s current classification.

**Why:** A successful correction changes a mismatch or unmigrated account to consistent; filtering history by the current state would make the audit event disappear from its original category.

**How to apply:** When adding reconciliation reports or exports, filter current-result rows by current status, but classify and filter correction-history rows from their recorded before-balance fields.