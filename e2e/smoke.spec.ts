import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("overview loads with discovery stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText(/Discovery mode/i)).toBeVisible();
    await expect(page.getByText("US queue")).toBeVisible();
    await expect(page.getByText("Canada queue")).toBeVisible();
    await expect(
      page.getByText(/Open roles matching Software Engineer/).first(),
    ).toBeVisible();
    await expect(page.getByText(/United States and Canada/)).toHaveCount(0);
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
    await expect(
      page.getByText(/Open roles matching Software Engineer/),
    ).toBeVisible();
    await expect(page.getByText("API sources")).toBeVisible();
    await expect(page.getByText("Browser-scraped sources")).toBeVisible();
  });

  test("Settings previews the saved discovery scope", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Current draft:")).toBeVisible();
    await expect(
      page.getByText(/Required experience is capped at 2 years/),
    ).toBeVisible();

    await page.getByLabel("Maximum required years of experience").fill("1");
    await page.getByLabel("Include internships and co-ops").check();
    await expect(
      page.getByText(/Required experience is capped at 1 year/),
    ).toBeVisible();
    await expect(
      page.getByText(/Internships and co-ops are included/),
    ).toBeVisible();
  });

  test("Jobs list includes Workday postings inline with a badge", async ({ page }) => {
    await page.goto("/jobs");
    // Workday roles are no longer a separate page — they appear in the unified
    // queue, badged, alongside the easy-apply ATS postings.
    await expect(
      page.getByRole("link", { name: "E2E Workday Engineer", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("workday-badge").first()).toBeVisible();
    // And the easy-apply postings are still there in the same list.
    await expect(
      page.getByRole("link", { name: "E2E Frontend Engineer", exact: true }),
    ).toBeVisible();
  });
});
