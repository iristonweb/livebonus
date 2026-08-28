# Runbook

## Local / Replit startup

Requirements:
- Node.js >= 20.9
- npm

Install:

```bash
npm install
```

Development:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Route smoke test

Check:

```text
/
 /features
 /start
 /apply
 /register
 /partners
 /docs
 /api/health
```

## Expected demo behavior

### Header

- desktop nav;
- mobile menu below ~980px;
- login modal;
- theme toggle.

### Auth modal

Expected:
- email validation;
- phone digit validation;
- any 5-digit code accepted in demo;
- scenario selection;
- redirect to `/apply`.

### Apply

Query parameters:

```text
/apply?type=individual&intent=rent_in
/apply?type=legal&intent=rent_in
/apply?type=individual&intent=rent_out
/apply?type=legal&intent=rent_out
```

Supported `type`:
- `individual`
- `legal`

Supported `intent`:
- `rent_in`
- `rent_out`

### Register

Same account/intent matrix, with step parameter support in source.

## Health check

```bash
curl http://localhost:3000/api/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "all-in-guide-site",
  "ts": "..."
}
```

## Build validation

```bash
npm run build
```

Then:

```bash
npm run start
```

## Typecheck

No dedicated script currently exists. Use:

```bash
npx tsc --noEmit
```

## Lint

Current repository script is:

```text
next lint
```

This is invalid for Next.js 16 because `next lint` was removed.

Choose one:

```text
eslint
```

or:

```text
biome check
```

Then update `package.json`.

Official Next.js guidance:
https://nextjs.org/docs/app/getting-started/installation

## Debugging order

1. Reproduce.
2. Read browser console.
3. Read terminal output.
4. Check route/component boundary.
5. Check localStorage state.
6. Check network request.
7. Check TypeScript.
8. Check build.
9. Add regression test.

## Demo data reset

In browser DevTools:

```js
localStorage.removeItem("allin_auth")
localStorage.removeItem("allin_apply_draft")
localStorage.removeItem("allin_register_draft")
```

Or clear site storage.

## Production warning

Never ship:
- arbitrary OTP acceptance;
- localStorage auth;
- client-only financial rules;
- browser-direct financial provider integration;
- unverified compliance claims.
