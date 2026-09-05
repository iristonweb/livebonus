---
name: Wouter query filters
description: How query-string-driven filters stay reactive with the workspace's wouter router
---

Query-string-driven filters must read the router's dedicated search subscription rather than relying only on the pathname location hook.

**Why:** In the current wouter version, a category change can update the URL with pushState or popstate while pathname-based location state remains unchanged. That leaves the active pill and API query on the previous category, especially after browser back/forward.

**How to apply:** Use the search hook for query-derived UI state and the location setter for navigation. Keep the query parameter validated against the page's supported categories.