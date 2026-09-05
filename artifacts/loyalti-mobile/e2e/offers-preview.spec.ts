import { expect, test } from "@playwright/test";

const offer = {
  id: 7,
  partnerId: 3,
  partnerName: "Яндекс Лавка",
  partnerLogoUrl: null,
  title: "−20% на первый заказ",
  description: "Скидка действует на первый заказ от партнёра.",
  bonusMultiplier: 2,
  category: "food",
  minAmountRub: 800,
  isActive: true,
  expiresAt: "2026-09-20T00:00:00.000Z",
  isSaved: false,
  isActivated: false,
};

const activatedOffer = {
  ...offer,
  id: 8,
  title: "2× бонус за оплату",
  isSaved: true,
  isActivated: true,
};

test.describe("mobile offers", () => {
  test("opens offer details and activates the offer", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("ls_token", "offers-preview-token");
    });

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname.endsWith("/offers") && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([offer]),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}`) && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(offer),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}/activate`) && request.method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            offer: { ...offer, isSaved: true, isActivated: true },
            saved: true,
            activated: true,
          }),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}/save`) && request.method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            offer: { ...offer, isSaved: true },
            saved: true,
            activated: false,
          }),
        });
      }

      if (pathname.endsWith("/partners")) {
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

    await page.goto("partners");
    await expect(page.getByText("Предложения")).toBeVisible();
    await expect(page.getByText(offer.title)).toBeVisible();

    await page.getByTestId(`offer-card-${offer.id}`).click();
    await expect(page.getByText("Предложение", { exact: true })).toBeVisible();
    await expect(page.getByText("Минимальная сумма")).toBeVisible();
    await expect(page.getByText("от 800 ₽", { exact: true })).toBeVisible();

    await page.getByTestId("offer-activate-button").click();
    await expect(page.getByText("Предложение активировано. Покажите его при оплате у партнёра.")).toBeVisible();
    await expect(page.getByTestId("offer-activate-button")).toHaveAttribute("aria-disabled", "true");
  });

  test("saves an offer without activating it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("ls_token", "offers-preview-token");
    });

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname.endsWith(`/offers/${offer.id}`) && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(offer),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}/save`) && request.method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            offer: { ...offer, isSaved: true },
            saved: true,
            activated: false,
          }),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}/save`) && request.method() === "DELETE") {
        return route.fulfill({ status: 204, body: "" });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.goto(`offer/${offer.id}`);
    await page.getByTestId("offer-save-button").click();
    await expect(page.getByText("Предложение сохранено в вашем профиле.")).toBeVisible();
    await expect(page.getByTestId("offer-remove-saved-button")).toBeVisible();
    await page.getByTestId("offer-remove-saved-button").click();
    await expect(page.getByText("Предложение удалено из сохранённых.")).toBeVisible();
    await expect(page.getByTestId("offer-save-button")).toBeVisible();
  });

  test("shows saved and activated offers in the saved filter", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("ls_token", "offers-preview-token");
    });

    let savedOffers = [{ ...offer, isSaved: true }, activatedOffer];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname.endsWith("/offers/saved") && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedOffers),
        });
      }

      if (pathname.endsWith(`/offers/${offer.id}/save`) && request.method() === "DELETE") {
        savedOffers = savedOffers.filter((savedOffer) => savedOffer.id !== offer.id);
        return route.fulfill({ status: 204, body: "" });
      }

      if (pathname.endsWith(`/offers/${activatedOffer.id}/save`) && request.method() === "DELETE") {
        savedOffers = savedOffers.filter((savedOffer) => savedOffer.id !== activatedOffer.id);
        return route.fulfill({ status: 204, body: "" });
      }

      if (pathname.endsWith(`/offers/${offer.id}`) && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...offer, isSaved: true }),
        });
      }

      if (pathname.endsWith("/offers") && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      }

      if (pathname.endsWith("/partners")) {
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

    await page.goto("partners");
    await page.getByTestId("offer-filter-saved").click();

    await expect(page.getByText("Сохранённые", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await expect(page.getByText("Активировано", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`offer-card-${offer.id}`)).toBeVisible();
    await expect(page.getByTestId(`offer-card-${activatedOffer.id}`)).toBeVisible();

    await page.getByTestId(`offer-remove-saved-${offer.id}`).click();
    await expect(page.getByTestId(`offer-card-${offer.id}`)).toHaveCount(0);

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("активация отменена");
      await dialog.dismiss();
    });
    await page.getByTestId(`offer-remove-saved-${activatedOffer.id}`).click();
    await expect(page.getByTestId(`offer-card-${activatedOffer.id}`)).toBeVisible();
  });
});
