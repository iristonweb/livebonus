---
name: Expo build port isolation
description: Why production Expo builds must not share Metro's default port with the Canvas preview workflow.
---

Production Expo builds must use a dedicated, configurable Metro port rather than assuming the default port is available.

**Why:** Replit's Canvas component preview workflow owns the default Metro port in this workspace and is automatically restarted when killed. Trying to free that port manually makes mobile builds flaky or interactive.

**How to apply:** Keep production bundling isolated from managed preview workflows. When changing Expo build tooling, preserve the dedicated build-port behavior and verify the build while Canvas remains running.

Preview build cleanup must wait for the child process to exit and use a bounded escalation path; `child.killed` only means that a signal was sent. Persist the Metro response body and recent logs with the build result so bundling failures remain actionable.

**Why:** A Metro process can outlive the build wrapper after a normal or interrupted run, and a bare HTTP 500 hides the transform error needed to fix the bundle.

**How to apply:** Own the Metro process group, terminate it on success, failure, and signals, escalate after a deadline, and write diagnostics under `RELEASE_REPORT_DIR`.

Signal-triggered exits must write their interrupted-build report from the signal cleanup path after Metro cleanup, and the outer shutdown path must await that cleanup before `process.exit()`.

**Why:** SIGTERM, SIGINT, and SIGHUP are handled instead of becoming ordinary rejected build promises; a wrapper can otherwise write a generic failure or exit before the signal report persists.

**How to apply:** Record an explicit interrupted status and signal, persist the active stage, last request, and error after Metro cleanup, and make the normal `finally` wait for the signal-cleanup promise before exiting.