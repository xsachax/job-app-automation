import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("US / CA discovery lists", () => {
  test("US tab shows US roles and hides Canadian ones", async ({ page }) => {
    await page.goto("/jobs");

    // Default tab is United States.
    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Canada Engineer", exact: true })).toHaveCount(0);
  });

  test("switching to Canada shows only Canadian roles", async ({ page }) => {
    await page.goto("/jobs");

    await page.getByRole("button", { name: "Canada" }).click();

    await expect(jobCard(page, "E2E Canada Engineer")).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Frontend Engineer", exact: true })).toHaveCount(0);
  });

  test("a queue count is shown for each list", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByText(/postings? in queue/)).toBeVisible();
  });
});
