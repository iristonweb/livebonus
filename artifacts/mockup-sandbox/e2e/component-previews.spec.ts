import { expect, test, type Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}

async function openPreview(page: Page, component: string) {
  await page.goto(`preview/${component}`, { waitUntil: "domcontentloaded" });
}

test.describe("shared component previews", () => {
  test("renders Calendar and wires its ref paths", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Calendar");

    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
    await expect(page.locator("[data-day]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /next month/i })).toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test("renders Spinner with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Spinner");

    await expect(page.getByRole("heading", { name: "Spinner" })).toBeVisible();
    await expect(page.locator('svg[role="status"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="spinner-callback-ref"]')).toHaveAttribute(
      "data-ref-wired",
      "callback",
    );
    await expect(page.locator('[data-testid="spinner-object-ref-status"]')).toHaveText(
      "Object ref: wired",
    );
    expect(browserErrors).toEqual([]);
  });

  test("renders Button with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Button");

    await expect(page.getByRole("heading", { name: "Button" })).toBeVisible();
    await expect(page.locator('button[data-testid="button-callback-ref"]')).toHaveAttribute(
      "data-ref-wired",
      "callback",
    );
    await expect(page.locator('[data-testid="button-object-ref-status"]')).toHaveText(
      "Object ref: wired",
    );
    expect(browserErrors).toEqual([]);
  });

  test("renders Input with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Input");

    await expect(page.getByRole("heading", { name: "Input" })).toBeVisible();
    await expect(page.locator('input[data-testid="input-callback-ref"]')).toHaveAttribute(
      "data-ref-wired",
      "callback",
    );
    await expect(page.locator('[data-testid="input-object-ref-status"]')).toHaveText(
      "Object ref: wired",
    );
    expect(browserErrors).toEqual([]);
  });

  test("renders Select with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Select");

    await expect(page.getByRole("heading", { name: "Select" })).toBeVisible();
    await expect(page.locator('button[data-testid="select-callback-ref"]')).toHaveAttribute(
      "data-ref-wired",
      "callback",
    );
    await expect(page.locator('[data-testid="select-object-ref-status"]')).toHaveText(
      "Object ref: wired",
    );
    expect(browserErrors).toEqual([]);
  });

  test("renders Dialog with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Dialog");

    await expect(page.getByRole("heading", { name: "Dialog" })).toBeVisible();
    const callbackStatus = page.locator('[data-testid="dialog-callback-ref-status"]');
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    const callbackTrigger = page.getByRole("button", { name: "Callback ref trigger" });
    const callbackContent = page.locator('[data-testid="dialog-callback-ref"]');
    await callbackTrigger.click();
    await expect(
      callbackContent,
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackContent).toBeHidden();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    await expect(callbackTrigger).toBeFocused();
    await callbackTrigger.click();
    await expect(callbackContent).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");

    const objectTrigger = page.getByRole("button", { name: "Object ref trigger" });
    await objectTrigger.click();
    await expect(
      page.locator('[data-testid="dialog-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Popover with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Popover");

    await expect(page.getByRole("heading", { name: "Popover" })).toBeVisible();
    const callbackTrigger = page.getByRole("button", { name: "Callback ref trigger" });
    const callbackContent = page.locator('[data-testid="popover-callback-ref"]');
    await callbackTrigger.click();
    await expect(
      callbackContent,
    ).toHaveAttribute("data-ref-wired", "callback");
    await callbackTrigger.click();
    await expect(callbackContent).toBeHidden();
    await expect(callbackTrigger).toBeFocused();

    await page.getByRole("button", { name: "Object ref trigger" }).click();
    await expect(
      page.locator('[data-testid="popover-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Toggle with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Toggle");

    await expect(page.getByRole("heading", { name: "Toggle" })).toBeVisible();
    await expect(
      page.locator('button[data-testid="toggle-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="toggle-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Tooltip with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Tooltip");

    await expect(page.getByRole("heading", { name: "Tooltip" })).toBeVisible();
    await expect(
      page.locator('[data-testid="tooltip-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="tooltip-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders AlertDialog with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "AlertDialog");

    await expect(page.getByRole("heading", { name: "AlertDialog" })).toBeVisible();
    const callbackStatus = page.locator(
      '[data-testid="alert-dialog-callback-ref-status"]',
    );
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    const callbackTrigger = page.getByRole("button", { name: "Callback ref trigger" });
    const callbackContent = page.locator('[data-testid="alert-dialog-callback-ref"]');
    await callbackTrigger.click();
    await expect(
      callbackContent,
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackContent).toBeHidden();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    await expect(callbackTrigger).toBeFocused();
    await callbackTrigger.click();
    await expect(callbackContent).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");

    const objectTrigger = page.getByRole("button", { name: "Object ref trigger" });
    const objectContent = page.locator('[data-testid="alert-dialog-object-ref"]');
    await objectTrigger.click();
    await expect(
      objectContent,
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="alert-dialog-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(objectContent).toBeHidden();
    await expect(
      page.locator('[data-testid="alert-dialog-object-ref-status"]'),
    ).toHaveText("Object ref: not wired");
    await expect(objectTrigger).toBeFocused();

    await objectTrigger.click();
    await expect(
      page.locator('[data-testid="alert-dialog-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Drawer with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Drawer");

    await expect(page.getByRole("heading", { name: "Drawer" })).toBeVisible();
    const callbackStatus = page.locator('[data-testid="drawer-callback-ref-status"]');
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    const callbackTrigger = page.getByRole("button", { name: "Callback ref trigger" });
    const callbackContent = page.locator('[data-testid="drawer-callback-ref"]');
    await callbackTrigger.click();
    await expect(
      callbackContent,
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackContent).toBeHidden();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    await expect(callbackTrigger).toBeFocused();
    await callbackTrigger.click();
    await expect(callbackContent).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");

    await page.getByRole("button", { name: "Object ref trigger" }).click();
    await expect(
      page.locator('[data-testid="drawer-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Sheet with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Sheet");

    await expect(page.getByRole("heading", { name: "Sheet" })).toBeVisible();
    const callbackStatus = page.locator('[data-testid="sheet-callback-ref-status"]');
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    const callbackTrigger = page.getByRole("button", { name: "Callback ref trigger" });
    const callbackContent = page.locator('[data-testid="sheet-callback-ref"]');
    await callbackTrigger.click();
    await expect(
      callbackContent,
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackContent).toBeHidden();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");
    await expect(callbackTrigger).toBeFocused();
    await callbackTrigger.click();
    await expect(callbackContent).toHaveAttribute("data-ref-wired", "callback");
    await expect(callbackStatus).toHaveText("Callback ref: wired");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(callbackStatus).toHaveText("Callback ref: not wired");

    await page.getByRole("button", { name: "Object ref trigger" }).click();
    await expect(
      page.locator('[data-testid="sheet-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders HoverCard with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "HoverCard");

    await expect(page.getByRole("heading", { name: "HoverCard" })).toBeVisible();
    await page.getByRole("button", { name: "Callback ref trigger" }).click();
    await expect(
      page.locator('[data-testid="hover-card-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="hover-card-callback-ref"]'),
    ).toBeHidden();
    await page.getByRole("button", { name: "Object ref trigger" }).click();
    await expect(
      page.locator('[data-testid="hover-card-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders DropdownMenu with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "DropdownMenu");

    await expect(page.getByRole("heading", { name: "DropdownMenu" })).toBeVisible();
    await page.getByRole("button", { name: "Callback ref trigger" }).click();
    await expect(
      page.locator('[data-testid="dropdown-menu-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="dropdown-menu-callback-ref"]'),
    ).toBeHidden();
    await page.getByRole("button", { name: "Object ref trigger" }).click();
    await expect(
      page.locator('[data-testid="dropdown-menu-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders ContextMenu with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "ContextMenu");

    await expect(page.getByRole("heading", { name: "ContextMenu" })).toBeVisible();
    await expect(
      page.locator('[data-testid="context-menu-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");
    await expect(
      page.locator('[data-testid="context-menu-object-ref-status"]'),
    ).toHaveText("Object ref: not wired");

    const callbackTrigger = page.getByRole("button", { name: "Callback ref target" });
    await page
      .getByRole("button", { name: "Callback ref target" })
      .click({ button: "right" });
    await expect(
      page.locator('[data-testid="context-menu-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="context-menu-callback-ref-status"]'),
    ).toHaveText("Callback ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="context-menu-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");
    await callbackTrigger.click({ button: "right" });
    await expect(
      page.locator('[data-testid="context-menu-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="context-menu-callback-ref-status"]'),
    ).toHaveText("Callback ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="context-menu-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");

    const objectTrigger = page.getByRole("button", { name: "Object ref target" });
    await page
      .getByRole("button", { name: "Object ref target" })
      .click({ button: "right" });
    await expect(
      page.locator('[data-testid="context-menu-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="context-menu-object-ref-status"]'),
    ).toHaveText("Object ref: not wired");
    await objectTrigger.click({ button: "right" });
    await expect(
      page.locator('[data-testid="context-menu-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });

  test("renders Menubar with callback and object refs", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await openPreview(page, "Menubar");

    await expect(page.getByRole("heading", { name: "Menubar" })).toBeVisible();
    await expect(
      page.locator('[data-testid="menubar-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");
    await expect(
      page.locator('[data-testid="menubar-object-ref-status"]'),
    ).toHaveText("Object ref: not wired");

    const callbackTrigger = page.getByRole("menuitem", { name: "Callback ref trigger" });
    await page
      .getByRole("menuitem", { name: "Callback ref trigger" })
      .press("Enter");
    await expect(
      page.locator('[data-testid="menubar-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="menubar-callback-ref-status"]'),
    ).toHaveText("Callback ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="menubar-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");
    await callbackTrigger.press("Enter");
    await expect(
      page.locator('[data-testid="menubar-callback-ref"]'),
    ).toHaveAttribute("data-ref-wired", "callback");
    await expect(
      page.locator('[data-testid="menubar-callback-ref-status"]'),
    ).toHaveText("Callback ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="menubar-callback-ref-status"]'),
    ).toHaveText("Callback ref: not wired");

    const objectTrigger = page.getByRole("menuitem", { name: "Object ref trigger" });
    await page
      .getByRole("menuitem", { name: "Object ref trigger" })
      .press("Enter");
    await expect(
      page.locator('[data-testid="menubar-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="menubar-object-ref-status"]'),
    ).toHaveText("Object ref: not wired");
    await objectTrigger.press("Enter");
    await expect(
      page.locator('[data-testid="menubar-object-ref-status"]'),
    ).toHaveText("Object ref: wired");
    expect(browserErrors).toEqual([]);
  });
});