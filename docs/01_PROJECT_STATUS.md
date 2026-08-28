# Project Status — фактический аудит

Дата аудита: 2026-08-28.

## 1. Технологический стек

Фактически в `package.json`:

- Next.js `16.1.4`
- React `19.2.3`
- React DOM `19.2.3`
- TypeScript `5.9.3`
- `react-markdown` `10.1.0`
- `remark-gfm` `4.0.1`
- Node engine: `>=20.9.0`
- TypeScript/React type packages присутствуют.

Next.js 16 действительно требует Node.js 20.9+ и удаляет `next lint`; это подтверждено официальной документацией Next.js. См.:
https://nextjs.org/blog/next-16
https://nextjs.org/docs/app/guides/upgrading/version-16

## 2. Фактический статус

### Реализовано

- App Router.
- Русскоязычный responsive UI.
- Header + desktop/mobile navigation.
- Dark/light theme toggle.
- Главный лендинг.
- Feature page.
- B2B page.
- Demo payment flow.
- Demo auth modal.
- `/apply`.
- `/register`.
- Markdown documentation reader.
- `/api/health`.
- Smart place input с локальными подсказками и demo-запросом к Nominatim.
- localStorage для demo-состояния.
- prefers-reduced-motion для части анимаций.

### Не реализовано

- Backend persistence.
- Database.
- Real user accounts.
- Real OTP/SMS.
- Passwordless authentication server-side.
- Session/cookie/JWT infrastructure.
- Real PSP integration.
- SBP payment initiation.
- PSP webhook verification.
- Payment reconciliation.
- Loyalty ledger.
- Idempotency storage.
- Offers catalog backend.
- Voucher issuance.
- B2B integration API.
- CRM webhook.
- Notification service.
- Audit log backend.
- KYC/AML service.
- Real consent ledger.
- BKI/rent-reporting integration.
- Admin/control room.

## 3. Demo-auth

`components/AuthModal.tsx` реализует:

1. Email.
2. Телефон.
3. 5-значный код.
4. Выбор `individual/legal`.
5. Выбор `rent_in/rent_out`.
6. Redirect на `/apply?type=...&intent=...`.

В demo любой код из 5 цифр считается допустимым.

Контакты сохраняются в:

```text
localStorage["allin_auth"]
```

Это НЕ является аутентификацией и НЕ должно переноситься в production как security mechanism.

## 4. Demo state

`/apply` использует:

```text
allin_auth
allin_apply_draft
```

`/register` использует:

```text
allin_register_draft
```

Это браузерное состояние, а не серверное хранилище.

## 5. Geo autocomplete

`components/forms/SmartPlaceInput.tsx`:

- локальные списки городов;
- локальные подсказки метро для Москвы/Санкт-Петербурга;
- debounce 300 ms;
- AbortController;
- in-memory cache;
- cache TTL 5 минут;
- максимум 100 cache entries;
- remote запрос к `https://nominatim.openstreetmap.org/search`;
- `countrycodes=ru`;
- максимум 5 результатов от Nominatim;
- итоговый список ограничен 8 вариантами.

Production-риск: запрос идёт напрямую из браузера к публичному endpoint. Нет server-side proxy, централизованного rate limiting, провайдерского SLA или контроля нагрузки.

## 6. Backend

Единственный route handler:

`app/api/health/route.ts`

Возвращает:

```json
{
  "ok": true,
  "service": "all-in-guide-site",
  "ts": "..."
}
```

Runtime: Node.js.

## 7. Documentation

`/docs` читает файл:

```text
docs/all-in-guide.md
```

через `fs/promises` на сервере и рендерит его через:

- `react-markdown`
- `remark-gfm`

`docs/zhilbonus.md` является байт-в-байт копией `docs/all-in-guide.md` на момент аудита.

`docs/design-lab.md` — отдельный design/product document.

## 8. Репозиторий

В архиве присутствуют `.git` и `.next`. Для рабочего репозитория `.next` должен оставаться build artifact и не должен использоваться как источник истины.

Не использовать скомпилированные `.next` файлы для принятия архитектурных решений, если соответствующий source-файл существует.

## 9. Проверка сборки

В предоставленном архиве отсутствует `node_modules`, поэтому полный `npm run build` в рамках офлайн-аудита не выполнялся.

Статический аудит выполнен по исходникам, `package.json`, lockfile и существующему `.next`.

Перед изменениями в Replit обязательно выполнить:

```bash
npm install
npm run build
```

После исправления lint script:

```bash
npm run lint
```

## 10. Наиболее важные технические проблемы

### P0 — ложное ощущение production readiness

UI говорит о СБП, consent, rent-reporting и безопасности, но серверной реализации этих функций нет.

### P1 — lint script несовместим с Next.js 16

Текущий:

```text
next lint
```

нужно заменить на ESLint CLI или Biome.

### P1 — нет backend/domain model

Product spec предполагает payment/loyalty/offers/profiles, но source repository содержит только frontend prototype.

### P1 — geo provider напрямую из клиента

Перенести production geo search за server-side boundary.

### P1 — нет тестов

Нет unit/integration/e2e test suite.

### P2 — product rules hardcoded в UI

Правила вроде 1%, 5000 points/month и 12 months находятся в документации/UI, а не в backend rule engine.

### P2 — duplicate documentation

`all-in-guide.md` и `zhilbonus.md` дублируют друг друга и создают риск расхождения.

## 11. Рекомендация

Считать текущую версию `Prototype / UX validation`, а не `MVP backend`.
