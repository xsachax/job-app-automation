import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("job card enrichment + applied tracking", () => {
  test("enriched cards show fit and salary signals", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Frontend Engineer");
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Judge score 88 out of 100")).toBeVisible();
    await expect(card).toHaveClass(/border-emerald-300/);
    await expect(card.getByRole("heading", { name: "Why it fits" })).toBeVisible();
    await expect(card.getByRole("heading", { name: "Gaps" })).toBeVisible();
    await expect(card.getByText(/Matches résumé skills/)).toBeVisible();
    await expect(card.getByText(/team-specific experience requirements/)).toBeVisible();
    // Salary enrichment renders on the card face.
    await expect(card.getByText(/\$120k.150k/)).toBeVisible();
    // Skills are not surfaced on the card.
    await expect(card.getByText("Node.js", { exact: true })).toHaveCount(0);
  });

  test("fit bands tint the entire card", async ({ page }) => {
    await page.goto("/jobs");

    await expect(jobCard(page, "E2E Apply Engineer")).toHaveClass(
      /border-amber-300/,
    );
    await expect(jobCard(page, "E2E Staff Engineer")).toHaveClass(
      /border-gray-200/,
    );
  });

  test("judge guidance stays usable at narrow widths", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Frontend Engineer");
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(650);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("marking a job applied updates its status, then can be cleared", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Frontend Engineer");

    // Normalize to a known clean state (reruns reuse the local server + db).
    const clearBtn = card.getByRole("button", { name: "Clear", exact: true });
    if (await clearBtn.count()) await clearBtn.click();
    await expect(card.getByText("applied", { exact: true })).toHaveCount(0);

    await card.getByRole("button", { name: "Mark applied" }).click();

    // Applied badge appears and the action becomes unavailable.
    await expect(card.getByText("applied", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Mark applied" })).toBeDisabled();

    // Clean up so the fixture is reusable on the next run.
    await card.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(card.getByText("applied", { exact: true })).toHaveCount(0);
  });

  test("minimum-fit filter drops lower-scored postings", async ({ page }) => {
    await page.goto("/jobs");

    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(jobCard(page, "E2E Apply Engineer")).toBeVisible();

    // Require fit >= 70: the 64-fit Apply role drops, the 88-fit Frontend stays.
    await page.locator('label:has-text("Min fit")').locator("select").selectOption("70");

    await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();
    await expect(jobCard(page, "E2E Apply Engineer")).toHaveCount(0);
  });
});
