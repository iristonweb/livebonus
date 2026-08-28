# Implementation Plan — from prototype to MVP

## Phase 0 — stabilize prototype

### P0

- Fix lint command for Next.js 16.
- Add ESLint or Biome.
- Add CI: install, lint, typecheck, build.
- Add E2E smoke tests for every route.
- Remove/ignore `.next` from source workflow.
- Decide which of `all-in-guide.md` and `zhilbonus.md` is canonical.
- Add `.env.example`.

### Acceptance

```text
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

all pass in clean environment.

## Phase 1 — backend foundation

Recommended:
- PostgreSQL;
- API layer;
- server-side sessions;
- migrations;
- structured logging;
- request IDs;
- secrets via environment/secret manager.

Minimum entities:

```text
users
accounts
organizations
properties
contracts
consents
payment_intents
payment_events
loyalty_accounts
loyalty_transactions
offers
redemptions
audit_events
```

## Phase 2 — real authentication

Replace demo flow:

```text
email -> phone -> arbitrary 5 digits
```

with provider-backed verification.

Required:
- OTP issuance;
- expiration;
- retry limits;
- attempt limits;
- abuse prevention;
- session creation;
- logout/revocation;
- device/session audit.

Do not store verification codes in plaintext if persistence is required.

## Phase 3 — payments

Create provider abstraction:

```ts
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>;
  getPayment(id: string): Promise<PaymentStatus>;
  verifyWebhook(input: WebhookInput): Promise<VerifiedEvent>;
}
```

Do not couple domain logic directly to one PSP.

Required:
- provider reference;
- signed webhook verification;
- idempotency;
- timeout/retry;
- reconciliation;
- state machine;
- manual investigation path.

## Phase 4 — loyalty ledger

Never implement:

```text
balance = balance + points
```

as the only source of truth.

Use transactions:

```text
CREDIT
DEBIT
EXPIRE
REVERSAL
ADJUSTMENT
```

Balance can be derived/materialized from ledger.

Rule engine should support:

```text
base_rate
monthly_cap
campaign_multiplier
eligibility
expiry
```

## Phase 5 — offers

Start with an internal catalog.

Only after domain model is stable add external provider.

Redemption should be a state machine:

```text
requested
authorized
debited
issued
failed
reversed
```

## Phase 6 — geo

Replace browser-direct Nominatim with server-side provider boundary:

```text
Browser
  -> /api/geo/search
  -> provider
```

Add:
- rate limiting;
- caching;
- normalized results;
- provider abstraction;
- abuse controls;
- observability.

## Phase 7 — consent

Create immutable consent events.

Example:

```text
consent_id
user_id
type
version
status
source
created_at
revoked_at
```

Never infer consent from current checkbox state alone.

## Phase 8 — B2B

Add:
- organization;
- members;
- roles;
- properties;
- integration credentials;
- webhook subscriptions;
- registry export;
- reconciliation.

## Phase 9 — production hardening

- SAST/dependency scanning;
- rate limits;
- WAF/API gateway as appropriate;
- secrets rotation;
- backups;
- disaster recovery;
- monitoring;
- alerting;
- incident runbooks;
- privacy/security review;
- load tests.

## Suggested delivery order

```text
Prototype stabilization
  ↓
Auth
  ↓
Profiles/properties
  ↓
Payments
  ↓
Loyalty
  ↓
Offers
  ↓
Consent/reporting
  ↓
B2B
```

Do not start with mobile app, microservices, or complex personalization before payment + loyalty correctness is stable.
