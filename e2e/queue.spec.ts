import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("time-sorted queue", () => {
  test("newest-first ordering puts a fresh posting above an older one", async ({ page }) => {
    await page.goto("/jobs");

    // Wait for the queue to populate before reading DOM order.
    await expect(page.getByTestId("job-title").first()).toBeVisible();

    // Default sort is "Newest first". Frontend is posted today, Staff 10 days ago.
    const titles = await page.getByTestId("job-title").allInnerTexts();
    const fresh = titles.indexOf("E2E Frontend Engineer");
    const old = titles.indexOf("E2E Staff Engineer");
    expect(fresh).toBeGreaterThanOrEqual(0);
    expect(old).toBeGreaterThan(fresh);
  });

  test("date filter hides postings older than the window", async ({ page }) => {
    await page.goto("/jobs");

    const fresh = jobCard(page, "E2E Frontend Engineer");
    const stale = jobCard(page, "E2E Staff Engineer");

    // All time: both visible.
    await expect(fresh).toBeVisible();
    await expect(stale).toBeVisible();

    // Last 24 hours: the 10-day-old Staff posting drops out.
    await page.getByRole("combobox").first().selectOption("24h");
    await expect(fresh).toBeVisible();
    await expect(stale).toHaveCount(0);

    // A queue count summary is shown.
    await expect(page.getByText(/postings? in queue/)).toBeVisible();
  });
});
