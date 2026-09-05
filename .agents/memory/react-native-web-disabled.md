---
name: React Native Web disabled assertions
description: Playwright treats React Native Web Pressable controls as div elements rather than native disabled buttons.
---

React Native Web Pressable controls expose disabled state through `aria-disabled`, so browser tests should assert the control's `testID` and `aria-disabled="true"` instead of relying on `toBeDisabled()`.

**Why:** React Native Web renders Pressable as a non-button element, making Playwright's native disabled matcher report it as enabled even when the control is correctly disabled.

**How to apply:** Add stable test IDs to interactive Pressables and verify `aria-disabled` for disabled states.