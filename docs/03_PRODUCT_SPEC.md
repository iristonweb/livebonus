# Product Specification — normalized

## Product

All in Guide — loyalty layer вокруг регулярных платежей за жильё/ЖКУ.

Core promise:

> Пользователь оплачивает жильё привычным способом через СБП и получает прозрачную выгоду в виде баллов/привилегий.

## Primary users

### Individual renter

- арендует жильё;
- регулярно платит;
- хочет получать выгоду;
- может opt-in в дополнительные программы.

### Property owner / landlord

- сдаёт жильё;
- хочет цифровой поток платежей и арендаторов.

### Individual resident

- платит ЖКУ;
- хочет удобный payment flow и benefits.

### Legal entity

- арендует жильё для сотрудников;
- требует документы/счета;
- нуждается в B2B controls.

### УК / landlord partner

- хочет увеличить собираемость;
- хочет статусы платежей и сверку;
- может использовать API/white-label.

## Current UX scenarios

### Scenario A — rent in

```text
Login
 -> verification demo
 -> choose individual/legal
 -> choose rent in
 -> /apply
 -> city + budget minimum
 -> search preferences
 -> draft
```

### Scenario B — rent out

```text
Login
 -> verification demo
 -> choose individual/legal
 -> choose rent out
 -> /apply
 -> city + price minimum
 -> listing details
 -> draft
```

### Extended registration

`/register`:

```text
Step 1: registration
Step 2: listing/search
Step 3: draft review
```

## Product rules from current spec

Current product document proposes:

- 1 point per 100 ₽;
- approximately 1% effective reward;
- monthly cap: 5,000 points;
- points expiry: 12 months;
- user-facing payment commission: intended as 0 ₽;
- rent-reporting: explicit opt-in/opt-out.

Эти правила пока являются product specification, а не enforced backend rules.

## Payment UX

Target flow:

```text
Select property
 -> enter amount
 -> preview amount + expected points + limits
 -> initiate SBP
 -> confirm in bank
 -> return
 -> pending
 -> succeeded
 -> points credited
```

## Offers UX

```text
Offers
 -> category/search/nearby
 -> offer details
 -> eligibility
 -> redeem confirmation
 -> points debit
 -> voucher/code
```

## B2B

Target capabilities:

- payment status;
- registry export;
- reconciliation;
- account/object linking;
- notifications;
- white-label option;
- SLA.

## Product invariants

1. User must see material reward rules before payment confirmation.
2. Reward credit only after trusted payment success.
3. A payment event cannot credit points twice.
4. Points debit cannot produce negative balance.
5. Consent state must be versioned and auditable.
6. Optional reporting must never be silently enabled.
7. Product copy must not claim integrations that are not operational.

## Regulatory/product caution

Current documents mention 152-FZ, 115-FZ, 218-FZ and SBP. These references are not a substitute for legal analysis.

For implementation, every regulated flow needs:
- identified legal entity/operator;
- data-controller/processor roles;
- legal basis;
- retention policy;
- consent wording/versioning;
- vendor/PSP responsibilities;
- incident response;
- audit requirements.

Do not write "compliant" into production copy until legal/security review has explicitly approved the concrete implementation.

## External factual anchor

The Bank of Russia describes SBP as a 24/7 service for instant transfers and payments, including utility payments. See official source:
https://www.cbr.ru/PSystem/sfp
