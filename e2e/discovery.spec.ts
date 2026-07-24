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

  test("cards show a company-category badge", async ({ page }) => {
    await page.goto("/jobs");
    const card = jobCard(page, "E2E Frontend Engineer");
    await expect(card).toBeVisible();
    // OpenAI classifies as an AI Lab; AcmeE2E roles are startups.
    await expect(card.getByText("AI Lab", { exact: true })).toBeVisible();
  });

  test("category filter narrows the US list", async ({ page }) => {
    await page.goto("/jobs");
    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(jobCard(page, "E2E Backend Engineer")).toBeVisible();

    // Filter to AI Lab: keeps the OpenAI role, drops the AcmeE2E (startup) ones.
    await page.getByRole("button", { name: /^AI Lab/ }).click();

    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "E2E Backend Engineer", exact: true }),
    ).toHaveCount(0);
  });
});
