import { test, expect } from "@playwright/test";

test.describe("sidebar nav", () => {
  test("tier lists group collapses, expands, and navigates", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    const toggle = nav.getByTestId("nav-tier-lists-toggle");

    // Collapsed on a non-tier route: children are not rendered.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Company tiers", exact: true })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const companyTiers = nav.getByRole("link", { name: "Company tiers", exact: true });
    await expect(companyTiers).toBeVisible();
    await companyTiers.click();
    await expect(page).toHaveURL(/\/tiers$/);
  });

  test("group auto-expands on a tier route", async ({ page }) => {
    await page.goto("/location-tiers");
    const nav = page.getByRole("navigation");
    await expect(nav.getByTestId("nav-tier-lists-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(nav.getByRole("link", { name: "Location tiers", exact: true })).toBeVisible();
  });

  test("Profile and Settings are pinned to the end of the nav", async ({ page }) => {
    await page.goto("/");
    const labels = (
      await page.getByRole("navigation").getByRole("link").allInnerTexts()
    ).map((l) => l.trim());
    expect(labels.slice(-2)).toEqual(["Profile", "Settings"]);
  });

  test("interactive links and buttons show the pointer cursor", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");

    await expect(nav.getByRole("link", { name: "Overview" })).toHaveCSS(
      "cursor",
      "pointer",
    );
    await expect(nav.getByTestId("nav-tier-lists-toggle")).toHaveCSS(
      "cursor",
      "pointer",
    );
  });

  test("extension sidebar status links to its own setup page", async ({ page }) => {
    let openRequested = false;
    await page.route("**/api/chrome-extension/open", async (route) => {
      openRequested = route.request().method() === "POST";
      await route.fulfill({ json: { ok: true } });
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      });
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: {
          runtime: {
            sendMessage(
              id: string,
              _message: unknown,
              callback: (response: unknown) => void,
            ) {
              callback({
                ok: true,
                enabled: true,
                extensionId: id,
                version: "0.2.0",
              });
            },
          },
        },
      });
    });

    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText("Online", { exact: true })).toBeVisible();
    const extensionLink = nav.getByRole("link", { name: /Extension/ });
    await expect(extensionLink).toHaveCSS(
      "box-shadow",
      /rgba\(34, 197, 94, 0\.35\)/,
    );
    await extensionLink.click();

    await expect(page).toHaveURL(/\/extension$/);
    const setup = page.locator("#chrome-extension");
    await expect(setup).toBeVisible();
    await expect(setup.getByRole("button")).toHaveCount(1);
    await expect(setup.getByText("Connected", { exact: true })).toBeVisible();
    await expect(
      setup.getByText("Version 0.2.0 is ready for autofill."),
    ).toBeVisible();
    await setup.getByRole("button", { name: "Open Chrome extensions" }).click();
    expect(openRequested).toBe(true);

    await expect(setup.getByLabel("Chrome extension ID")).toHaveCount(0);
    await expect(setup).not.toContainText("localhost");
    await expect(setup).not.toContainText("127.0.0.1");
  });

  test("extension setup is clearly unsupported outside Google Chrome", async ({
    page,
  }) => {
    await page.goto("/extension");
    const setup = page.locator("#chrome-extension");

    await expect(
      setup.getByText("Supported only in Google Chrome."),
    ).toBeVisible();
    await expect(
      setup.getByText("Unsupported browser", { exact: true }),
    ).toBeVisible();
    await expect(
      setup.getByText("Open this dashboard in desktop Google Chrome."),
    ).toBeVisible();
    await expect(
      setup.getByRole("button", { name: "Open Chrome extensions" }),
    ).toBeDisabled();
    await expect(setup.getByLabel("Chrome extension ID")).toHaveCount(0);
  });
});
