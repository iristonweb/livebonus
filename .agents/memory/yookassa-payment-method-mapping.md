---
name: YooKassa payment method mapping
description: The provider API distinction between SBP and Mir card payments
---

YooKassa accepts SBP as `payment_method_data.type = sbp` and Mir Pay as `payment_method_data.type = mir_pay`. Mir Pay is distinct from an ordinary Mir bank card, which would use `bank_card`.

**Why:** Treating Mir Pay as a generic bank card loses the wallet-specific checkout method and makes an explicit application selector purely informational.

**How to apply:** Keep the product/API enum as `sbp | mir_pay` and pass it through the YooKassa boundary; describe availability as dependent on the YooKassa store and checkout configuration. Provider checkout creation should only record a pending deal; bonus ledger writes belong in the provider-verified success path shared by status checks and webhooks.

**Why:** A successful redirect or client callback is not proof of payment, and applying bonuses before provider confirmation can create an unreconciled financial balance.