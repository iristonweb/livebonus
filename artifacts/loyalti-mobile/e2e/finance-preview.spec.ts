import { expect, test, type Page } from "@playwright/test";

const policy = {
  id: 1,
  version: 7,
  currency: "RUB",
  purchaseRedemptionRate: 0.15,
  partnerFeeRate: 0.015,
  rentalBonusRate: 0.1,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
};

const activeLease = {
  id: 1,
  address: "ул. Тестовая, 1",
  city: "Москва",
  monthlyRentRub: 100_000,
  startDate: "2026-01-15T00:00:00.000Z",
  isActive: true,
  onTimePayments: 12,
  latePayments: 0,
};

const dashboardSummary = {
  pointsBalance: 12_450,
  status: "gold",
  statusMultiplier: 1.25,
  pointsEarnedThisMonth: 1_250,
  pointsSpentThisMonth: 300,
  totalPartnersAvailable: 0,
  activeOffersCount: 0,
  pointsToNextStatus: 25_000,
  nextStatus: "platinum",
  bonusBalanceRub: 9_960,
};

type LedgerEntry = {
  id: number;
  userId: number;
  transactionId: number | null;
  entryType: "credit" | "debit";
  source: string;
  amountRubSigned: number;
  dealType: "partner_purchase" | "rental_deal" | null;
  settlementStatus: "settled" | "refunded" | "pending";
  createdAt: string;
  dealGrossAmountRub: number | null;
  dealNetAmountRub: number | null;
  dealFeeAmountRub: number | null;
  dealTenantBonusRub: number | null;
  dealLandlordBonusRub: number | null;
  category?: string | null;
  partnerName?: string | null;
};

type Transaction = {
  id: number;
  userId: number;
  type: "earn" | "redeem";
  amountRubSigned: number;
  pointsEarned: number;
  description: string;
  category: string;
  partnerName: string | null;
  createdAt: string;
};

const settledCredit: LedgerEntry = {
  id: 101,
  userId: 1,
  transactionId: null,
  entryType: "credit",
  source: "rental_settlement",
  amountRubSigned: 1_000,
  dealType: "rental_deal",
  settlementStatus: "settled",
  createdAt: "2026-08-20T10:00:00.000Z",
  dealGrossAmountRub: 100_000,
  dealNetAmountRub: null,
  dealFeeAmountRub: 1_500,
  dealTenantBonusRub: 10_000,
  dealLandlordBonusRub: 10_000,
  category: "rent",
};

const settledDebit: LedgerEntry = {
  ...settledCredit,
  id: 102,
  transactionId: 304,
  entryType: "debit",
  source: "partner_purchase",
  amountRubSigned: -500,
  dealType: "partner_purchase",
  createdAt: "2026-08-19T10:00:00.000Z",
  dealGrossAmountRub: 3_000,
  dealNetAmountRub: 2_500,
  dealFeeAmountRub: 37.5,
  dealTenantBonusRub: null,
  dealLandlordBonusRub: null,
  category: "food",
  partnerName: "Партнёр",
};

const linkedConfirmedTransaction: Transaction = {
  id: 304,
  userId: 1,
  type: "redeem",
  amountRubSigned: -500,
  pointsEarned: -62,
  description: "Подтверждённая покупка",
  category: "food",
  partnerName: "Партнёр",
  createdAt: "2026-08-19T10:00:00.000Z",
};

const settledOther: LedgerEntry = {
  ...settledCredit,
  id: 103,
  entryType: "credit",
  source: "manual_adjustment",
  amountRubSigned: 250,
  dealType: null,
  createdAt: "2026-08-17T10:00:00.000Z",
  dealGrossAmountRub: null,
  dealFeeAmountRub: null,
  dealTenantBonusRub: null,
  dealLandlordBonusRub: null,
  category: "other",
};

const refundedPurchase: LedgerEntry = {
  ...settledDebit,
  id: 104,
  transactionId: null,
  entryType: "credit",
  source: "refund",
  amountRubSigned: 500,
  settlementStatus: "refunded",
  createdAt: "2026-08-16T10:00:00.000Z",
  category: "food",
};

const pendingRental: LedgerEntry = {
  ...settledCredit,
  id: 105,
  transactionId: null,
  entryType: "debit",
  source: "rental_payment",
  amountRubSigned: -1_000,
  settlementStatus: "pending",
  createdAt: "2026-08-15T10:00:00.000Z",
  category: "rent",
};

const legacyTransaction: Transaction = {
  id: 303,
  userId: 1,
  type: "redeem",
  amountRubSigned: -250,
  pointsEarned: -312,
  description: "Старое списание",
  category: "food",
  partnerName: "Legacy партнёр",
  createdAt: "2026-08-18T10:00:00.000Z",
};

type FinancePreviewOptions = {
  summaryStatus?: number;
  ledgerStatus?: number;
  ledger?: LedgerEntry[];
  transactions?: Transaction[];
  activeLease?: typeof activeLease | null;
  checkoutStatus?: number;
  purchasePaymentStatusCode?: number;
  paymentStatus?: "pending" | "waiting_for_capture" | "succeeded" | "canceled" | "failed";
  paymentStatusSequence?: Array<"pending" | "waiting_for_capture" | "succeeded" | "canceled" | "failed">;
  paymentMessage?: string | null;
};

const previewPartner = {
  id: 7,
  name: "Кофейня",
  category: "food",
  description: "Бонусы за каждую покупку",
  logoUrl: null,
  logoObjectPath: null,
  bonusMultiplier: 1.5,
  address: "Москва",
  city: "Москва",
  isActive: true,
};

async function mockFinanceApi(page: Page, options: FinancePreviewOptions = {}) {
  let paymentStatusCall = 0;

  await page.addInitScript(() => {
    window.localStorage.setItem("ls_token", "finance-preview-token");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.endsWith("/finance/policy")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(policy),
      });
    }

    if (pathname.endsWith("/finance/ledger")) {
      if (options.ledgerStatus) {
        return route.fulfill({
          status: options.ledgerStatus,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Financial ledger requires authentication",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.ledger ?? []),
      });
    }

    if (pathname.endsWith("/finance/quotes/rental")) {
      const body = request.postDataJSON() as { grossAmountRub: number };
      const bonus = Number(
        (body.grossAmountRub * policy.rentalBonusRate).toFixed(2),
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "rental_deal",
          valid: true,
          currency: "RUB",
          policyVersion: policy.version,
          grossAmountRub: body.grossAmountRub,
          landlordFeeRub: Number(
            (body.grossAmountRub * policy.partnerFeeRate).toFixed(2),
          ),
          landlordBonusRub: bonus,
          tenantBonusRub: bonus,
          rates: {
            landlordFeeRate: policy.partnerFeeRate,
            landlordBonusRate: policy.rentalBonusRate,
            tenantBonusRate: policy.rentalBonusRate,
          },
          errors: [],
        }),
      });
    }

    if (
      pathname.endsWith("/finance/rentals/checkout") ||
      pathname.endsWith("/finance/purchases/checkout")
    ) {
      if (options.checkoutStatus) {
        return route.fulfill({
          status: options.checkoutStatus,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Checkout requires authentication",
          }),
        });
      }
      const body = request.postDataJSON() as {
        grossAmountRub: number;
        paymentMethod: "sbp" | "mir_pay";
        partnerId?: number;
      };
      const isRental = pathname.endsWith("/rentals/checkout");
      const dealId = isRental ? 901 : 902;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          deal: {
            id: dealId,
            status: "pending",
            paymentFailureReason: null,
          },
          quote: {},
          checkoutUrl: `https://checkout.example.test/${dealId}`,
          paymentStatus: "pending",
          echoed: body,
        }),
      });
    }

    if (
      pathname.endsWith("/finance/rentals/901/status") ||
      pathname.endsWith("/finance/purchases/902/status")
    ) {
      if (pathname.endsWith("/finance/purchases/902/status") && options.purchasePaymentStatusCode) {
        return route.fulfill({
          status: options.purchasePaymentStatusCode,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Payment status requires authentication",
          }),
        });
      }
      const isRental = pathname.includes("rentals");
      const paymentStatus = options.paymentStatusSequence?.[
        Math.min(paymentStatusCall, (options.paymentStatusSequence?.length ?? 1) - 1)
      ] ?? options.paymentStatus ?? "pending";
      paymentStatusCall += 1;
      const dealStatus = paymentStatus === "succeeded"
        ? "settled"
        : paymentStatus === "canceled"
          ? "cancelled"
          : paymentStatus === "failed"
            ? "payment_failed"
            : "pending";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deal: {
            id: isRental ? 901 : 902,
            kind: isRental ? "rental_deal" : "partner_purchase",
            status: dealStatus,
            grossAmountRub: isRental ? activeLease.monthlyRentRub : 1_500,
            providerCheckoutUrl: `https://checkout.example.test/${isRental ? 901 : 902}`,
            paymentFailureReason: paymentStatus === "failed" ? options.paymentMessage ?? "Провайдер отклонил платёж" : null,
          },
          paymentStatus,
          message: options.paymentMessage ?? null,
        }),
      });
    }

    if (pathname.endsWith("/dashboard/summary")) {
      if (options.summaryStatus) {
        return route.fulfill({
          status: options.summaryStatus,
          contentType: "application/json",
          body: JSON.stringify({ error: "Authentication required" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dashboardSummary),
      });
    }

    if (pathname.endsWith("/transactions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.transactions ?? []),
      });
    }

    if (pathname.endsWith("/leases")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          options.activeLease === undefined
            ? [activeLease]
            : options.activeLease
              ? [options.activeLease]
              : [],
        ),
      });
    }

    if (
      pathname.endsWith("/dashboard/activity") ||
      pathname.endsWith("/offers") ||
      pathname.endsWith("/partners") ||
      pathname.endsWith("/score/history") ||
      pathname.endsWith("/score/disputes")
    ) {
      if (pathname.endsWith("/partners")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([previewPartner]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
}

async function setBrowserAppVisibility(page: Page, visibilityState: "hidden" | "visible") {
  await page.evaluate((nextVisibilityState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: nextVisibilityState,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: nextVisibilityState === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visibilityState);
}

test.describe("mobile financial preview", () => {
  test("shows the server policy cap and the 10% + 10% rental quote", async ({
    page,
  }) => {
    await mockFinanceApi(page);

    await page.goto("rules");
    await expect(page.getByText(/15\s?%\s+максимум/)).toBeVisible();
    await expect(
      page.getByText(/максимум списания — 15[\s\u00a0]?000[\s\u00a0]?₽/),
    ).toBeVisible();
    await expect(page.getByText(/10\s?%\s+\+\s+10\s?%/)).toBeVisible();

    await page.goto(".");
    await expect(page.getByText("Оплатить сейчас")).toBeVisible();
    await expect(page.getByText("+10 000 ₽ бонуса арендатору")).toBeVisible();
    await expect(
      page.getByText("Арендодатель получает ещё 10 000 ₽"),
    ).toBeVisible();
  });

  test("shows monetary signs and marks legacy operations as unconfirmed", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      ledger: [settledCredit, settledDebit],
      transactions: [legacyTransaction],
    });

    await page.goto("history");
    await expect(
      page.getByText(/^\+1[\s\u00a0]?000[\s\u00a0]?₽$/),
    ).toBeVisible();
    await expect(page.getByText(/^-500[\s\u00a0]?₽$/)).toBeVisible();
    await expect(
      page.getByText("Старое списание — без подтверждения"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Legacy-запись · операция не подтверждена финансовым settlement",
      ),
    ).toBeVisible();
  });

  test("filters confirmed ledger rows without leaking legacy operations", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      ledger: [settledCredit, settledDebit, settledOther],
      transactions: [linkedConfirmedTransaction, legacyTransaction],
    });

    await page.goto("history");
    await expect(page.getByText("Арендная сделка")).toBeVisible();
    await expect(page.getByText("Покупка у партнёра")).toBeVisible();
    await expect(page.getByText("Финансовое событие")).toBeVisible();
    await expect(page.getByText("Старое списание — без подтверждения")).toBeVisible();

    await page.getByText("Аренда", { exact: true }).click();
    await expect(page.getByText("Арендная сделка")).toBeVisible();
    await expect(page.getByText("Покупка у партнёра")).toHaveCount(0);
    await expect(page.getByText("Финансовое событие")).toHaveCount(0);
    await expect(page.getByText("Старое списание — без подтверждения")).toHaveCount(0);
    await expect(page.getByText("Подтверждено", { exact: true })).toBeVisible();

    await page.getByText("Прочее", { exact: true }).click();
    await expect(page.getByText("Покупка у партнёра")).toHaveCount(0);
    await expect(page.getByText("Финансовое событие")).toBeVisible();
    await expect(page.getByText("Арендная сделка")).toHaveCount(0);
    await expect(page.getByText("Старое списание — без подтверждения")).toHaveCount(0);
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(1);

    await page.getByText("Еда", { exact: true }).click();
    await expect(page.getByText("Покупка у партнёра")).toBeVisible();
    await expect(page.getByText("Старое списание — без подтверждения")).toBeVisible();
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Арендная сделка")).toHaveCount(0);
    await expect(page.getByText("Финансовое событие")).toHaveCount(0);
  });

  test("keeps refunded and pending ledger states explicit in their financial categories", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      ledger: [settledCredit, settledDebit, refundedPurchase, pendingRental],
      transactions: [legacyTransaction],
    });

    await page.goto("history");
     await expect(page.getByText("Возврат бонуса")).toBeVisible();
     await expect(page.getByText("Возврат", { exact: true })).toBeVisible();
    await expect(page.getByText("Ожидает оплаты", { exact: true })).toBeVisible();
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Legacy-запись · операция не подтверждена финансовым settlement")).toBeVisible();

    await page.getByText("Аренда", { exact: true }).click();
    await expect(page.getByText("Ожидает оплаты", { exact: true })).toBeVisible();
    await expect(page.getByText("Возврат бонуса")).toHaveCount(0);
    await expect(page.getByText("Возврат", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Legacy-запись · операция не подтверждена финансовым settlement")).toHaveCount(0);

    await page.getByText("Прочее", { exact: true }).click();
    await expect(page.getByText("Возврат бонуса")).toHaveCount(0);
    await expect(page.getByText("Возврат", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ожидает оплаты", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Legacy-запись · операция не подтверждена финансовым settlement")).toHaveCount(0);

    await page.getByText("Еда", { exact: true }).click();
     await expect(page.getByText("Возврат бонуса")).toBeVisible();
     await expect(page.getByText("Возврат", { exact: true })).toBeVisible();
    await expect(page.getByText("Ожидает оплаты", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Подтверждено", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Legacy-запись · операция не подтверждена финансовым settlement")).toBeVisible();
  });

  test("returns to login when the personal balance request expires", async ({
    page,
  }) => {
    await mockFinanceApi(page, { summaryStatus: 401 });

    await page.goto(".");
    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();
  });

  test("returns to login when the financial ledger request expires", async ({
    page,
  }) => {
    await mockFinanceApi(page, { ledgerStatus: 401 });

    await page.goto("history");
    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();
  });

  test("renders an explicit empty history state for an empty server response", async ({
    page,
  }) => {
    await mockFinanceApi(page, { ledger: [], transactions: [] });

    await page.goto("history");
    await expect(page.getByText("Операций нет")).toBeVisible();
    await expect(
      page.getByText("Здесь появятся начисления, списания и возвраты"),
    ).toBeVisible();
  });

  test("shows a retry state for a temporary Live Score error", async ({ page }) => {
    let scoreCalls = 0;
    await page.addInitScript(() => {
      window.localStorage.setItem("ls_token", "score-preview-token");
    });
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/score") && !pathname.endsWith("/score/history")) {
        scoreCalls += 1;
        if (scoreCalls <= 4) {
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Score unavailable" }) });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            score: 812,
            baseScore: 500,
            categoryScore: 312,
            scoreVersion: "fixture-score-v1",
            tier: "high",
            tierLabel: "Высокий",
            components: [],
            activeLease: null,
            isPhoneVerified: true,
            isIdentityVerified: false,
            isIncomeVerified: false,
            verificationLevel: 1,
            totalLeases: 0,
            activeLeases: 0,
          }),
        });
      }
      if (pathname.endsWith("/score/history")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (pathname.endsWith("/users/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: 1, name: "Score user", phone: "+7 900 000-00-00", liveScore: 812, status: "gold" }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("score");
    await expect(page.getByText("Live Score временно недоступен")).toBeVisible();
    await page.getByTestId("score-retry").click();
    await expect(page.getByText("Live Score", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("score-history-empty")).toBeVisible();
  });

  test("rejects malformed payment route parameters instead of applying defaults", async ({ page }) => {
    await mockFinanceApi(page);

    await page.goto("payment?mode=unknown");
    await expect(page.getByTestId("payment-params-error")).toContainText("Некорректный режим оплаты");

    await page.goto("payment?mode=partner&partnerId=NaN");
    await expect(page.getByTestId("payment-params-error")).toContainText("Некорректный идентификатор партнёра");

    await page.goto("payment?mode=rental&paymentId=not-a-number");
    await expect(page.getByTestId("payment-params-error")).toContainText("Некорректный идентификатор платежа");
  });

  test("starts payment without reporting a successful settlement before provider confirmation", async ({
    page,
  }) => {
    const settlementRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /settle|payment/i.test(request.url())
      ) {
        settlementRequests.push(request.url());
      }
    });
    await mockFinanceApi(page);

    await page.goto(".");
    await expect(page.getByText("Оплатить сейчас")).toBeVisible();

    await page.getByText("Оплатить сейчас").click();

    expect(settlementRequests).toEqual([]);
    await expect(page.getByText("Оплата аренды")).toBeVisible();
    await expect(page.getByText("Перейти к оплате")).toBeVisible();
    await expect(page.getByText("Подтверждено")).toHaveCount(0);
    await expect(page.getByText("Платёж выполнен")).toHaveCount(0);
  });

  test("opens rental checkout with the selected payment method and keeps the card above the tab bar", async ({
    page,
  }) => {
    await mockFinanceApi(page);
    await page.goto("payment?mode=rental");

    await expect(page.getByText("Оплата аренды")).toBeVisible();
    await expect(page.getByTestId("payment-method-sbp")).toBeVisible();
    await expect(page.getByTestId("payment-method-mir-pay")).toBeVisible();
    await page.getByTestId("payment-method-mir-pay").click();
    await page.getByTestId("payment-amount").fill("100000");

    const checkoutRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/finance/rentals/checkout"),
    );
    await page.getByTestId("open-provider-checkout").click();
    const requestBody = (await checkoutRequest).postDataJSON();
    expect(requestBody).toMatchObject({
      leaseId: activeLease.id,
      grossAmountRub: 100000,
      paymentMethod: "mir_pay",
    });
  });

  test("returns to login when checkout expires while the payment screen is open", async ({
    page,
  }) => {
    const apiRequests: Array<{ url: string; authorization: string | undefined }> = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        apiRequests.push({
          url: request.url(),
          authorization: request.headers().authorization,
        });
      }
    });
    await mockFinanceApi(page, { checkoutStatus: 401 });
    await page.goto("payment?mode=rental");

    await expect(page.getByText("Оплата аренды")).toBeVisible();
    await expect(page.getByTestId("open-provider-checkout")).toHaveText("Перейти к оплате");

    const checkoutResponse = page.waitForResponse(
      (response) =>
        response.status() === 401 &&
        response.request().method() === "POST" &&
        response.url().endsWith("/finance/rentals/checkout"),
    );
    await page.getByTestId("open-provider-checkout").click();
    await checkoutResponse;

    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();

    const checkoutRequestIndex = apiRequests.findIndex(
      ({ url }) => url.endsWith("/finance/rentals/checkout"),
    );
    expect(checkoutRequestIndex).toBeGreaterThanOrEqual(0);
    expect(apiRequests[checkoutRequestIndex]?.authorization).toBe(
      "Bearer finance-preview-token",
    );
    expect(
      apiRequests
        .slice(checkoutRequestIndex + 1)
        .map(({ authorization }) => authorization),
    ).not.toContain("Bearer finance-preview-token");
  });

  test("opens partner checkout with SBP and the chosen partner and amount", async ({
    page,
  }) => {
    await mockFinanceApi(page);
    await page.goto("payment?mode=partner");

    await expect(page.getByText("Покупка у партнёра")).toBeVisible();
    await page.getByTestId(`payment-partner-${previewPartner.id}`).click();
    await page.getByTestId("payment-amount").fill("1500");
    await page.getByTestId("payment-method-sbp").click();

    const checkoutRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/finance/purchases/checkout"),
    );
    await page.getByTestId("open-provider-checkout").click();
    const requestBody = (await checkoutRequest).postDataJSON();
    expect(requestBody).toMatchObject({
      partnerId: previewPartner.id,
      grossAmountRub: 1500,
      paymentMethod: "sbp",
    });
  });

  test("returns to login when partner checkout expires while the payment screen is open", async ({
    page,
  }) => {
    const apiRequests: Array<{ url: string; authorization: string | undefined }> = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        apiRequests.push({
          url: request.url(),
          authorization: request.headers().authorization,
        });
      }
    });
    await mockFinanceApi(page, { checkoutStatus: 401 });
    await page.goto("payment?mode=partner");

    await expect(page.getByText("Покупка у партнёра")).toBeVisible();
    await page.getByTestId(`payment-partner-${previewPartner.id}`).click();
    await page.getByTestId("payment-amount").fill("1500");

    const checkoutResponse = page.waitForResponse(
      (response) =>
        response.status() === 401 &&
        response.request().method() === "POST" &&
        response.url().endsWith("/finance/purchases/checkout"),
    );
    await page.getByTestId("open-provider-checkout").click();
    await checkoutResponse;

    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();

    const checkoutRequestIndex = apiRequests.findIndex(
      ({ url }) => url.endsWith("/finance/purchases/checkout"),
    );
    expect(checkoutRequestIndex).toBeGreaterThanOrEqual(0);
    expect(apiRequests[checkoutRequestIndex]?.authorization).toBe(
      "Bearer finance-preview-token",
    );
    expect(
      apiRequests
        .slice(checkoutRequestIndex + 1)
        .map(({ authorization }) => authorization),
    ).not.toContain("Bearer finance-preview-token");
  });

  test("refreshes the matching rental status after returning from hosted checkout", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      paymentStatusSequence: ["pending", "succeeded"],
    });

    await page.goto("payment?mode=rental");
    await expect(page.getByTestId("open-provider-checkout")).toBeVisible();
    await page.getByTestId("open-provider-checkout").click();

    await expect(page.getByTestId("payment-status-succeeded")).toBeVisible();
    await expect(page.getByText("100 000 ₽ · Арендная сделка")).toBeVisible();
    await expect(page.getByText("Оплата подтверждена")).toBeVisible();
  });

  test("returns to login when partner payment status expires after hosted checkout", async ({
    page,
  }) => {
    const statusRequests: Array<{ url: string; authorization: string | undefined }> = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET"
        && request.url().includes("/finance/")
        && request.url().endsWith("/status")
      ) {
        statusRequests.push({
          url: request.url(),
          authorization: request.headers().authorization,
        });
      }
    });
    await mockFinanceApi(page, { purchasePaymentStatusCode: 401 });

    await page.goto("payment?mode=partner");
    await expect(page.getByText("Покупка у партнёра")).toBeVisible();
    await page.getByTestId(`payment-partner-${previewPartner.id}`).click();
    await page.getByTestId("payment-amount").fill("1500");

    const statusResponse = page.waitForResponse(
      (response) =>
        response.status() === 401
        && response.request().method() === "GET"
        && response.url().endsWith("/finance/purchases/902/status"),
    );
    await page.getByTestId("open-provider-checkout").click();
    await statusResponse;

    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();

    expect(statusRequests).toHaveLength(1);
    expect(statusRequests[0]?.url).toContain("/finance/purchases/902/status");
    expect(statusRequests[0]?.authorization).toBe("Bearer finance-preview-token");

    await page.waitForTimeout(250);
    expect(statusRequests).toHaveLength(1);
  });

  test("pauses pending payment polling in the background and refreshes once on foreground", async ({
    page,
  }) => {
    const statusRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET"
        && /\/finance\/rentals\/901\/status$/.test(new URL(request.url()).pathname)
      ) {
        statusRequests.push(request.url());
      }
    });
    await mockFinanceApi(page, {
      paymentStatus: "pending",
      paymentStatusSequence: ["pending", "pending"],
    });

    await page.goto("payment?mode=rental&paymentId=901");
    await expect(page.getByTestId("payment-status-pending")).toBeVisible();
    await expect.poll(() => statusRequests.length).toBe(1);

    await setBrowserAppVisibility(page, "hidden");
    await page.waitForTimeout(3_000);
    expect(statusRequests).toHaveLength(1);

    await setBrowserAppVisibility(page, "visible");
    await expect.poll(() => statusRequests.length).toBe(2);
    await page.waitForTimeout(500);
    expect(statusRequests).toHaveLength(2);

    await expect.poll(
      () => statusRequests.length,
      { timeout: 4_000 },
    ).toBeGreaterThan(2);
  });

  test("shows a confirmed partner payment after reopening the result screen", async ({
    page,
  }) => {
    await mockFinanceApi(page, { paymentStatus: "succeeded" });

    await page.goto("payment?mode=partner&partnerId=7&paymentId=902");
    await expect(page.getByTestId("payment-status-succeeded")).toBeVisible();
    await expect(page.getByText("1 500 ₽ · Покупка у партнёра")).toBeVisible();
    await expect(page.getByText("Оплата подтверждена")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("payment-status-succeeded")).toBeVisible();
    await expect(page.getByText("1 500 ₽ · Покупка у партнёра")).toBeVisible();
  });

  test("gives canceled payments a clear retry action", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      paymentStatus: "canceled",
      paymentMessage: "Платёж отменён в банке",
    });

    await page.goto("payment?mode=partner&partnerId=7&paymentId=902");
    await expect(page.getByTestId("payment-status-canceled")).toBeVisible();
    await expect(page.getByText("Оплата отменена")).toBeVisible();
    await expect(page.getByText("Попробовать снова")).toBeVisible();

    await page.getByTestId("payment-status-action").click();
    await expect(page.getByTestId("payment-status-canceled")).toHaveCount(0);
    await expect(page.getByTestId("open-provider-checkout")).toHaveText("Перейти к оплате");
  });

  test("shows provider failures with a clear retry action", async ({ page }) => {
    await mockFinanceApi(page, {
      paymentStatus: "failed",
      paymentMessage: "Провайдер отклонил оплату",
    });

    await page.goto("payment?mode=partner&partnerId=7&paymentId=902");
    await expect(page.getByTestId("payment-status-failed")).toBeVisible();
    await expect(page.getByText("Провайдер отклонил оплату")).toBeVisible();
    await expect(page.getByText("Начать новую оплату")).toBeVisible();
  });

  test("keeps pending payments actionable while the provider processes them", async ({
    page,
  }) => {
    await mockFinanceApi(page, {
      paymentStatus: "waiting_for_capture",
    });

    await page.goto("payment?mode=rental&paymentId=901");
    await expect(page.getByTestId("payment-status-waiting_for_capture")).toBeVisible();
    await expect(page.getByText("Платёж обрабатывается")).toBeVisible();
    await expect(page.getByText("Проверить ещё раз")).toBeVisible();
    await expect(page.getByText("Открыть оплату снова")).toBeVisible();
  });

  for (const terminalStatus of ["succeeded", "canceled", "failed"] as const) {
    test(`does not poll repeatedly after a ${terminalStatus} payment result`, async ({
      page,
    }) => {
      const statusRequests: string[] = [];
      page.on("request", (request) => {
        if (
          request.method() === "GET"
          && /\/finance\/purchases\/902\/status$/.test(new URL(request.url()).pathname)
        ) {
          statusRequests.push(request.url());
        }
      });
      await mockFinanceApi(page, { paymentStatus: terminalStatus });

      await page.goto("payment?mode=partner&partnerId=7&paymentId=902");
      await expect(page.getByTestId(`payment-status-${terminalStatus}`)).toBeVisible();
      await expect.poll(() => statusRequests.length).toBe(1);
      await page.waitForTimeout(3_000);

      expect(statusRequests).toHaveLength(1);
    });
  }
});
