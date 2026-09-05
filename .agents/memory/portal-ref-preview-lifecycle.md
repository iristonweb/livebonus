---
name: Portal ref preview lifecycle
description: Reliable browser-visible ref checks for Radix components that mount content through portals.
---

For portal-backed shared controls, an object ref may still be null when an effect in the preview page runs because the portal content mounts in a separate commit. Place a small reporter inside the portal content and check the ref there. Focus-managed overlays such as Dialog should be opened one at a time when a preview exercises multiple ref paths.

**Why:** Checking the object ref only from the parent preview can produce a false “not wired” result, and simultaneously open Dialog instances can hide or replace one another while still appearing to render.

**How to apply:** Keep the content ref as the object ref under test, have a child effect publish whether it is attached, and use real triggers to open callback and object cases sequentially in the browser test.