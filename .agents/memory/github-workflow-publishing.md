---
name: GitHub workflow publishing access
description: The configured GitHub connector can read repositories and write ordinary files, but workflow-path publication may be blocked by proxy policy.
---

Publishing files under `.github/workflows` may require a GitHub App or git push credential with workflow write access; ordinary Contents API writes are not a reliable substitute in this environment.

**Why:** The connector successfully handled regular repository files but Cloudflare blocked `.github` paths, GitHub Git/GraphQL commit creation was restricted, and the shell had no authenticated GitHub remote.

**How to apply:** Before validating a workflow-based branch protection scenario, confirm that the chosen GitHub connection can publish `.github/workflows` and create/update a branch. If not, stop before creating formal required checks and request the proper repository write integration.

For CI evidence checks, also confirm that the target repository already exposes the workflow and has an eligible runner. An empty workflow list or no self-hosted runners means a real Actions Summary cannot be confirmed from this environment; local harness output is only a fallback, not equivalent evidence.

**Why:** A temporary diagnostic branch can be created and cleaned up successfully while workflow publication remains blocked, leaving no runnable GitHub job.

**How to apply:** Inspect workflows and runners before dispatching. If either prerequisite is missing, clean up any temporary branch and report the infrastructure prerequisite instead of waiting on an unserviceable run.