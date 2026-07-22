import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("overview loads with discovery stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText(/Discovery mode/i)).toBeVisible();
    await expect(page.getByText("US entry-level")).toBeVisible();
    await expect(page.getByText("CA entry-level")).toBeVisible();
    await expect(page.getByText("Companies covered")).toBeVisible();
  });

  test("nav to Jobs shows the seeded US postings", async ({ page }) => {
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

  test("Companies page lists API and browser sources", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.getByRole("heading", { name: "Companies" })).toBeVisible();
    await expect(page.getByText("API sources")).toBeVisible();
    await expect(page.getByText("Browser-scraped sources")).toBeVisible();
  });

  test("Workday page lists flagged postings only", async ({ page }) => {
    await page.goto("/workday");
    await expect(page.getByText("Workday (flagged)")).toBeVisible();
    await expect(page.getByText("E2E Workday Engineer")).toBeVisible();
    // Non-workday postings must not leak into this list.
    await expect(page.getByText("E2E Frontend Engineer")).toHaveCount(0);
  });
});
