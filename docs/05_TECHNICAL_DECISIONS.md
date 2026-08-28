# Technical Decisions / ADR-lite

## TD-001 — Keep Next.js App Router

Status: accepted.

Reason:
- already implemented;
- good fit for marketing + authenticated web surfaces;
- server/client component split is already used.

## TD-002 — Modular monolith before microservices

Status: recommended.

Reason:
- product is early;
- financial correctness is more important than service decomposition;
- fewer distributed consistency problems.

Split services only when ownership/scaling/reliability requirements justify it.

## TD-003 — PostgreSQL as source of truth

Use PostgreSQL for:
- identity metadata;
- profiles;
- contracts;
- payment records;
- loyalty ledger;
- consent/audit;
- offers/redemptions.

Redis is a cache/coordination layer, not financial source of truth.

## TD-004 — Ledger for points

Points must be represented as immutable transactions.

Benefits:
- auditability;
- reversals;
- expiration;
- dispute handling;
- reconciliation.

## TD-005 — Provider adapters

PSP, geo, notifications and offer vendors must sit behind interfaces.

This prevents provider-specific fields from leaking through the entire domain.

## TD-006 — Server-side geo proxy

Do not make production dependency on public browser-side Nominatim calls.

Use:

```text
/api/geo/search
```

and provider adapter.

## TD-007 — Consent as versioned domain data

Checkboxes are UI. Consent is a legal/business event.

Persist:
- document version;
- exact consent type;
- timestamp;
- source;
- actor;
- status.

## TD-008 — Frontend validation is UX only

Backend re-validates:
- authorization;
- amount;
- ownership/relationship;
- eligibility;
- limits;
- consent;
- state transitions.

## TD-009 — Money representation

Do not use floating point for money.

Use integer minor units or decimal with explicit currency.

For RUB:

```text
amount_minor: integer
currency: RUB
```

Points are integer units.

## TD-010 — Idempotency everywhere money moves

At minimum:
- payment creation;
- PSP webhooks;
- loyalty credit;
- loyalty debit;
- voucher issuance.

## TD-011 — Do not promise "0 ₽" without commercial verification

The current product spec uses a 0 ₽ user-facing commission claim. Keep it as a product hypothesis until the concrete PSP/payment flow and pricing are approved.

## TD-012 — Legal claims must be implementation-specific

Do not treat "152-FZ / 115-FZ / 218-FZ" badges as proof of compliance.

Compliance documentation must describe actual processing, roles, infrastructure, retention, consent and vendors.

## TD-013 — Canonical documentation

Recommended canonical hierarchy:

```text
docs/
  product/
  architecture/
  api/
  operations/
  compliance/
```

AI context files at repository root should point to canonical docs, not duplicate them.

## TD-014 — Tests are part of the feature

A change to a financial state transition is incomplete until:
- unit tests;
- integration tests;
- relevant E2E test;
- migration test if schema changes.

## TD-015 — Preserve current UX identity

The current UI has a deliberate Neo-Industrial / holographic visual language:
- dark graphite base;
- cyan/teal accent;
- warm orange secondary accent;
- Inter body;
- Manrope headings;
- controlled motion;
- glass/scanline/grid effects.

Do not replace this visual system wholesale without an explicit design decision.
