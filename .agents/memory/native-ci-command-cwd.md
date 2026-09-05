---
name: Native CI command working directory
description: The working-directory boundary between the mobile native checker and shared CI adapter scripts.
---

Native adapter commands are executed with the mobile artifact directory as their working directory, not the workspace root. Shared CI scripts must therefore use a path relative to that artifact directory.

**Why:** A root-relative-looking command such as `./ci/run-native-device-suite.sh` is not found from the mobile package and can turn a missing adapter report into a misleading failed native result.

**How to apply:** When changing native release workflow commands, verify the path from `artifacts/loyalti-mobile` and keep the wrapper responsible for persisting the adapter JSON to `NATIVE_REPORT_PATH`.