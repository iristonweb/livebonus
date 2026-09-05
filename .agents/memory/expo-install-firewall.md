---
name: Expo install firewall
description: Records the registry-level blocker affecting Expo CLI dependency installation in this workspace.
---

As of August 28, 2026, the standard workspace install succeeds with Expo CLI's declared dependency graph, including its `tar` dependency. Do not add `tar` overrides or disable supply-chain protections if the issue returns.

**Why:** Multiple compatible `tar` release lines were previously rejected with the same registry-level response, but the firewall later cleared without a project-side dependency workaround.

**How to apply:** Preserve Expo's declared dependency graph and use the normal pnpm install. If `tar` is blocked again, treat mobile startup as externally blocked rather than cycling pins or bypassing the firewall.