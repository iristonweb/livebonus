---
name: React Native Web AppState tests
description: How browser previews can exercise Expo AppState foreground and background behavior.
---

React Native Web derives AppState from the browser document visibility state. Playwright tests can simulate native-style foreground/background transitions by temporarily overriding `document.visibilityState` and `document.hidden`, then dispatching `visibilitychange`.

**Why:** Browser preview tests do not have a native AppState bridge, but the web implementation listens to the same visibility event and exposes the relevant lifecycle behavior.

**How to apply:** Use request-count assertions around the transition: establish the initial request, verify no interval requests while hidden, then verify the expected foreground refresh and terminal-state behavior.