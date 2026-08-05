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

  test("extension install button opens setup with a Web Store fallback", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await nav.getByRole("link", { name: "Install extension", exact: true }).click();

    await expect(page).toHaveURL(/\/settings#chrome-extension$/);
    const setup = page.locator("#chrome-extension");
    await expect(setup).toBeVisible();
    await expect(
      setup.getByRole("button", { name: "Copy Chrome setup URL" }),
    ).toBeVisible();
    await expect(
      setup.getByRole("link", { name: "Open Chrome Web Store ↗" }),
    ).toHaveAttribute("href", /^https:\/\/chromewebstore\.google\.com\//);
  });
});
