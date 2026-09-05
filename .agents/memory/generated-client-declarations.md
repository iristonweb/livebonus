---
name: Generated client declarations
description: Workspace behavior when generated API source and package declaration output become out of sync.
---

When an app package reports that recently generated API hooks or fields do not exist, refresh the workspace library declaration build before changing application code.

**Why:** The package can resolve declaration output from its library dependency while the current generated source already contains the newer contract. This creates misleading app type errors even though the runtime preview and source exports are correct.

**How to apply:** Run the workspace library typecheck/build first, then rerun the affected app typecheck. Restart the affected dev workflow after codegen because a running bundler can retain stale declaration results. Treat remaining errors as application issues only after declaration output is current.
