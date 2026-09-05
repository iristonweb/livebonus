---
name: GitHub private branch protection
description: GitHub plan limitation encountered when configuring required checks for a private personal repository
---

GitHub Free does not permit branch protection or repository rulesets on private personal repositories through the REST API; the API returns an upgrade-or-public error even with repository administrator permissions.

**Why:** Required PR statuses cannot be enforced reliably without the repository feature being available, and changing visibility exposes the repository's code.

**How to apply:** Check repository visibility and plan before attempting to configure required checks. If the user explicitly chooses public visibility, confirm the change and then configure protection; otherwise require a paid plan or a different repository.