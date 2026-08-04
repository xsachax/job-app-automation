import { test, expect } from "@playwright/test";

test.describe("profile page", () => {
  test("features a GitHub résumé link field", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Resume source" })).toBeVisible();
    await expect(
      page.getByPlaceholder("https://github.com/you/resume/blob/main/resume.md"),
    ).toBeVisible();
    // The judge signals the profile actually feeds.
    await expect(page.getByRole("heading", { name: "Judge signals" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Software Engineer, Full-stack Developer"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("TypeScript, React, Python, SQL")).toBeVisible();
  });

  test("no longer collects personal contact info", async ({ page }) => {
    await page.goto("/profile");
    // The old "Contact & application details" section is gone…
    await expect(page.getByText("Contact & application details")).toHaveCount(0);
    // …and its fields are not rendered.
    await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
    await expect(page.getByPlaceholder("+1 555 0100")).toHaveCount(0);
    await expect(page.getByPlaceholder("City, country")).toHaveCount(0);
  });
});
