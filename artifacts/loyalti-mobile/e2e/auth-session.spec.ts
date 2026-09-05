import { expect, test, type Page } from "@playwright/test";

const phone = "+7 900 555-12-34";
const sessionToken = "mobile-session-token";
const expiredToken = "expired-session-token";

const summary = {
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

const score = {
  score: 812,
  baseScore: 500,
  categoryScore: 312,
  scoreVersion: "fixture-score-v1",
  tier: "high",
  tierLabel: "Высокий",
  components: [],
  activeLease: null,
  isPhoneVerified: true,
  isIdentityVerified: true,
  isIncomeVerified: false,
  verificationLevel: 2,
  totalLeases: 1,
  activeLeases: 0,
};

const rentalQuote = {
  kind: "rental_deal",
  valid: true,
  currency: "RUB",
  policyVersion: 7,
  grossAmountRub: 100_000,
  landlordFeeRub: 1_500,
  landlordBonusRub: 10_000,
  tenantBonusRub: 10_000,
  rates: {
    landlordFeeRate: 0.015,
    landlordBonusRate: 0.1,
    tenantBonusRate: 0.1,
  },
  errors: [],
};

const user = {
  id: 1,
  phone,
  name: "Тестовый пользователь",
  email: null,
  status: "gold",
  liveScore: 812,
};

type ProtectedRequest = {
  pathname: string;
  authorization: string | undefined;
};

type AuthMockOptions = {
  expired?: boolean;
  profile?: typeof user | null;
};

async function mockAuthApi(page: Page, options: AuthMockOptions = {}) {
  const protectedRequests: ProtectedRequest[] = [];
  let passportShare: {
    id: number;
    token: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    lastAccessedAt: string | null;
    status: "active" | "revoked";
  } | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const authorization = request.headers().authorization;

    const isProtectedRequest =
      pathname.endsWith("/dashboard/summary") ||
      pathname.endsWith("/dashboard/activity") ||
      pathname.endsWith("/offers") ||
      pathname.endsWith("/partners") ||
      pathname.endsWith("/leases") ||
      pathname.endsWith("/me") ||
      pathname.endsWith("/transactions") ||
      pathname.endsWith("/finance/ledger") ||
      pathname.endsWith("/finance/quotes/rental") ||
      pathname.endsWith("/score") ||
      pathname.endsWith("/score/history") ||
      pathname.endsWith("/score/timeline") ||
      pathname.endsWith("/score/disputes") ||
      pathname.endsWith("/passport/shares");

    if (isProtectedRequest) {
      protectedRequests.push({ pathname, authorization });
      if (options.expired) {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Session expired" }),
        });
      }
    }

    if (pathname.endsWith("/auth/request-otp") && request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          maskedPhone: "+7•••12-34",
          expiresIn: 600,
          devCode: "2468",
        }),
      });
    }

    if (pathname.endsWith("/auth/verify-otp") && request.method() === "POST") {
      const body = request.postDataJSON() as { phone?: string; code?: string };
      if (body.code !== "2468") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Неверный код", attemptsLeft: 2 }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: sessionToken,
          userId: 1,
          name: user.name,
          phone,
          isAdmin: false,
        }),
      });
    }

    if (pathname.endsWith("/auth/logout") && request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }

    if (pathname.endsWith("/dashboard/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(summary),
      });
    }

    if (pathname.endsWith("/dashboard/activity")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    if (pathname.endsWith("/offers") || pathname.endsWith("/partners")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    if (pathname.endsWith("/leases")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([activeLease]),
      });
    }

    if (pathname.endsWith("/finance/quotes/rental")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rentalQuote),
      });
    }

    if (pathname.endsWith("/score") && !pathname.endsWith("/score/history")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(score),
      });
    }

    if (pathname.endsWith("/score/history") || pathname.endsWith("/score/timeline")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    if (pathname.endsWith("/score/disputes")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    if (pathname.endsWith("/passport/shares") && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(passportShare ? [passportShare] : []),
      });
    }

    if (pathname.endsWith("/passport/shares") && request.method() === "POST") {
      passportShare = {
        id: 701,
        token: "mobilePassportToken_AaBbCcDdEeFf00112233445566778899",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
        lastAccessedAt: null,
        status: "active",
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(passportShare),
      });
    }

    if (/\/passport\/shares\/\d+\/revoke$/.test(pathname) && request.method() === "POST") {
      if (passportShare) {
        passportShare = { ...passportShare, revokedAt: new Date().toISOString(), status: "revoked" };
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(passportShare),
      });
    }

    if (pathname.endsWith("/transactions") || pathname.endsWith("/finance/ledger")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    if (pathname.endsWith("/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.profile === undefined ? user : options.profile),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  return protectedRequests;
}

function protectedRequestPaths(requests: ProtectedRequest[]) {
  return requests.map(({ pathname }) => pathname);
}

test.describe("mobile auth session", () => {
  test("logs in with OTP, restores the session, authorizes data requests, and logs out", async ({
    page,
  }) => {
    const protectedRequests = await mockAuthApi(page);

    await page.goto(".");
    await page.getByTestId("auth-phone-input").fill(phone);
    await page.getByTestId("auth-request-otp").click();
    await expect(page.getByTestId("auth-code-input")).toBeVisible();
    await expect(page.getByText("Код для preview: 2468")).toBeVisible();

    await page.getByTestId("auth-code-input").fill("2468");
    await page.getByTestId("auth-verify-otp").click();
    await expect(page.getByText("Мой баланс")).toBeVisible();
    await expect(page.getByText("+10 000 ₽ бонуса арендатору")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBe(sessionToken);

    await expect
      .poll(() =>
        protectedRequestPaths(protectedRequests).some((path) =>
          path.endsWith("/dashboard/summary"),
        ),
      )
      .toBe(true);

    const initialProtectedCount = protectedRequests.length;
    await page.reload();
    await expect(page.getByText("Мой баланс")).toBeVisible();
    await expect(page.getByText("+10 000 ₽ бонуса арендатору")).toBeVisible();

    await page.goto("history");
    await expect(page.getByText("История", { exact: true }).last()).toBeVisible();
    await expect
      .poll(() =>
        protectedRequestPaths(protectedRequests.slice(initialProtectedCount)),
      )
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining("/dashboard/summary"),
          expect.stringContaining("/finance/quotes/rental"),
          expect.stringContaining("/finance/ledger"),
        ]),
      );

    const restoredRequests = protectedRequests.slice(initialProtectedCount);
    expect(restoredRequests).toHaveLength(
      restoredRequests.filter((request) => request.authorization === `Bearer ${sessionToken}`)
        .length,
    );
    expect(restoredRequests.map((request) => request.authorization)).not.toContain(undefined);

    await page.goto("profile");
    await expect(page.getByText("Профиль", { exact: true }).last()).toBeVisible();
    await page.getByTestId("logout-button").click();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();
    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
  });

  test("keeps the OTP step and does not persist a token when the code is wrong", async ({
    page,
  }) => {
    await mockAuthApi(page);

    await page.goto(".");
    await page.getByTestId("auth-phone-input").fill(phone);
    await page.getByTestId("auth-request-otp").click();
    await page.getByTestId("auth-code-input").fill("0000");
    await page.getByTestId("auth-verify-otp").click();

    await expect(page.getByText("Неверный код")).toBeVisible();
    await expect(page.getByTestId("auth-code-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();
  });

  test("clears an expired restored session and returns to login", async ({
    page,
  }) => {
    await page.addInitScript((token) => {
      window.localStorage.setItem("ls_token", token);
    }, expiredToken);
    const protectedRequests = await mockAuthApi(page, { expired: true });

    await page.goto(".");
    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBeNull();

    await page.goto("history");
    await expect(page.getByTestId("auth-phone-input")).toBeVisible();
    expect(protectedRequests.length).toBeGreaterThan(0);
    expect(
      protectedRequests.every(
        ({ authorization }) => authorization === `Bearer ${expiredToken}`,
      ),
    ).toBe(true);

    const requestCountAfterSignOut = protectedRequests.length;
    await page.waitForTimeout(250);
    expect(protectedRequests).toHaveLength(requestCountAfterSignOut);
  });

  test("does not show demo identity when the profile has no data", async ({ page }) => {
    await mockAuthApi(page, {
      profile: {
        ...user,
        name: "",
        phone: "",
      },
    });

    await page.goto(".");
    await page.getByTestId("auth-phone-input").fill(phone);
    await page.getByTestId("auth-request-otp").click();
    await page.getByTestId("auth-code-input").fill("2468");
    await page.getByTestId("auth-verify-otp").click();
    await expect(page.getByText("Мой баланс")).toBeVisible();
    await page.goto("profile");
    await expect(page.getByText("Профиль", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Алексей П.")).toHaveCount(0);
    await expect(page.getByText("+7 903 123-45-67")).toHaveCount(0);
  });

  test("creates and revokes a token-based Live Passport link", async ({ page }) => {
    await page.addInitScript((token) => {
      window.localStorage.setItem("ls_token", token);
    }, sessionToken);
    await mockAuthApi(page);

    await page.goto("score");
    await expect(page.getByText("Live Score", { exact: true }).first()).toBeVisible();
    await page.getByTestId("score-share").click();
    await expect(page.getByText("Срок действия ссылки")).toBeVisible();
    await page.getByText("7 дней", { exact: true }).click();
    await expect(page.getByText(/Активна · до/)).toBeVisible();
    await expect(page.getByText("Отозвать", { exact: true })).toBeVisible();
    await page.getByText("Отозвать", { exact: true }).click();
    await expect(page.getByText(/Отозвана · до/)).toBeVisible();
  });

  test("shows a safe state for a malformed public passport link", async ({ page }) => {
    await page.goto("passport/not-a-token");
    await expect(page.getByText("Паспорт недоступен")).toBeVisible();
  });
});