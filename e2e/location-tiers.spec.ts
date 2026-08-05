import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// A chip is addressed by its data-key attribute; the tier <select> inside it is
// the deterministic (non-DnD) way to assign a tier.
function chip(page: Page, key: string) {
  return page.locator(`[data-testid="tier-chip"][data-key="${key}"]`);
}

// Tests share one seeded DB (serial, no reseed between tests), so any mutation
// restores the location to unranked before the next test runs.
test.describe("location tiers", () => {
  test("renders S through F and the neutral unrated pool", async ({ page }) => {
    await page.goto("/location-tiers");
    await expect(page.getByRole("heading", { name: "Location tiers" })).toBeVisible();
    for (const t of ["S", "A", "B", "C", "D", "E", "F"]) {
      await expect(page.getByTestId(`tier-row-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId("tier-pool")).toBeVisible();
    await expect(page.getByTestId("tier-pool-note")).toContainText("same score as E tier");
  });

  test("a pre-seeded ranking lands in the correct tier row", async ({ page }) => {
    await page.goto("/location-tiers");
    // "San Francisco, CA" is seeded as tier S.
    await expect(
      page.getByTestId("tier-row-S").locator(`[data-key="San Francisco, CA"]`),
    ).toBeVisible();
  });

  test("search filters the unranked pool", async ({ page }) => {
    await page.goto("/location-tiers");
    const pool = page.getByTestId("tier-pool");
    await expect(pool.locator(`[data-key="New York, NY"]`)).toBeVisible();

    await page.getByTestId("tier-search").fill("austin");
    await expect(pool.locator(`[data-key="Austin, TX"]`)).toBeVisible();
    await expect(pool.locator(`[data-key="New York, NY"]`)).toHaveCount(0);
  });

  test("assigning a tier via the select persists across reload", async ({ page }) => {
    await page.goto("/location-tiers");

    const ny = chip(page, "New York, NY");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="New York, NY"]`)).toBeVisible();

    await ny.getByTestId("tier-select").selectOption("A");
    await expect(page.getByTestId("tier-row-A").locator(`[data-key="New York, NY"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("tier-row-A").locator(`[data-key="New York, NY"]`)).toBeVisible();
    await expect(chip(page, "New York, NY").getByTestId("tier-select")).toHaveValue("A");

    // Restore to unranked so later tests start clean.
    await chip(page, "New York, NY").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="New York, NY"]`)).toBeVisible();
  });

  test("clearing a tier returns the location to the pool", async ({ page }) => {
    await page.goto("/location-tiers");

    const austin = chip(page, "Austin, TX");
    await expect(austin).toBeVisible();
    await austin.getByTestId("tier-select").selectOption("B");
    await expect(page.getByTestId("tier-row-B").locator(`[data-key="Austin, TX"]`)).toBeVisible();

    await chip(page, "Austin, TX").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="Austin, TX"]`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("tier-pool").locator(`[data-key="Austin, TX"]`)).toBeVisible();
  });
});
