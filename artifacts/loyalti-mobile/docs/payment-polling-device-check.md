# Native payment polling device check

This is a repeatable Expo Go check for the payment screen's native
foreground/background lifecycle. It should be run on a physical iOS or
Android device because the browser preview cannot reproduce the native
`AppState` bridge.

## Version gate

This artifact currently targets **Expo SDK 54.0.0**. The package uses
`expo@~54.0.27`, and its generated iOS and Android manifests advertise
`runtimeVersion: exposdk:54.0.0`.

**Expo Go 57.0.9 is not a confirmed compatible runtime for this artifact.**
Do not record a device run against Expo Go 57.0.9 as release evidence unless
the app has first been upgraded to SDK 57 and the complete native matrix has
been rerun. Until then, use an Expo Go release that is explicitly compatible
with SDK 54 and record its exact version from the device.

## Before you start

- Use a test account and a test payment amount. Do not enter real card data.
- Start both managed workflows:
  - `artifacts/api-server: API Server`
  - `artifacts/loyalti-mobile: expo`
- Open the mobile artifact's preview URL on the device and choose **Open in
  Expo Go**. The device must be able to reach the same Replit development
  URL as the API.
- Keep the API workflow logs visible. The API request logger records completed
  requests without authorization headers or request bodies.

## Pending payment check

1. Sign in to the app and open **Оплатить сейчас**.
2. Start a small test rental payment. When the hosted provider checkout opens,
   leave it incomplete and return to the app. Alternatively, open a known
   pending payment from the payment screen using its `paymentId`.
3. Wait until the app shows **Платёж ожидает подтверждения** (or
   **Платёж обрабатывается**). In the API logs, note the payment status route
   and its current request count:

   ```text
   GET /api/finance/rentals/<payment-id>/status
   ```

   For a partner payment, use
   `/api/finance/purchases/<payment-id>/status` instead. Ignore requests for
   leases, partners, and other screens.
4. Leave the payment screen in the foreground for at least 6 seconds. Confirm
   that the same status route is requested again at roughly 2.5-second
   intervals. Let the count at this point be `N`.
5. Send the app to the background using the device Home gesture/button. Keep
   it backgrounded for at least 8 seconds. Confirm that the matching status
   route remains at exactly `N`; no payment status request may be completed
   during this interval.
6. Return to the app. Confirm that the matching status route increases by
   exactly one within about 3 seconds (`N + 1`). During the next 500 ms, it
   must not increase again. This is the single foreground refresh.
7. Leave the pending payment in the foreground for at least 3 seconds more.
   Confirm that a later request appears, proving that normal polling resumed
   after the one-time foreground refresh.

## Terminal-result check

Repeat the flow with a test payment that reaches each terminal result that is
available in the environment: succeeded, canceled, and failed.

For each result:

1. Confirm the corresponding result card is visible.
2. Record the matching status-route count and wait at least 8 seconds.
3. Confirm that the count does not increase while the terminal result remains
   visible. A terminal result must not start the 2.5-second polling loop.
4. If the terminal-result screen is backgrounded and reopened, allow at most
   one deliberate foreground refresh; confirm that no subsequent interval
   requests occur.

## Evidence to record

Record the device model and OS, Expo Go version, payment ID, payment type,
the `N` count from the pending check, the background duration, the count
immediately after foregrounding, and the terminal-result count. The check
passes only when all three pending-payment assertions and the terminal-result
assertion hold.