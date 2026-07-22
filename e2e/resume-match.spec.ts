import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("two-tier resume fit", () => {
  test("agent-scored job shows fit badge, agent tag and summary", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Frontend Engineer");
    await expect(card).toBeVisible();
    await expect(card).toContainText("fit 90");
    await expect(card).toContainText("agent");
    await expect(card).toContainText(/Excellent fit/i);
  });

  test("deterministic job is labelled auto", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Apply Engineer");
    await expect(card).toBeVisible();
    // Exact score can shift after a re-score pass; the provider label must not.
    await expect(card).toContainText(/fit \d+/);
    await expect(card).toContainText("auto");
  });

  test("Re-score fit recomputes the baseline without error", async ({ page }) => {
    await page.goto("/jobs");

    const rescore = page.getByRole("button", { name: "Re-score fit" });
    await expect(rescore).toBeEnabled();
    await rescore.click();

    // Button returns from its "Re-scoring…" busy label once the pass completes.
    await expect(page.getByRole("button", { name: "Re-score fit" })).toBeEnabled();

    // No error banner, and agent judgements survive a deterministic re-score.
    await expect(page.locator(".bg-red-50")).toHaveCount(0);
    const agentCard = jobCard(page, "E2E Frontend Engineer");
    await expect(agentCard).toContainText("agent");
  });
});
