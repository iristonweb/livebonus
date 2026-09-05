# Native device release report

## Автоматический запуск

Перед каждым release candidate запускайте:

```text
pnpm --filter @workspace/loyalti-mobile run test:native-release
```

Runner пишет `native-device-release-report.json` и
`native-device-release-report.md` в `RELEASE_REPORT_DIR` (по умолчанию
`artifacts/loyalti-mobile/test-results/native-release`). Код завершения:

- `0` — по одному iOS и Android target прошли все native-сценарии;
- `1` — конфигурация targets некорректна или проверка найденного target
  завершилась ошибкой;
- `2` — проверка заблокирована: target или native device-lab runner отсутствует.

Если `NATIVE_DEVICE_TARGETS_JSON` задан, runner сначала проверяет, что список
содержит ровно один target для каждой требуемой платформы (`ios` и `android`).
Дубликаты платформ, неизвестные платформы и неполный список отклоняются до
запуска device adapter. В этом случае код завершения равен `1`, JSON и
Markdown-отчёты всё равно сохраняются, а в `runner.targetConfiguration.errors`
и секциях iOS/Android указано, какая платформа не покрыта.

Код `2` намеренный и не должен преобразовываться CI в зелёный результат.
Browser/Expo-web preview не является заменой native evidence.

### Автоматическая проверка контракта runner

Для локальной проверки release gate без физических устройств запускайте:

```text
pnpm --filter @workspace/loyalti-mobile run test:native-release:contract
```

Проверка использует только детерминированные adapter fixtures и не выдаёт их
за native evidence. Она проверяет, что runner:

- отклоняет отсутствующие device metadata, неполные scenario results и
  ошибочные payment-polling counters, дубликаты iOS/Android targets,
  неизвестные платформы и неполный список targets;
- сохраняет JSON и Markdown для `FAIL` и `BLOCKED` и возвращает ненулевой код;
- не запускает device adapter при некорректной конфигурации targets;
- принимает валидные результаты для iOS и Android, включая model, OS,
  Expo Go/build version и все payment metrics.

### Подключение device-lab или CI

Runner выбирает один target каждой платформы в таком порядке:

1. `NATIVE_DEVICE_TARGETS_JSON` — JSON-массив target-описаний. Если переменная
   задана, в ней должны быть ровно один iOS и один Android target;
2. `NATIVE_IOS_TARGET_ID` и `NATIVE_ANDROID_TARGET_ID`;
3. подключённое Android-устройство через `adb` или доступный iOS Simulator
   через `xcrun simctl`.

Для CI рекомендуется передавать метаданные target явно и подключать native
тестовый адаптер:

```text
NATIVE_DEVICE_TARGETS_JSON='[
  {"platform":"ios","targetId":"<real-ios-target-id>","model":"<actual-model>","os":"<actual-os>","expoGoVersion":"<actual-expo-go-version>"},
  {"platform":"android","targetId":"<real-android-target-id>","model":"<actual-model>","os":"<actual-os>","expoGoVersion":"<actual-expo-go-version>"}
]'
NATIVE_DEVICE_RUNNER=<provider-adapter-name>
NATIVE_DEVICE_TEST_COMMAND='../../ci/run-native-device-suite.sh'
RELEASE_REPORT_DIR="$PWD/native-release-report" \
pnpm --filter @workspace/loyalti-mobile run test:native-release
```

Строки `<...>` выше являются обязательными placeholder-ами, а не
допустимыми значениями. Перед запуском их нужно заменить фактическими данными
из выбранного provider.

В репозитории есть готовый CI job
`.github/workflows/native-device-release.yml`. Он запускается вручную и на
тегах `v*`, вызывает `ci/run-native-device-suite.sh`, а после native-прогона
проверяет наличие непустых и читаемых JSON и Markdown отчётов. Эта проверка
выполняется даже если native-прогон завершился ошибкой или был заблокирован.
Затем оба файла загружаются как один artifact; отсутствие любого файла,
ошибка чтения/разбора или ошибка загрузки делает job неуспешным.
После загрузки job публикует в `GITHUB_STEP_SUMMARY` статус native-прогона,
проверки отчётов и загрузки artifact, а также ссылки на JSON и Markdown
отчёты. Обе ссылки ведут на скачивание artifact с файлами отчётов. Summary
публикуется даже при ошибке native-прогона или загрузки и не изменяет
результат этих шагов. Поэтому ошибка проверки содержимого отчётов остаётся
отдельным статусом `Report verification: failure`, даже если native-прогон
завершился успешно; она не маскируется статусом `Native run: success`.

Все ручные и tag-запуски этой workflow используют одну concurrency-группу
`native-device-lab`. Поэтому на общем self-hosted runner новый запуск ждёт
завершения текущего и не отменяет его: не запускайте второй native-прогон
вручную в обход этой workflow, иначе два прогона могут одновременно захватить
одни физические устройства и испортить payment-polling evidence.

Выбранный способ подключения — self-hosted device lab. Runner должен быть
зарегистрирован в GitHub Actions на macOS с labels `self-hosted` и
`native-device-lab`, а физические iOS и Android targets должны быть доступны
этому runner. GitHub-hosted `ubuntu-latest` намеренно не используется: он не
может подключиться к телефонам пользователя.

Чтобы job использовал реальные targets, задайте в repository variables:

- `NATIVE_DEVICE_TARGETS_JSON` — ровно один поддерживаемый iOS и один
  поддерживаемый Android target;
- либо пары `NATIVE_IOS_TARGET_ID` / `NATIVE_ANDROID_TARGET_ID` с
  соответствующими `*_MODEL` и `*_OS`;
- `NATIVE_DEVICE_RUNNER` — имя lab-интеграции;
- `NATIVE_DEVICE_LAB_COMMAND` — команда адаптера, которая запускает suite на
  выбранном target и пишет результат в `NATIVE_REPORT_PATH`;
- `NATIVE_DEVICE_LAB_URL` — адрес lab, если он нужен адаптеру.

Если suite использует внешний lab API, его credential добавьте только как
GitHub Actions secret `NATIVE_DEVICE_LAB_TOKEN`. Workflow передаёт секрет
адаптеру через environment, а `ci/run-native-device-suite.sh` маскирует его
в stdout/stderr; значение не попадает в отчёт или логи. Для локального
self-hosted запуска без внешнего API этот secret не нужен.

После регистрации runner проверьте, что на нём доступны `adb`, `xcrun` и
инструменты выбранных iOS/Android native suites. Workflow печатает список
подключённых устройств перед запуском, но не превращает отсутствие устройств
в успешный результат.

Подставлять фиктивные target ID, модель, ОС или payment metrics нельзя: при
отсутствии реального target/команды результат должен остаться `BLOCKED`.

Для разных команд можно задать `NATIVE_IOS_DEVICE_TEST_COMMAND` и
`NATIVE_ANDROID_DEVICE_TEST_COMMAND`; иначе обе платформы используют
`NATIVE_DEVICE_TEST_COMMAND`.


### Личное устройство через Expo Go

Личный iPhone или Android-телефон, на котором приложение открывается через
Expo Go, не является CI target. GitHub-hosted runner не может подключиться к
телефону пользователя, выполнить на нём сценарии и получить его payment
polling metrics. Поэтому модель вроде `iPhone 11` или `Redmi` нельзя указывать
как `targetId`: для автоматического запуска нужен настоящий ID, выданный
device-lab provider, либо доступный self-hosted runner с подключённым
устройством.

Такое устройство можно использовать для ручной проверки по
[`payment-polling-device-check.md`](./payment-polling-device-check.md). В
ручное evidence нужно записать фактические модель, ОС, версию Expo Go, payment
ID и все счётчики polling. Ручная проверка не меняет CI-статус на `passed` и не
подменяет результат native adapter.

Версия Expo Go должна соответствовать фактическому runtime приложения. Сейчас
этот артефакт использует Expo SDK 54; значение `57.0.9` нельзя объявлять
подтверждённой совместимой версией только по номеру, указанному на телефоне.
Сначала нужно либо подтвердить запуск текущего SDK в этой версии Expo Go,
либо обновить SDK и пройти отдельную проверку сборки.

Команда получает следующие переменные окружения:

- `NATIVE_PLATFORM`, `NATIVE_TARGET_ID`, `NATIVE_TARGET_MODEL`,
  `NATIVE_TARGET_OS`;
- `NATIVE_EXPO_GO_VERSION`, `NATIVE_BUILD_VERSION`,
  `NATIVE_DEEP_LINK_SCHEME`;
- `NATIVE_PAYMENT_STATUSES=succeeded,canceled,failed`;
- `NATIVE_REQUIRED_SCENARIOS=authSession,passportPrivacy,scoreDispute,hostedCheckoutReturn`;
- `NATIVE_REPORT_PATH` — путь, куда нужно записать JSON результата.

Адаптер должен запускать native suite на выбранном target и записывать
результат в `NATIVE_REPORT_PATH` либо вывести один JSON-объект последней
строкой stdout. До запуска можно использовать Expo Go или release build, но
результат обязан сообщить фактическую версию Expo Go/build.
Поля `device.model`, `device.os` и `device.buildVersion` обязательны и должны
приходить от adapter result, а не подставляться из конфигурации target.

Форма результата адаптера (для краткости ниже показан один payment case;
адаптер обязан вернуть все три):

```json
{
  "status": "passed",
  "device": {
    "model": "iPhone 16",
    "os": "iOS 18.6",
    "expoGoVersion": "54.0.20",
    "buildVersion": "1.0.0"
  },
  "scenarios": {
    "authSession": "passed",
    "passportPrivacy": "passed",
    "scoreDispute": "passed",
    "hostedCheckoutReturn": "passed"
  },
  "paymentPolling": {
    "statuses": {
      "succeeded": {
        "status": "passed",
        "paymentId": "ios-success-123",
        "backgroundDurationMs": 8200,
        "backgroundIntervalsMs": [8200],
        "statusRequestCounts": {
          "foregroundBeforeBackground": 2,
          "duringBackground": 0,
          "foregroundAfterBackground": 1,
          "terminal": 1
        }
      },
      "canceled": {
        "status": "passed",
        "paymentId": "ios-canceled-123",
        "backgroundDurationMs": 8100,
        "backgroundIntervalsMs": [8100],
        "statusRequestCounts": {
          "foregroundBeforeBackground": 1,
          "duringBackground": 0,
          "foregroundAfterBackground": 1,
          "terminal": 1
        }
      },
      "failed": {
        "status": "passed",
        "paymentId": "ios-failed-123",
        "backgroundDurationMs": 8050,
        "backgroundIntervalsMs": [8050],
        "statusRequestCounts": {
          "foregroundBeforeBackground": 1,
          "duringBackground": 0,
          "foregroundAfterBackground": 1,
          "terminal": 1
        }
      }
    }
  }
}
```

Каждый из `canceled` и `failed` должен иметь такую же полную форму, как
`succeeded`. Runner проверяет наличие payment ID, интервала и длительности
background, всех четырёх status-request counts, отсутствие запросов в
background и хотя бы один refresh после возврата в foreground. Счётчики
относятся к своим фазам (это не cumulative totals): `foregroundAfterBackground`
должен быть не меньше одного, а дополнительные interval-запросы после
deliberate refresh могут быть отражены отдельно в native suite.

## Интерпретация отчёта без target

Если в workspace нет устройства или simulator, `adb`, `xcrun/simctl` и
device-lab command, runner всё равно создаёт отчёт с отдельной строкой
`BLOCKED` для каждой отсутствующей платформы и возвращает код `2`. Это
блокирующее отсутствие native evidence, а не успешный пропуск.

## Исторический ручной результат

Снимок ниже сохранён как baseline до появления автоматического runner.

## Итог

**Native-device coverage: BLOCKED / NOT EXECUTED in this workspace.**

В окружении нет подключённого физического устройства, Android SDK/ADB,
Android Emulator или iOS Simulator/Xcode. Поэтому проверки ниже нельзя
считать пройденными на iOS или Android. Chromium/Expo-web результаты приведены
отдельно и не используются как замена native coverage.

Поддерживаемые target-платформы подтверждены конфигурацией Expo:

- iOS
- Android
- схема deep link: `loyalti-mobile`

## Фактическая доступность targets

Проверено 3 сентября 2026 года в текущем workspace:

| Target | Модель устройства | OS | Expo Go | Native runner | Результат |
| --- | --- | --- | --- | --- | --- |
| iOS | Не доступно | Не доступно | Не доступно | `xcrun`, `simctl`, Detox и Maestro отсутствуют | **Blocked — не запускался** |
| Android | Не доступно | Не доступно | Не доступно | `adb`, `emulator`, Detox и Maestro отсутствуют | **Blocked — не запускался** |

`artifacts/loyalti-mobile/.expo/devices.json` содержит пустой список
подключённых устройств (`"devices": []`). Версия установленного Expo CLI —
`54.0.27`; это не является версией Expo Go и не заменяет сведения о версии
Expo Go на target-устройстве.

## Что проверено в доступном browser-слое

Команда:

```text
pnpm --filter @workspace/loyalti-mobile run test:preview
```

Результат актуального запуска 3 сентября 2026 года: **PASS — 33 теста**.

В рамках этого запуска также успешно собраны production-style Expo Go
bundles для `ios` и `android` и проверены их манифесты. Это подтверждает
совместимость JavaScript-бандла и схему публикации, но не установку или
запуск на физическом устройстве.

В этот набор входят:

- OTP login, восстановление session, logout и очистка просроченной session;
- token-based Live Passport: создание/отзыв ссылки и безопасное состояние
  malformed route;
- Live Score loading error/retry;
- rental и partner payment navigation, SBP/Mir Pay, checkout payload;
- payment status polling и terminal states с симуляцией browser visibility;
- сохранение и отображение offers.

Это проверки Expo web preview в Chromium. Они не подтверждают системные
permission prompts, native `Share`, `Linking`, hosted-browser return или
native `AppState`.

## Native matrix

| Критический сценарий | iOS device/simulator | Android device/emulator | Browser evidence | Native result |
| --- | --- | --- | --- | --- |
| Auth/session: OTP, restore, logout, expired session | **Not run** — Xcode/Simulator unavailable | **Not run** — ADB/emulator unavailable | PASS | **Blocked** |
| Passport privacy: token route, create/revoke, share/open deep link | **Not run** — `Share`/`Linking` handoff unavailable | **Not run** — `Share`/`Linking` handoff unavailable | PASS for token/malformed-route behavior | **Blocked** |
| Score/dispute: score loading/retry and dispute actions | **Not run** | **Not run** | Score retry covered; no native action coverage | **Blocked** |
| Finance: SBP/Mir Pay, hosted checkout return, pending polling, terminal result | **Not run** — native `AppState` and browser return unavailable | **Not run** — native `AppState` and browser return unavailable | PASS, including visibility-based polling simulation | **Blocked** |
| Permissions: photo-library document selection for verification | **Not run** — permission prompt unavailable | **Not run** — permission prompt unavailable | Not applicable | **Blocked** |

## Why native execution was unavailable

The following tools were not present in the workspace:

- `adb`
- `emulator`
- `xcrun` / `simctl`
- Maestro
- Detox

`expo run:android` is available as a CLI command, but there is no Android
target to build/install against and no generated native project checked into
this Expo Go preview artifact. No native app binary was installed or launched.

## Required device pass before release

Run the existing payment lifecycle checklist in
[`payment-polling-device-check.md`](./payment-polling-device-check.md) on at
least one supported iOS and one supported Android target. Record, for each
target, the device model, OS, Expo Go version, payment ID/type, background
duration, status-request counts, and terminal-result behavior.

The release status must remain **native pending** until the matrix above has
real device evidence. A passing Chromium preview must not change that status.

## Проверка Expo Go 57.0.9 — 4 сентября 2026 года

**Решение: Expo Go 57.0.9 не подтверждён и не должен использоваться как
совместимый runtime для текущего артефакта.** SDK не обновлялся в рамках этой
проверки: без физических устройств нельзя безопасно принимать обновление
major-версии и объявлять результат совместимым. До отдельного обновления и
регрессионного прогона SDK 57 следует использовать только Expo Go, явно
совместимый с SDK 54, записывая его фактическую версию на каждом устройстве.

### Фактическая runtime-конфигурация

| Источник | Значение |
| --- | --- |
| `expo` package | `54.0.27` |
| `@expo/cli` | `54.0.23` |
| `expo config --json` → `sdkVersion` | `54.0.0` |
| iOS manifest → `runtimeVersion` | `exposdk:54.0.0` |
| Android manifest → `runtimeVersion` | `exposdk:54.0.0` |
| Запрошенная версия Expo Go | `57.0.9` — на target-устройстве не наблюдалась |

### iPhone 11 и Android

Проверка на требуемом iPhone 11 и Android-устройстве **не выполнена**:

- `.expo/devices.json` содержит `devices: []`;
- отсутствуют `xcrun`/`simctl`, `adb`, Android Emulator, Maestro и Detox;
- native runner завершился с кодом `2` (`BLOCKED`), создав отдельные
  iOS/Android записи `No ios target was discovered` и
  `No android target was discovered`;
- фактические model, OS, Expo Go version, payment ID и polling counters
  отсутствуют, поэтому их нельзя подставлять из конфигурации или fixture.

Следовательно, на физических устройствах не подтверждены critical auth,
deep-link/share, hosted checkout return, native `AppState`, payment polling
или terminal-result сценарии. Это не означает, что они сломаны; это означает,
что release evidence отсутствует.

### Проверки, выполненные в workspace

- `CI=1 pnpm exec expo install --check` — **PASS**;
- `pnpm dlx expo-doctor@latest` — **18/18 checks passed**;
- `pnpm run test:native-release:contract` — **PASS** (только deterministic
  fixtures, не native evidence);
- `test:native-release` — **BLOCKED**, exit code `2`;
- отдельный `pnpm run build` — **PASS** для iOS и Android bundles/manifests;
- `test:preview` в этом запуске — **FAIL** на проверке временного
  build-report после signal-regression: найден корректный `SIGHUP` report с
  `passed: false`, хотя сам последующий `pnpm run build` завершился успешно.
  Эта сборка не является проверкой запуска Expo Go на устройстве.

### Что требуется для снятия блокировки

Нужны один реальный iPhone 11 и один реальный Android target с фактическими
моделью, OS и версией Expo Go. На каждом target нужно пройти auth, deep link,
checkout return, AppState и все три payment polling terminal cases по
[`payment-polling-device-check.md`](./payment-polling-device-check.md), затем
сохранить adapter result. Пока это не сделано, статус остаётся
**native pending / blocked**, а Expo Go 57.0.9 не считается совместимым.

## Other release evidence

The mobile typecheck was attempted separately and currently reports 31 errors
caused by stale/missing exports in the generated `@workspace/api-client-react`
declarations (including verification, passport, dispute and score fields).
This is tracked by the separate generated-declarations release task and is not
silently treated as native coverage.
