---
name: React 19 ref type boundaries
description: Compatibility guidance for React 19 callback and object refs across dependencies with different @types/react patch versions.
---

When a workspace resolves multiple React 19 type packages, callback and object refs can become nominally incompatible even though their runtime shapes match. Keep strict checks enabled and adapt the ref at the component boundary with a local callback that forwards callback refs and updates object refs.

**Why:** React 19 ref callback return types include cleanup semantics backed by package-local types, so direct ref propagation can fail typechecking when a component library resolves a different @types/react patch version.

**How to apply:** Prefer a stable `useCallback` adapter in the wrapper component. Do not disable `strict`, `skipLibCheck`, or broadly cast the component props just to suppress the mismatch.