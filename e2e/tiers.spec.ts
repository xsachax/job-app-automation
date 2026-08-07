import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// A chip is addressed by its data-key attribute; the tier <select> inside it
// is the deterministic (non-DnD) way to assign a tier.
function chip(page: Page, company: string) {
  return page.locator(`[data-testid="tier-chip"][data-key="${company}"]`);
}

function saveStatus(page: Page) {
  return page.getByTestId("tier-save-status");
}

// Tests share one seeded DB (serial, no reseed between tests), so any mutation
// restores the company to unranked before the next test runs.
test.describe("company tiers", () => {
  test("renders S through F with company score bands", async ({ page }) => {
    await page.goto("/tiers");
    await expect(page.getByRole("heading", { name: "Company tiers" })).toBeVisible();
    for (const t of ["S", "A", "B", "C", "D", "E", "F"]) {
      await expect(page.getByTestId(`tier-row-${t}`)).toBeVisible();
    }
    await expect(page.getByTestId("tier-row-S++")).toHaveCount(0);
    await expect(page.getByTestId("tier-row-S+")).toHaveCount(0);
    await expect(page.getByTestId("tier-pool")).toBeVisible();
    await expect(page.getByText("84–97 fit", { exact: true })).toBeVisible();
    await expect(page.getByText("14–27 fit", { exact: true })).toBeVisible();
    await expect(page.getByTestId("tier-pool-note")).toContainText(
      "E-tier score band",
    );
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

  test("search includes companies backed only by Workday roles", async ({ page }) => {
    await page.goto("/tiers");
    await page.getByTestId("tier-search").fill("workdayonly");

    await expect(
      page.getByTestId("tier-pool").locator(`[data-key="WorkdayOnlyE2E"]`),
    ).toBeVisible();
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
    await expect(saveStatus(page)).toHaveText("All tiers saved");

    // Restore to unranked so later tests start clean.
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="AcmeE2E"]`)).toBeVisible();
    await expect(saveStatus(page)).toHaveText("All tiers saved");
  });

  test("clearing a tier returns the company to the pool", async ({ page }) => {
    await page.goto("/tiers");

    const maple = chip(page, "MapleE2E");
    await expect(maple).toBeVisible();
    await maple.getByTestId("tier-select").selectOption("B");
    await expect(page.getByTestId("tier-row-B").locator(`[data-key="MapleE2E"]`)).toBeVisible();

    await chip(page, "MapleE2E").getByTestId("tier-select").selectOption("");
    await expect(page.getByTestId("tier-pool").locator(`[data-key="MapleE2E"]`)).toBeVisible();
    await expect(saveStatus(page)).toHaveText("All tiers saved");

    await page.reload();
    await expect(page.getByTestId("tier-pool").locator(`[data-key="MapleE2E"]`)).toBeVisible();
  });

  test("recovers a failed save from the local draft after reload", async ({ page }) => {
    let failNextPut = true;
    await page.route("**/api/tiers", async (route) => {
      if (route.request().method() === "PUT" && failNextPut) {
        failNextPut = false;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/tiers");
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("B");
    await expect(saveStatus(page)).toHaveText("Unsaved tier changes");

    await page.reload();
    await expect(page.getByTestId("tier-row-B").locator(`[data-key="AcmeE2E"]`)).toBeVisible();
    await expect(saveStatus(page)).toHaveText("All tiers saved");

    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("");
    await expect(saveStatus(page)).toHaveText("All tiers saved");
  });

  test("keeps a pending edit across immediate navigation", async ({ page }) => {
    let delayNextPut = true;
    await page.route("**/api/tiers", async (route) => {
      if (route.request().method() === "PUT" && delayNextPut) {
        delayNextPut = false;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await route.continue();
    });

    await page.goto("/tiers");
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("C");
    await page.goto("/jobs");
    await page.goto("/tiers");

    await expect(page.getByTestId("tier-row-C").locator(`[data-key="AcmeE2E"]`)).toBeVisible();
    await expect(saveStatus(page)).toHaveText("All tiers saved");

    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("");
    await expect(saveStatus(page)).toHaveText("All tiers saved");
  });

  test("a newer tab edit wins over an older delayed request", async ({ page, context }) => {
    let releaseRequest = () => {};
    let markStarted = () => {};
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let heldOnce = false;

    await page.route("**/api/tiers", async (route) => {
      if (route.request().method() !== "PUT" || heldOnce) {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { company?: string };
      if (body.company !== "MapleE2E") {
        await route.continue();
        return;
      }
      heldOnce = true;
      markStarted();
      await held;
      await route.continue();
    });

    const newerTab = await context.newPage();
    try {
      await page.goto("/tiers");
      await newerTab.goto("/tiers");

      await chip(page, "MapleE2E").getByTestId("tier-select").selectOption("A");
      await started;

      await newerTab.waitForTimeout(5);
      await chip(newerTab, "MapleE2E").getByTestId("tier-select").selectOption("F");
      await expect(saveStatus(newerTab)).toHaveText("All tiers saved");

      releaseRequest();
      await expect(saveStatus(page)).toHaveText("All tiers saved");
      await page.reload();
      await newerTab.reload();
      await expect(chip(page, "MapleE2E").getByTestId("tier-select")).toHaveValue("F");
      await expect(chip(newerTab, "MapleE2E").getByTestId("tier-select")).toHaveValue("F");

      await chip(newerTab, "MapleE2E").getByTestId("tier-select").selectOption("");
      await expect(saveStatus(newerTab)).toHaveText("All tiers saved");
    } finally {
      releaseRequest();
      await newerTab.close();
    }
  });
});
