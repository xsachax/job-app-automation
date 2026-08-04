import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// A chip is addressed by its data-key attribute; the tier <select> inside it
// is the deterministic (non-DnD) way to assign a tier.
function chip(page: Page, company: string) {
  return page.locator(`[data-testid="tier-chip"][data-key="${company}"]`);
}

// Tests share one seeded DB (serial, no reseed between tests), so any mutation
// restores the company to unranked before the next test runs.
test.describe("company tiers", () => {
  test("renders tier rows and the unranked pool", async ({ page }) => {
    await page.goto("/tiers");
    await expect(page.getByRole("heading", { name: "Company tiers" })).toBeVisible();
    for (const t of ["S", "A", "B", "C", "D", "F"]) {
      await expect(page.getByTestId(`tier-row-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId("tier-pool")).toBeVisible();
  });

  test("a pre-seeded ranking lands in the correct tier row", async ({ page }) => {
    await page.goto("/tiers");
    // OpenAI is seeded as tier S.
    await expect(chip(page, "OpenAI")).toBeVisible();
    await expect(
      page.getByTestId("tier-row-S").locator(`[data-key="OpenAI"]`),
    ).toBeVisible();
  });

  test("search filters the unranked pool", async ({ page }) => {
    await page.goto("/tiers");
    const pool = page.getByTestId("tier-pool");
    await expect(pool.locator(`[data-key="AcmeE2E"]`)).toBeVisible();

    await page.getByTestId("tier-search").fill("maple");
    await expect(pool.locator(`[data-key="MapleE2E"]`)).toBeVisible();
    await expect(pool.locator(`[data-key="AcmeE2E"]`)).toHaveCount(0);
  });

  test("assigning a tier via the select persists across reload", async ({ page }) => {
    await page.goto("/tiers");

    const acme = chip(page, "AcmeE2E");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="AcmeE2E"]`)).toBeVisible();

    await acme.getByTestId("tier-select").selectOption("A");
    await expect(page.getByTestId("tier-row-A").locator(`[data-key="AcmeE2E"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("tier-row-A").locator(`[data-key="AcmeE2E"]`)).toBeVisible();
    await expect(chip(page, "AcmeE2E").getByTestId("tier-select")).toHaveValue("A");

    // Restore to unranked so later tests start clean.
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="AcmeE2E"]`)).toBeVisible();
  });

  test("clearing a tier returns the company to the pool", async ({ page }) => {
    await page.goto("/tiers");

    const maple = chip(page, "MapleE2E");
    await expect(maple).toBeVisible();
    await maple.getByTestId("tier-select").selectOption("B");
    await expect(page.getByTestId("tier-row-B").locator(`[data-key="MapleE2E"]`)).toBeVisible();

    await chip(page, "MapleE2E").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="MapleE2E"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("tier-pool").locator(`[data-key="MapleE2E"]`)).toBeVisible();
  });
});
