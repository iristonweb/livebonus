---
name: Live Score Architecture
description: How the Live Score rating system works — computation, DB schema, API routes, seeding
---

## Score Computation
- Base score: 500
- Final score = min(1000, max(0, 500 + sum(score_events.score_change) for user))
- Score is computed on GET /api/score and written back to users.live_score
- Tiers: premium ≥900, high ≥800, above_average ≥700, average ≥600, below_average <600

## DB Tables (new)
- `leases`: user_id, address, city, landlord_name, monthly_rent_rub, start_date, end_date, is_active, on_time_payments, late_payments, landlord_rating
- `score_events`: user_id, event_type, score_change, description, related_lease_id
- `users` extended: live_score, verification_level, is_phone_verified, is_identity_verified, is_income_verified

## API Routes (new)
- GET /api/score → LiveScore object with components breakdown
- GET /api/score/history → last 20 score events
- GET /api/leases → user's lease list
- POST /api/leases → add new lease

## Score Components (display only, grouped from events)
1. Верификация личности — from user.is_phone/identity/income_verified (max 250)
2. Платёжная история — payment_on_time / payment_late events (max 250)
3. Стаж аренды — lease_started / lease_completed / long_tenure events (max 200)
4. Отзывы арендодателей — landlord_review events (max 200)
5. Чистая история — no_disputes / dispute_opened events (max 100)

## Demo Data (user_id=1)
- 2 leases: completed (Тверская, 2022–2024) + active (Проспект Мира, 2024–now)
- Score events summing to ~377 above base → final score ~877 ("Надёжный" tier)
- User: is_phone_verified=true, is_identity_verified=true, is_income_verified=false

**Why:** Score computed dynamically from events (not stored), so adding new events instantly updates the score without migrations.

**How to apply:** Any new scoring feature = add a score_event_type + insert score_events rows. The computation in /api/score automatically picks them up.
