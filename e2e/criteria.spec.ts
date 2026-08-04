import { test, expect } from "@playwright/test";

test.describe("criteria page", () => {
  test("exposes a target-salary field that persists across reload", async ({ page }) => {
    await page.goto("/criteria");

    await expect(page.getByText("Target salary (USD)")).toBeVisible();
    const salary = page.getByPlaceholder("e.g. 110000");
    await expect(salary).toBeVisible();

    await salary.fill("125000");
    await page.getByRole("button", { name: "Save criteria" }).click();
    await expect(page.getByText("Criteria saved", { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.getByPlaceholder("e.g. 110000")).toHaveValue("125000");
  });
});
