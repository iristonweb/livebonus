---
name: Playwright browser runtime
description: Environment constraint for running Playwright browser checks in this workspace.
---

Playwright's downloaded headless shell is not runnable in this Nix environment because it is missing the system GLib runtime. Use the Nix-provided Chromium executable for browser checks.

**Why:** Downloading Playwright's browser alone produced a launch failure for `libglib-2.0.so.0`; declaring Chromium as a Nix dependency supplies the shared libraries and a stable browser binary.

**How to apply:** Keep Chromium in the workspace Nix dependencies and allow the test command to override Playwright's executable with the `chromium` binary on PATH. Use `CHROMIUM_PATH` when running the suite in another environment with a different browser location.