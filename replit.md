# ЛоялТи / Live Score

A loyalty and housing-trust platform with a React web app, Expo mobile app, Express API, and PostgreSQL database.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/loyalti run dev` — run the Vite web app through its managed artifact workflow
- `pnpm --filter @workspace/loyalti-mobile run dev` — run the Expo app through its managed artifact workflow
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the component preview canvas
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/loyalti run test:smoke` — browser smoke tests with fixture data (validation workflow `web-smoke`)
- `pnpm --filter @workspace/loyalti run test:contract` — live contract check: boots the API + web servers on dedicated ports and validates real dashboard/profile/score responses against the OpenAPI zod schemas (or set `LIVE_API_URL` / `LIVE_WEB_URL` to target a running environment)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run seed` — idempotently create the demo user, partners, offers, transactions, and reconcile the points balance (run after the schema is pushed)
- Required secrets/runtime env: `DATABASE_URL` and `SESSION_SECRET`; production admin sessions are issued only for phone numbers listed in the comma-separated `ADMIN_PHONES` environment variable.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/loyalti` — Vite/React web app
- `artifacts/loyalti-mobile` — Expo/React Native mobile app
- `artifacts/api-server` — Express API
- `lib/api-spec/openapi.yaml` — API contract
- `lib/db/src/schema` — Drizzle database schema
- `artifacts/mockup-sandbox` — canvas component preview server

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Phone-based sign-in and demo access
- Live Score housing-trust profile, history, and calculator
- Loyalty offers, rewards, and partner experiences

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Start app services through their managed artifact workflows so Replit injects `PORT`, `BASE_PATH`, and proxy routing.
- Apply the development schema with `pnpm --filter @workspace/db run push` before using database-backed API routes.
- The API startup runs the same demo-data seed automatically. For a new environment, apply the schema first, then run `pnpm --filter @workspace/api-server run seed` once; repeating it is safe and refreshes only the seeded offers when they expire.
- Mobile dependency installation is currently blocked by Replit's package firewall rejecting the `tar` dependency required by Expo CLI; the mobile artifact is temporarily excluded from the root pnpm workspace so web/API publishing can proceed. Do not bypass the firewall.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
