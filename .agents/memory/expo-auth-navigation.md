---
name: Expo auth navigation
description: Authentication fallbacks from nested Expo Router tab navigators.
---

When a user becomes unauthenticated inside a nested tab navigator, render the auth screen from that navigator instead of imperatively replacing or dismissing to the root index.

**Why:** Expo Router can dispatch root `replace` or `POP_TO` actions to the child tab navigator, where the root index is not handled; the result is a blank screen.

**How to apply:** Keep root-level auth routing for cold starts, but make protected nested layouts render the login screen directly when auth status changes.