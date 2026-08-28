# Architecture

## Current architecture

```text
Browser
  |
  v
Next.js App Router
  |
  +-- Server Components
  |     +-- page.tsx
  |     +-- /features
  |     +-- /partners
  |     +-- /docs
  |     +-- /api/health
  |
  +-- Client Components
        +-- Header
        +-- AuthModal
        +-- ThemeToggle
        +-- MapHero
        +-- /apply
        +-- /register
        +-- SmartPlaceInput
        +-- form controls

Browser localStorage
  +-- allin_auth
  +-- allin_apply_draft
  +-- allin_register_draft

External browser call
  +-- OpenStreetMap Nominatim
```

## Target architecture

Для реального продукта рекомендуется начинать с модульного backend, а не сразу с микросервисов.

```text
Web / Mobile
    |
    v
API / BFF
    |
    +-- Auth & Identity
    +-- Profiles
    +-- Properties / Contracts
    +-- Payments
    +-- Loyalty
    +-- Offers
    +-- Consent
    +-- Notifications
    +-- Partner/B2B
    +-- Reporting
    |
    +-- PostgreSQL
    +-- Redis
    +-- Object Storage / Vault
    +-- Queue / Event Bus
    |
    +-- PSP / SBP
    +-- Geo provider
    +-- Offer provider
    +-- Notification provider
    +-- BKI provider (если будет отдельный legal/product approval)
```

## Domain modules

### Identity

Ответственность:
- account;
- verification;
- sessions;
- device/risk metadata;
- recovery.

### Profiles

Ответственность:
- individual/legal profile;
- contact data;
- organization;
- roles.

### Properties

Ответственность:
- rental object;
- address/geo reference;
- contract;
- payer/recipient relationship;
- utility account if applicable.

### Payments

Ответственность:
- payment intent;
- PSP reference;
- amount;
- status;
- webhook;
- reconciliation;
- idempotency.

State machine:

```text
created
  -> pending
      -> succeeded
      -> failed
      -> expired
```

### Loyalty

Ответственность:
- points ledger;
- accrual rules;
- monthly limits;
- expiry;
- reversal;
- redemption.

Важно: баланс нельзя хранить только как mutable number. Источник истины — ledger/transactions.

### Offers

Ответственность:
- offer catalog;
- partner;
- eligibility;
- pricing;
- stock/availability;
- redemption;
- voucher.

### Consent

Ответственность:
- consent type;
- version;
- timestamp;
- actor;
- source;
- current state;
- audit trail.

## Event model

Минимальный event flow:

```text
payment.created
  -> payment.pending
  -> payment.succeeded
  -> loyalty.credit.requested
  -> loyalty.credited
```

Redemption:

```text
offer.redeem.requested
  -> loyalty.debit.requested
  -> loyalty.debited
  -> voucher.issue.requested
  -> voucher.issued
```

Ошибки должны быть компенсируемыми. Нельзя делать финансовую операцию и выдачу voucher одной неатомарной цепочкой без состояния/саги.

## Idempotency

Все внешние callbacks и финансовые команды должны иметь idempotency key.

Пример:

```text
Idempotency-Key: psp-webhook:<provider_event_id>
```

Уникальность должна обеспечиваться сервером/БД.

## Data boundaries

PII:

```text
Profile / Identity
```

Financial:

```text
Payments / Loyalty
```

Product:

```text
Offers
```

Audit:

```text
Consent / Financial audit
```

Логи приложения не должны содержать полные email, телефоны, документы и адреса.

## Frontend boundary

Frontend отвечает за:
- presentation;
- local interaction state;
- optimistic UI только там, где backend contract это допускает;
- validation UX.

Backend отвечает за:
- authorization;
- business rules;
- financial state;
- consent;
- idempotency;
- persistence;
- external integrations.

Никогда не доверять frontend validation как security control.

## Suggested repository evolution

```text
app/
components/
lib/
docs/

server/
  modules/
    auth/
    profiles/
    properties/
    payments/
    loyalty/
    offers/
    consent/
    partners/
  integrations/
    psp/
    geo/
    notifications/
  db/
  events/
```

Не делать backend abstraction заранее ради абстракции. Сначала стабилизировать domain contracts.
