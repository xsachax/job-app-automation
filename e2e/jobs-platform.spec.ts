import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

// Workday postings used to live on their own page; they are now merged into the
// unified Jobs queue, badged, and filterable via the "Platform" facet.
test.describe("merged jobs list + platform filter", () => {
  test("Workday postings are badged and use a Workday-specific open label", async ({ page }) => {
    await page.goto("/jobs");

    const workday = jobCard(page, "E2E Workday Engineer");
    await expect(workday).toBeVisible();
    await expect(workday.getByTestId("workday-badge")).toBeVisible();
    await expect(workday.getByRole("link", { name: /Open on Workday/ })).toBeVisible();

    // Easy-apply postings live in the same list, without the badge, and keep the
    // plain open label.
    const frontend = jobCard(page, "E2E Frontend Engineer");
    await expect(frontend).toBeVisible();
    await expect(frontend.getByTestId("workday-badge")).toHaveCount(0);
    await expect(frontend.getByRole("link", { name: "Open ↗", exact: true })).toBeVisible();
  });

  test("the Platform filter narrows the queue to a single ATS", async ({ page }) => {
    await page.goto("/jobs");

    const workday = jobCard(page, "E2E Workday Engineer");
    const frontend = jobCard(page, "E2E Frontend Engineer");
    await expect(workday).toBeVisible();
    await expect(frontend).toBeVisible();

    // Pick the Workday platform chip (label + count => accessible name "Workday 1").
    // Scope to the Platform facet group — "Workday" is also a Source value.
    await page.getByTestId("facet-platform").getByRole("button", { name: /^Workday\b/ }).click();

    // Only the Workday posting survives; the Greenhouse Frontend role drops out.
    await expect(workday).toBeVisible();
    await expect(frontend).toHaveCount(0);

    // Clearing filters brings the full queue back.
    await page.getByRole("button", { name: /Clear filters/ }).click();
    await expect(frontend).toBeVisible();
  });

  test("Platform and Source are offered as distinct filter groups", async ({ page }) => {
    await page.goto("/jobs");
    // Wait for facets to hydrate the filter bar.
    const platform = page.getByTestId("facet-platform");
    const source = page.getByTestId("facet-source");
    await expect(platform).toBeVisible();
    await expect(source).toBeVisible();
    // Platform is the ATS facet: it offers Greenhouse and Workday.
    await expect(platform.getByRole("button", { name: /^Greenhouse\b/ })).toBeVisible();
    await expect(platform.getByRole("button", { name: /^Workday\b/ })).toBeVisible();
  });
});
