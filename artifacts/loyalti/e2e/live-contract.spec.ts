/**
 * Live contract check.
 *
 * Unlike web-smoke.spec.ts (which uses stable browser fixtures), this suite
 * runs REAL API responses through the app and validates them against the
 * OpenAPI contract (via the zod schemas generated in @workspace/api-zod).
 *
 * Two layers:
 *  1. Direct endpoint checks — every dashboard / profile / score endpoint is
 *     fetched from the live API and validated against its response schema.
 *  2. Page checks — the dashboard, profile, and score pages are loaded with
 *     live API data proxied into the browser; every intercepted response is
 *     validated, and rendering must succeed without browser errors.
 *
 * A failure always names the page and the endpoint whose contract broke.
 *
 * Run with: pnpm --filter @workspace/loyalti run test:contract
 * (starts the API + web servers automatically, or set LIVE_API_URL /
 * LIVE_WEB_URL to target a configured environment).
 */
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { ZodType } from "zod";
import {
  GetDashboardSummaryResponse,
  GetDashboardActivityResponse,
  GetMeResponse,
  ListLeasesResponse,
  GetScoreResponse,
  GetScoreHistoryResponse,
  GetScoreTimelineResponse,
  ListTransactionsResponse,
  ListOffersResponse,
  ListPartnersResponse,
  CalculateBonusResponse,
  GetEconomicsResponse,
  GetFinancialPolicyResponse,
  QuotePartnerPurchaseResponse,
  QuoteRentalDealResponse,
  ListFinancialLedgerResponse,
  ListBalanceReconciliationResponse,
  GetBalanceReconciliationResponse,
  GetPartnerResponse,
  GetOfferResponse,
  GetTransactionResponse,
} from "@workspace/api-zod";
import { LIVE_API_PORT } from "../playwright.live.config";

const apiBase = (process.env.LIVE_API_URL ?? `http://127.0.0.1:${LIVE_API_PORT}`).replace(/\/+$/, "");
let liveToken = "";

function createFixtureToken(userId: number, isAdmin: boolean): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    userId,
    isAdmin,
    sid: `live-contract-${userId}-${isAdmin ? "admin" : "user"}`,
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const signature = createHmac("sha256", "live-contract-test-secret")
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

test.beforeAll(() => {
  liveToken = createFixtureToken(1, true);
});

interface Contract {
  page: string;
  path: string;
  schema: ZodType;
}

const contracts: Contract[] = [
  { page: "dashboard", path: "/api/dashboard/summary", schema: GetDashboardSummaryResponse },
  { page: "dashboard", path: "/api/dashboard/activity", schema: GetDashboardActivityResponse },
  { page: "profile", path: "/api/users/me", schema: GetMeResponse },
  { page: "profile", path: "/api/leases", schema: ListLeasesResponse },
  { page: "score", path: "/api/score", schema: GetScoreResponse },
  { page: "score", path: "/api/score/history", schema: GetScoreHistoryResponse },
  { page: "score", path: "/api/score/timeline", schema: GetScoreTimelineResponse },
  { page: "wallet", path: "/api/transactions", schema: ListTransactionsResponse },
  { page: "partners", path: "/api/partners", schema: ListPartnersResponse },
  { page: "offers", path: "/api/offers", schema: ListOffersResponse },
  { page: "calculator", path: "/api/finance/policy", schema: GetFinancialPolicyResponse },
  { page: "wallet", path: "/api/finance/ledger", schema: ListFinancialLedgerResponse },
];

const demoLogoFiles = [
  "pik-arenda.svg",
  "mosenergosbyt.svg",
  "sitimobil.svg",
  "apteka-36-6.svg",
  "vkusvill.svg",
  "perekrestok.svg",
  "domclick-servisy.svg",
  "gorodskie-bani.svg",
  "metropoliten.svg",
  "remontpro.svg",
  "domovoi.svg",
  "yandex-go.svg",
  "zdravsiti.svg",
];

function formatIssues(result: ReturnType<ZodType["safeParse"]>): string {
  if (result.success) return "";
  return result.error.issues
    .map((i) => `  - ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Layer 1 — direct endpoint contract checks against the live API
// ---------------------------------------------------------------------------
test.describe("live API contract", () => {
  for (const contract of contracts) {
    test(`GET ${contract.path} (${contract.page} page) matches the OpenAPI contract`, async ({ request }) => {
      const response = await request.get(`${apiBase}${contract.path}`, {
        headers: { Authorization: `Bearer ${liveToken}` },
      });
      expect(
        response.ok(),
        `[${contract.page} page] GET ${contract.path} returned HTTP ${response.status()}`,
      ).toBe(true);

      const body = await response.json();
      const parsed = contract.schema.safeParse(body);
      expect(
        parsed.success,
        `[${contract.page} page] GET ${contract.path} no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
      ).toBe(true);
    });
  }

  test("POST /api/bonus/calculate (calculator page) matches the OpenAPI contract", async ({ request }) => {
    const response = await request.post(`${apiBase}/api/bonus/calculate`, {
      headers: { Authorization: `Bearer ${liveToken}` },
      data: {
        amountRub: 1_000,
        category: "rent",
        userStatus: "silver",
        promoMultiplier: 1.5,
      },
    });
    expect(
      response.ok(),
      `[calculator page] POST /api/bonus/calculate returned HTTP ${response.status()}`,
    ).toBe(true);

    const parsed = CalculateBonusResponse.safeParse(await response.json());
    expect(
      parsed.success,
      `[calculator page] POST /api/bonus/calculate no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
  });

  for (const logoFile of demoLogoFiles) {
    test(`GET /api/partner-logos/${logoFile} serves a demo asset`, async ({ request }) => {
      const response = await request.get(`${apiBase}/api/partner-logos/${logoFile}`);
      expect(response.ok(), `${logoFile} returned HTTP ${response.status()}`).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/svg+xml");
      expect(await response.text()).toContain("<svg");
    });
  }

  test("regular users cannot access admin economics", async ({ request }) => {
    const response = await request.get(`${apiBase}/api/admin/economics`);
    expect(response.status()).toBe(401);
  });

  test("admin economics matches the OpenAPI contract", async ({ request }) => {
    const response = await request.get(`${apiBase}/api/admin/economics?from=2026-01-01&to=2026-12-31&period=custom`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(response.ok(), `GET /api/admin/economics returned HTTP ${response.status()}`).toBe(true);
    const parsed = GetEconomicsResponse.safeParse(await response.json());
    expect(parsed.success, `GET /api/admin/economics contract failed: ${formatIssues(parsed)}`).toBe(true);
  });

  test("financial quote endpoints match the OpenAPI contract", async ({ request }) => {
    const purchaseResponse = await request.post(`${apiBase}/api/finance/quotes/purchase`, {
      headers: { Authorization: `Bearer ${liveToken}` },
      data: { grossAmountRub: 1_000 },
    });
    expect(purchaseResponse.ok(), `POST /api/finance/quotes/purchase returned HTTP ${purchaseResponse.status()}`).toBe(true);
    const purchase = QuotePartnerPurchaseResponse.safeParse(await purchaseResponse.json());
    expect(purchase.success, `Purchase quote contract failed: ${formatIssues(purchase)}`).toBe(true);

    const rentalResponse = await request.post(`${apiBase}/api/finance/quotes/rental`, {
      headers: { Authorization: `Bearer ${liveToken}` },
      data: { grossAmountRub: 100_000 },
    });
    expect(rentalResponse.ok(), `POST /api/finance/quotes/rental returned HTTP ${rentalResponse.status()}`).toBe(true);
    const rental = QuoteRentalDealResponse.safeParse(await rentalResponse.json());
    expect(rental.success, `Rental quote contract failed: ${formatIssues(rental)}`).toBe(true);
  });

  test("GET /api/partners/{id} (partners page) matches the OpenAPI contract", async ({ request }) => {
    const listPath = "/api/partners";
    const listResponse = await request.get(`${apiBase}${listPath}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(
      listResponse.ok(),
      `[partners page] GET ${listPath} returned HTTP ${listResponse.status()}`,
    ).toBe(true);
    const listParsed = ListPartnersResponse.safeParse(await listResponse.json());
    expect(
      listParsed.success,
      `[partners page] GET ${listPath} no longer matches the OpenAPI contract:\n${formatIssues(listParsed)}`,
    ).toBe(true);
    expect(
      listParsed.success && listParsed.data.length > 0,
      `[partners page] GET ${listPath} returned no seeded records for the detail check`,
    ).toBe(true);
    if (!listParsed.success || !listParsed.data[0]) return;

    const path = `/api/partners/${listParsed.data[0].id}`;
    const response = await request.get(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(response.ok(), `[partners page] GET ${path} returned HTTP ${response.status()}`).toBe(true);
    const parsed = GetPartnerResponse.safeParse(await response.json());
    expect(
      parsed.success,
      `[partners page] GET ${path} no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
  });

  test("GET /api/offers/{id} (offers page) matches the OpenAPI contract", async ({ request }) => {
    const listPath = "/api/offers";
    const listResponse = await request.get(`${apiBase}${listPath}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(
      listResponse.ok(),
      `[offers page] GET ${listPath} returned HTTP ${listResponse.status()}`,
    ).toBe(true);
    const listParsed = ListOffersResponse.safeParse(await listResponse.json());
    expect(
      listParsed.success,
      `[offers page] GET ${listPath} no longer matches the OpenAPI contract:\n${formatIssues(listParsed)}`,
    ).toBe(true);
    expect(
      listParsed.success && listParsed.data.length > 0,
      `[offers page] GET ${listPath} returned no seeded records for the detail check`,
    ).toBe(true);
    if (!listParsed.success || !listParsed.data[0]) return;

    const path = `/api/offers/${listParsed.data[0].id}`;
    const response = await request.get(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(response.ok(), `[offers page] GET ${path} returned HTTP ${response.status()}`).toBe(true);
    const parsed = GetOfferResponse.safeParse(await response.json());
    expect(
      parsed.success,
      `[offers page] GET ${path} no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
  });

  test("GET /api/transactions/{id} (wallet page) matches the OpenAPI contract", async ({ request }) => {
    const listPath = "/api/transactions";
    const listResponse = await request.get(`${apiBase}${listPath}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(
      listResponse.ok(),
      `[wallet page] GET ${listPath} returned HTTP ${listResponse.status()}`,
    ).toBe(true);
    const listParsed = ListTransactionsResponse.safeParse(await listResponse.json());
    expect(
      listParsed.success,
      `[wallet page] GET ${listPath} no longer matches the OpenAPI contract:\n${formatIssues(listParsed)}`,
    ).toBe(true);
    expect(
      listParsed.success && listParsed.data.length > 0,
      `[wallet page] GET ${listPath} returned no seeded records for the detail check`,
    ).toBe(true);
    if (!listParsed.success || !listParsed.data[0]) return;

    const path = `/api/transactions/${listParsed.data[0].id}`;
    const response = await request.get(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(response.ok(), `[wallet page] GET ${path} returned HTTP ${response.status()}`).toBe(true);
    const parsed = GetTransactionResponse.safeParse(await response.json());
    expect(
      parsed.success,
      `[wallet page] GET ${path} no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
  });

  test("transaction details stay scoped to the authorized owner (wallet page)", async ({ request }) => {
    const profilePath = "/api/users/me";
    const profileResponse = await request.get(`${apiBase}${profilePath}`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(
      profileResponse.ok(),
      `[wallet page] GET ${profilePath} could not identify the seeded transaction owner`,
    ).toBe(true);
    const profile = GetMeResponse.safeParse(await profileResponse.json());
    expect(
      profile.success,
      `[wallet page] GET ${profilePath} no longer matches the OpenAPI contract:\n${formatIssues(profile)}`,
    ).toBe(true);
    if (!profile.success) return;
    const ownerToken = liveToken;

    const listPath = "/api/transactions";
    const listResponse = await request.get(`${apiBase}${listPath}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(
      listResponse.ok(),
      `[wallet page] GET ${listPath} for the transaction owner returned HTTP ${listResponse.status()}`,
    ).toBe(true);
    const listParsed = ListTransactionsResponse.safeParse(await listResponse.json());
    expect(
      listParsed.success,
      `[wallet page] GET ${listPath} for the transaction owner no longer matches the OpenAPI contract:\n${formatIssues(listParsed)}`,
    ).toBe(true);
    expect(
      listParsed.success && listParsed.data.length > 0,
      `[wallet page] GET ${listPath} for the transaction owner returned no seeded records for the access-control check`,
    ).toBe(true);
    if (!listParsed.success || !listParsed.data[0]) return;

    const path = `/api/transactions/${listParsed.data[0].id}`;
    const ownerDetailResponse = await request.get(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(
      ownerDetailResponse.ok(),
      `[wallet page] GET ${path} for the authorized owner returned HTTP ${ownerDetailResponse.status()}`,
    ).toBe(true);
    const ownerDetail = GetTransactionResponse.safeParse(await ownerDetailResponse.json());
    expect(
      ownerDetail.success,
      `[wallet page] GET ${path} for the authorized owner no longer matches the OpenAPI contract:\n${formatIssues(ownerDetail)}`,
    ).toBe(true);
    expect(
      ownerDetail.success && ownerDetail.data.userId === listParsed.data[0].userId,
      `[wallet page] GET ${path} returned a transaction outside the authorized owner's wallet`,
    ).toBe(true);

    const otherUserToken = createFixtureToken(999, false);

    const deniedResponse = await request.get(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    expect(
      deniedResponse.status(),
      `[wallet page] GET ${path} exposed another user's transaction to a non-admin session`,
    ).toBe(404);
  });

  test("balance reconciliation protects admin routes and matches the OpenAPI contract", async ({ request }) => {
    const unauthenticated = await request.get(`${apiBase}/api/finance/reconciliation?status=all`);
    expect(unauthenticated.status()).toBe(401);

    const regularToken = createFixtureToken(999, false);
    const denied = await request.get(`${apiBase}/api/finance/reconciliation?status=all`, {
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    expect(denied.status()).toBe(403);

    const listResponse = await request.get(`${apiBase}/api/finance/reconciliation?status=all&limit=2&offset=0`, {
      headers: { Authorization: `Bearer ${liveToken}` },
    });
    expect(listResponse.ok(), `GET /api/finance/reconciliation returned HTTP ${listResponse.status()}`).toBe(true);
    const listParsed = ListBalanceReconciliationResponse.safeParse(await listResponse.json());
    expect(listParsed.success, `Reconciliation list contract failed: ${formatIssues(listParsed)}`).toBe(true);

    if (listParsed.success && listParsed.data.items[0]) {
      const detailResponse = await request.get(`${apiBase}/api/finance/reconciliation/${listParsed.data.items[0].userId}`, {
        headers: { Authorization: `Bearer ${liveToken}` },
      });
      expect(detailResponse.ok(), `GET reconciliation detail returned HTTP ${detailResponse.status()}`).toBe(true);
      const detailParsed = GetBalanceReconciliationResponse.safeParse(await detailResponse.json());
      expect(detailParsed.success, `Reconciliation detail contract failed: ${formatIssues(detailParsed)}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — pages rendered with live API data
// ---------------------------------------------------------------------------

/**
 * Forward every /api request the browser makes to the live API server and
 * validate each contracted GET response on the way through.
 */
async function proxyLiveApi(page: Page, violations: string[]) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await route.fetch({
      url: `${apiBase}${url.pathname}${url.search}`,
      headers: await request.allHeaders(),
    });
    if (response.status() >= 500) {
      violations.push(`[browser] ${request.method()} ${url.pathname} returned HTTP ${response.status()}`);
    }

    if (request.method() === "GET") {
      const contract = contracts.find((c) => c.path === url.pathname);
      if (contract) {
        if (!response.ok()) {
          violations.push(
            `[${contract.page} page] GET ${url.pathname} returned HTTP ${response.status()}`,
          );
        } else {
          try {
            const parsed = contract.schema.safeParse(await response.json());
            if (!parsed.success) {
              violations.push(
                `[${contract.page} page] GET ${url.pathname} no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
              );
            }
          } catch (error) {
            violations.push(
              `[${contract.page} page] GET ${url.pathname} returned a non-JSON body: ${String(error)}`,
            );
          }
        }
      }
    }

    await route.fulfill({ response });
  });
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("pages with live API data", () => {
  let violations: string[];
  let browserErrors: string[];
  let logoRequestErrors: string[];

  test.beforeEach(async ({ page }) => {
    violations = [];
    browserErrors = collectBrowserErrors(page);
    logoRequestErrors = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/partner-logos/") && response.status() >= 400) {
        logoRequestErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.addInitScript((token) => {
      window.localStorage.setItem("ls_token", token);
    }, liveToken);
    await proxyLiveApi(page, violations);
  });

  test.afterEach(() => {
    expect(violations, `API contract violations detected:\n${violations.join("\n")}`).toEqual([]);
    expect(browserErrors, `Browser errors detected:\n${browserErrors.join("\n")}`).toEqual([]);
    expect(logoRequestErrors, `Logo requests failed:\n${logoRequestErrors.join("\n")}`).toEqual([]);
  });

  test("dashboard renders live data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();
    await expect(page.getByTestId("balance-card")).toBeVisible();
  });

  test("profile renders live data", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Центр верификации" })).toBeVisible();
  });

  test("score renders live data", async ({ page }) => {
    await page.goto("/score");
    await expect(page.getByRole("heading", { name: "Рейтинг доверия", level: 1 })).toBeVisible();
    await expect(page.getByTestId("score-value")).toHaveText(/^\d+$/, { timeout: 10_000 });
  });

  test("catalog and offers render live partner logos", async ({ page }) => {
    await page.goto("/partners");
    await expect(page.getByRole("heading", { name: "Каталог партнёров" })).toBeVisible();
    await expect(page.locator('[data-testid^="partner-card-"]')).not.toHaveCount(0);
    await expect(page.locator('img[alt$="логотип"]')).toHaveCount(demoLogoFiles.length);
    await expect(page.locator('[data-testid^="partner-card-"]').first()).toHaveAttribute("href", /\/partners\/\d+/);

    await page.goto("/offers");
    await expect(page.getByRole("heading", { name: "Спецпредложения" })).toBeVisible();
    await expect(page.locator('[data-testid^="offer-item-"]')).not.toHaveCount(0);
    await expect(page.locator('img[alt$="логотип"]')).not.toHaveCount(0);
    await expect(page.locator('[data-testid^="offer-item-"]').first()).toHaveAttribute("href", /\/offers\/\d+/);
  });

  test("shared catalog links load their selected category on first page load", async ({ page }) => {
    const assertPartnerLink = async (category: "food") => {
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/partners" &&
          url.searchParams.get("category") === category
        );
      });

      await page.goto(`/partners?category=${category}`);
      await expect(page.getByRole("heading", { name: "Каталог партнёров" })).toBeVisible();
      await expect(page.getByTestId(`partner-filter-${category}`)).toHaveAttribute("aria-pressed", "true");

      const response = await responsePromise;
      expect(response.ok(), `Shared partners request returned HTTP ${response.status()}`).toBe(true);
      const parsed = ListPartnersResponse.safeParse(await response.json());
      expect(
        parsed.success,
        `Shared partners response no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
      ).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.every((partner) => partner.category === category)).toBe(true);
      const cards = page.locator('[data-testid^="partner-card-"]');
      const emptyState = page.getByText("Партнёров не найдено", { exact: true });
      if (parsed.data.length > 0) {
        await expect(cards).toHaveCount(parsed.data.length);
        await expect(cards.first()).toBeVisible();
        await expect(emptyState).toBeHidden();
        for (const card of await cards.all()) {
          await expect(card).toHaveAttribute("data-category", category);
        }
      } else {
        await expect(cards).toHaveCount(0);
        await expect(emptyState).toBeVisible();
      }
    };

    const assertOfferLink = async (category: "transport") => {
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/api/offers" &&
          url.searchParams.get("category") === category
        );
      });

      await page.goto(`/offers?category=${category}`);
      await expect(page.getByRole("heading", { name: "Спецпредложения" })).toBeVisible();
      await expect(page.getByTestId(`offer-filter-${category}`)).toHaveAttribute("aria-pressed", "true");

      const response = await responsePromise;
      expect(response.ok(), `Shared offers request returned HTTP ${response.status()}`).toBe(true);
      const parsed = ListOffersResponse.safeParse(await response.json());
      expect(
        parsed.success,
        `Shared offers response no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
      ).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.every((offer) => offer.category === category)).toBe(true);
      const items = page.locator('[data-testid^="offer-item-"]');
      const emptyState = page.getByText("Нет активных предложений", { exact: true });
      if (parsed.data.length > 0) {
        await expect(items).toHaveCount(parsed.data.length);
        await expect(items.first()).toBeVisible();
        await expect(emptyState).toBeHidden();
        for (const item of await items.all()) {
          await expect(item).toHaveAttribute("data-category", category);
        }
      } else {
        await expect(items).toHaveCount(0);
        await expect(emptyState).toBeVisible();
      }
    };

    await assertPartnerLink("food");
    await assertOfferLink("transport");
  });

  test("catalog pages copy a filtered link and report clipboard failures", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { __copiedCatalogLink?: string }).__copiedCatalogLink = value;
          },
        },
      });
    });

    await page.goto("/partners?category=food");
    await page.getByTestId("partner-copy-link").click();
    await expect(page.getByTestId("partner-copy-link")).toContainText("Ссылка скопирована");
    const copiedPartnerLink = await page.evaluate(() => (window as Window & { __copiedCatalogLink?: string }).__copiedCatalogLink);
    expect(copiedPartnerLink).toBe(new URL("/partners?category=food", await page.url()).toString());

    await page.goto("/offers?category=transport");
    await page.getByTestId("offer-copy-link").click();
    await expect(page.getByTestId("offer-copy-link")).toContainText("Ссылка скопирована");
    const copiedOfferLink = await page.evaluate(() => (window as Window & { __copiedCatalogLink?: string }).__copiedCatalogLink);
    expect(copiedOfferLink).toBe(new URL("/offers?category=transport", await page.url()).toString());

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new Error("clipboard denied"); } },
      });
    });
    await page.getByTestId("offer-copy-link").click();
    await expect(page.getByTestId("offer-copy-link")).toContainText("Не удалось скопировать");
    await expect(page.getByRole("status")).toContainText("Не удалось скопировать ссылку");
  });

  test("catalog links without a supported category use the unfiltered request", async ({ page }) => {
    const assertUnfilteredPartners = async (path: string) => {
      const requestPromise = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return request.method() === "GET" && url.pathname === "/api/partners";
      });

      await page.goto(path);
      await expect(page.getByTestId("partner-filter-all")).toHaveAttribute("aria-pressed", "true");

      const request = await requestPromise;
      expect(new URL(request.url()).searchParams.has("category")).toBe(false);
    };

    const assertUnfilteredOffers = async (path: string) => {
      const requestPromise = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return request.method() === "GET" && url.pathname === "/api/offers";
      });

      await page.goto(path);
      await expect(page.getByTestId("offer-filter-all")).toHaveAttribute("aria-pressed", "true");

      const request = await requestPromise;
      expect(new URL(request.url()).searchParams.has("category")).toBe(false);
    };

    await assertUnfilteredPartners("/partners");
    await assertUnfilteredPartners("/partners?category=unsupported");
    await assertUnfilteredOffers("/offers");
    await assertUnfilteredOffers("/offers?category=unsupported");
  });

  test("partner category filters stay aligned through browser history", async ({ page }) => {
    await page.goto("/partners");
    await expect(page.getByRole("heading", { name: "Каталог партнёров" })).toBeVisible();

    const assertPartnerView = async (
      category: "food" | "transport",
      data: Array<{ category: string }>,
    ) => {
      await expect(page).toHaveURL(new RegExp(`/partners\\?category=${category}$`));
      await expect(page.getByTestId(`partner-filter-${category}`)).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByTestId(`partner-filter-${category === "food" ? "transport" : "food"}`),
      ).toHaveAttribute("aria-pressed", "false");

      const partnerCards = page.locator('[data-testid^="partner-card-"]');
      const emptyState = page.getByText("Партнёров не найдено", { exact: true });
      if (data.length > 0) {
        await expect(partnerCards).toHaveCount(data.length);
        await expect(partnerCards.first()).toBeVisible();
        await expect(emptyState).toBeHidden();
        for (const card of await partnerCards.all()) {
          await expect(card).toHaveAttribute("data-category", category);
        }
      } else {
        await expect(partnerCards).toHaveCount(0);
        await expect(emptyState).toBeVisible();
      }
    };

    const filteredResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/partners" &&
        url.searchParams.get("category") === "food"
      );
    });
    await page.getByTestId("partner-filter-food").click();

    const filteredResponse = await filteredResponsePromise;
    expect(filteredResponse.ok(), `Filtered partners request returned HTTP ${filteredResponse.status()}`).toBe(true);
    const parsed = ListPartnersResponse.safeParse(await filteredResponse.json());
    expect(
      parsed.success,
      `Filtered partners response no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.every((partner) => partner.category === "food")).toBe(true);
    await assertPartnerView("food", parsed.data);

    const transportResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/partners" &&
        url.searchParams.get("category") === "transport"
      );
    });
    await page.getByTestId("partner-filter-transport").click();
    const transportResponse = await transportResponsePromise;
    expect(transportResponse.ok(), `Filtered partners request returned HTTP ${transportResponse.status()}`).toBe(true);
    const transportParsed = ListPartnersResponse.safeParse(await transportResponse.json());
    expect(
      transportParsed.success,
      `Filtered partners response no longer matches the OpenAPI contract:\n${formatIssues(transportParsed)}`,
    ).toBe(true);
    if (!transportParsed.success) return;
    expect(transportParsed.data.every((partner) => partner.category === "transport")).toBe(true);
    await assertPartnerView("transport", transportParsed.data);

    await page.goBack();
    await assertPartnerView("food", parsed.data);
    await page.goForward();
    await assertPartnerView("transport", transportParsed.data);
  });

  test("offer category filters stay aligned through browser history", async ({ page }) => {
    await page.goto("/offers");
    await expect(page.getByRole("heading", { name: "Спецпредложения" })).toBeVisible();

    const assertOfferView = async (
      category: "transport" | "food",
      data: Array<{ category: string }>,
    ) => {
      await expect(page).toHaveURL(new RegExp(`/offers\\?category=${category}$`));
      await expect(page.getByTestId(`offer-filter-${category}`)).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByTestId(`offer-filter-${category === "transport" ? "food" : "transport"}`),
      ).toHaveAttribute("aria-pressed", "false");

      const offerItems = page.locator('[data-testid^="offer-item-"]');
      const emptyState = page.getByText("Нет активных предложений", { exact: true });
      if (data.length > 0) {
        await expect(offerItems).toHaveCount(data.length);
        await expect(offerItems.first()).toBeVisible();
        await expect(emptyState).toBeHidden();
        for (const item of await offerItems.all()) {
          await expect(item).toHaveAttribute("data-category", category);
        }
      } else {
        await expect(offerItems).toHaveCount(0);
        await expect(emptyState).toBeVisible();
      }
    };

    const filteredResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/offers" &&
        url.searchParams.get("category") === "transport"
      );
    });
    await page.getByTestId("offer-filter-transport").click();

    const filteredResponse = await filteredResponsePromise;
    expect(filteredResponse.ok(), `Filtered offers request returned HTTP ${filteredResponse.status()}`).toBe(true);
    const parsed = ListOffersResponse.safeParse(await filteredResponse.json());
    expect(
      parsed.success,
      `Filtered offers response no longer matches the OpenAPI contract:\n${formatIssues(parsed)}`,
    ).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.every((offer) => offer.category === "transport")).toBe(true);
    await assertOfferView("transport", parsed.data);

    const foodResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/offers" &&
        url.searchParams.get("category") === "food"
      );
    });
    await page.getByTestId("offer-filter-food").click();
    const foodResponse = await foodResponsePromise;
    expect(foodResponse.ok(), `Filtered offers request returned HTTP ${foodResponse.status()}`).toBe(true);
    const foodParsed = ListOffersResponse.safeParse(await foodResponse.json());
    expect(
      foodParsed.success,
      `Filtered offers response no longer matches the OpenAPI contract:\n${formatIssues(foodParsed)}`,
    ).toBe(true);
    if (!foodParsed.success) return;
    expect(foodParsed.data.every((offer) => offer.category === "food")).toBe(true);
    await assertOfferView("food", foodParsed.data);

    await page.goBack();
    await assertOfferView("transport", parsed.data);
    await page.goForward();
    await assertOfferView("food", foodParsed.data);
  });

  test("calculator renders live financial quotes", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.getByRole("heading", { name: "Сначала цифры. Потом решение." })).toBeVisible();
    await page.getByTestId("input-gross-amount").fill("1000");
    await page.getByTestId("button-calculate").click();
    await expect(page.getByTestId("purchase-quote")).toBeVisible();

    await page.getByTestId("mode-rental").click();
    await page.getByTestId("input-gross-amount").fill("100000");
    await page.getByTestId("button-calculate").click();
    await expect(page.getByTestId("rental-quote")).toBeVisible();
  });

  test("wallet renders the monetary ledger or an explicit empty state", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible();
    const rows = page.locator('[data-testid^="ledger-row-"], [data-testid^="transaction-row-"]');
    await expect(rows.first().or(page.getByText("Транзакции не найдены"))).toBeVisible();
  });
});
