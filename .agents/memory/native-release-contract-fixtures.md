---
name: Native release contract fixtures
description: Deterministic validation of the native device release runner without physical devices.
---

The native release runner can be tested end to end by supplying explicit iOS and Android targets plus a fixture adapter command through environment variables. The adapter writes to `NATIVE_REPORT_PATH`, allowing tests to verify report persistence and exit codes without claiming native evidence.

**Why:** Device-lab hardware is unavailable in ordinary workspaces, but release-gate regressions in metadata, scenarios, and payment polling counters must still fail before CI.

**How to apply:** Keep fixture modes for missing device metadata, incomplete scenarios, invalid polling counters, adapter failure, blocked targets, and a fully valid cross-platform result.