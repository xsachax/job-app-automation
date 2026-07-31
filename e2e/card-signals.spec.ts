import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("job card country + sponsorship signals", () => {
  test("US cards show the United States flag", async ({ page }) => {
    await page.goto("/jobs");
    const card = jobCard(page, "E2E Frontend Engineer");
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: "United States" })).toBeVisible();
  });

  test("Canadian cards show the Canada flag", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("button", { name: "Canada" }).click();
    const card = jobCard(page, "E2E Canada Engineer");
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: "Canada" })).toBeVisible();
  });

  test("a posting that states sponsorship shows the matching tag", async ({ page }) => {
    await page.goto("/jobs");
    // Seeded with sponsorship: "offers".
    await expect(
      jobCard(page, "E2E Frontend Engineer").getByText("sponsors visa", { exact: true }),
    ).toBeVisible();
    // Seeded with sponsorship: "none".
    await expect(
      jobCard(page, "E2E Backend Engineer").getByText("no sponsorship", { exact: true }),
    ).toBeVisible();
  });

  test("postings with missing salary or sponsorship fall back to unknown tags", async ({ page }) => {
    await page.goto("/jobs");
    // E2E Apply Engineer is seeded without a sponsorship value…
    await expect(
      jobCard(page, "E2E Apply Engineer").getByText("sponsorship unknown", { exact: true }),
    ).toBeVisible();
    // …and without a salary, so the salary slot stays aligned with an unknown tag.
    await expect(
      jobCard(page, "E2E Apply Engineer").getByText("Salary unknown", { exact: true }),
    ).toBeVisible();
  });
});
