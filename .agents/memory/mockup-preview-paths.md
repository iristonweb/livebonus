---
name: Mockup preview paths
description: Path-mounted Vite preview tests need the artifact base path preserved during browser navigation.
---

For browser checks against a path-mounted artifact, configure Vite with the same `BASE_PATH` used by the artifact and give Playwright a trailing-slash `baseURL`; navigate with relative paths rather than a leading slash.

**Why:** A leading slash or a base URL without its trailing slash can route tests to the gallery/root instead of the component preview, producing misleading “component not found” failures.

**How to apply:** Start the sandbox with a dedicated `PORT` and `BASE_PATH`, set `baseURL` to `http://127.0.0.1:<port>/<base-path>/`, and use `page.goto("preview/<Component>")`.