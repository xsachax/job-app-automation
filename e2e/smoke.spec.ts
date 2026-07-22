import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("overview loads with stats and the dry-run safety banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText(/DRY-RUN mode/i)).toBeVisible();
    await expect(page.getByText("Jobs tracked")).toBeVisible();
    await expect(page.getByText("Agent-reviewed")).toBeVisible();
  });

  test("nav to Jobs shows the seeded postings", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(
      page.getByRole("link", { name: "E2E Frontend Engineer", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "E2E Apply Engineer", exact: true }),
    ).toBeVisible();
  });

  test("Workday page lists flagged postings only", async ({ page }) => {
    await page.goto("/workday");
    await expect(page.getByText("Workday (flagged)")).toBeVisible();
    await expect(page.getByText("E2E Workday Engineer")).toBeVisible();
    // Non-workday postings must not leak into this list.
    await expect(page.getByText("E2E Frontend Engineer")).toHaveCount(0);
  });
});
