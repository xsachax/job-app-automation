import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("LinkedIn warm-intro tagging", () => {
  test("the OpenAI card shows a connections badge", async ({ page }) => {
    await page.goto("/jobs");
    const card = jobCard(page, "E2E Frontend Engineer");
    await expect(card).toBeVisible();
    await expect(card.getByText(/8 connections/)).toBeVisible();
  });

  test("hovering the badge shows connection names and roles", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const card = jobCard(page, "E2E Frontend Engineer");
    await card.getByTestId("connections-badge").hover();

    const tooltip = card.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Ada Lovelace");
    await expect(tooltip).toContainText("Research Engineer");
    await expect(tooltip).toContainText("Alan Turing");
    await expect(tooltip).toContainText("Member of Technical Staff");
    await expect(tooltip).toContainText("Edsger Dijkstra");
    await expect(tooltip).toContainText("Computer Scientist");
  });

  test("an unmatched company has no connections badge", async ({ page }) => {
    await page.goto("/jobs");
    const card = jobCard(page, "E2E Backend Engineer"); // AcmeE2E — no connections
    await expect(card).toBeVisible();
    await expect(card.getByText(/connection/)).toHaveCount(0);
  });

  test("the warm-intro filter keeps only jobs with connections", async ({ page }) => {
    await page.goto("/jobs");
    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(jobCard(page, "E2E Backend Engineer")).toBeVisible();

    await page.getByRole("button", { name: /Warm intro/ }).click();

    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "E2E Backend Engineer", exact: true }),
    ).toHaveCount(0);
  });
});
