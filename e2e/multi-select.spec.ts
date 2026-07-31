import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("multi-select + open selected", () => {
  test("the open button is disabled until a posting is selected", async ({ page }) => {
    await page.goto("/jobs");
    const openBtn = page.getByTestId("open-selected");
    await expect(openBtn).toBeVisible();
    await expect(openBtn).toBeDisabled();
    await expect(page.getByTestId("selected-count")).toHaveText("0 selected");
  });

  test("selecting cards updates the count and enables the open button", async ({ page }) => {
    await page.goto("/jobs");

    const frontend = jobCard(page, "E2E Frontend Engineer");
    const backend = jobCard(page, "E2E Backend Engineer");
    await frontend.getByTestId("job-select").check();
    await backend.getByTestId("job-select").check();

    await expect(page.getByTestId("selected-count")).toHaveText("2 selected");
    const openBtn = page.getByTestId("open-selected");
    await expect(openBtn).toBeEnabled();
    await expect(openBtn).toHaveText(/Open 2 selected/);

    // Clear resets the selection.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByTestId("selected-count")).toHaveText("0 selected");
    await expect(openBtn).toBeDisabled();
  });

  test("select all toggles every visible posting", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByRole("article").first()).toBeVisible();
    const total = await page.getByRole("article").count();
    expect(total).toBeGreaterThan(0);

    await page.getByTestId("select-all").check();
    await expect(page.getByTestId("selected-count")).toHaveText(`${total} selected`);

    await page.getByTestId("select-all").uncheck();
    await expect(page.getByTestId("selected-count")).toHaveText("0 selected");
  });

  test("opening the selection opens one tab per selected posting", async ({ page }) => {
    await page.goto("/jobs");

    // Stub window.open so the assertion is deterministic and no real external
    // tabs are launched during the run; record the URLs the handler requests.
    await page.evaluate(() => {
      (window as unknown as { __opened: string[] }).__opened = [];
      window.open = ((url?: string | URL) => {
        (window as unknown as { __opened: string[] }).__opened.push(String(url));
        return { opener: null } as unknown as Window;
      }) as typeof window.open;
    });

    await jobCard(page, "E2E Frontend Engineer").getByTestId("job-select").check();
    await jobCard(page, "E2E Backend Engineer").getByTestId("job-select").check();

    await page.getByTestId("open-selected").click();

    const opened = await page.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    );
    expect(opened).toHaveLength(2);
    expect(opened).toContain("https://boards.greenhouse.io/acmee2e/jobs/frontend");
    expect(opened).toContain("https://boards.greenhouse.io/acmee2e/jobs/reject");
  });
});
