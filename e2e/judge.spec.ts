import { test, expect } from "@playwright/test";

test.describe("judge hub", () => {
  test("renders the header, axes, and distribution", async ({ page }) => {
    await page.goto("/judge");
    await expect(page.getByRole("heading", { name: "Judge", exact: true })).toBeVisible();

    // The four scoring axes are documented in the "how it's built" table.
    await expect(page.getByRole("cell", { name: "Résumé fit" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Company tier" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Location tier" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Pay vs. target" })).toBeVisible();

    // Distribution legend renders every band.
    await expect(page.getByRole("heading", { name: "Fit distribution" })).toBeVisible();
    await expect(page.getByText("Strong fit", { exact: true })).toBeVisible();
    await expect(page.getByText("Possible fit", { exact: true })).toBeVisible();
    await expect(page.getByText("Weak fit", { exact: true })).toBeVisible();
  });

  test("links out to both tier lists and the profile", async ({ page }) => {
    await page.goto("/judge");
    await expect(page.getByRole("link", { name: "Open company tiers →" })).toHaveAttribute("href", "/tiers");
    await expect(page.getByRole("link", { name: "Open location tiers →" })).toHaveAttribute("href", "/location-tiers");
    await expect(page.getByRole("link", { name: "Edit in Profile →" })).toHaveAttribute("href", "/profile");
  });

  test("saving a target salary persists across reload", async ({ page }) => {
    await page.goto("/judge");
    const salary = page.getByLabel("Target salary (USD)");
    await salary.fill("125000");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Target salary saved. Re-run the judge to apply it.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Target salary (USD)")).toHaveValue("125000");

    // Restore to unset so later specs start clean.
    await page.getByLabel("Target salary (USD)").fill("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Target salary saved. Re-run the judge to apply it.")).toBeVisible();
  });

  test("re-running the judge scores the eligible postings", async ({ page }) => {
    await page.goto("/judge");
    await page.getByRole("button", { name: "Re-run judge" }).click();
    await expect(page.getByText(/Re-ran across all axes/)).toBeVisible();
    // After a run the "Last run" tile is no longer "never".
    await expect(page.getByText("never")).toHaveCount(0);
  });
});
