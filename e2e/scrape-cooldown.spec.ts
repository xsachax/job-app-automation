import { expect, test } from "@playwright/test";

test("scrape control counts down and unlocks without a refresh", async ({
  page,
}) => {
  const nextAllowedAt = new Date(Date.now() + 4_000).toISOString();
  let postRequests = 0;
  await page.route("**/api/discovery/run", async (route) => {
    if (route.request().method() === "POST") {
      postRequests += 1;
      await route.fulfill({ status: 500, body: "unexpected scrape" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        running: false,
        phase: "complete",
        completedSteps: 82,
        totalSteps: 82,
        completedSources: 81,
        totalSources: 81,
        currentSource: null,
        message: "Scrape complete.",
        errors: 0,
        startedAt: "2026-08-08T01:00:00.000Z",
        finishedAt: "2026-08-08T01:03:00.000Z",
        nextAllowedAt,
      }),
    });
  });

  await page.goto("/jobs");
  const button = page.getByRole("button", { name: /Run scrape/ });
  await expect(button).toHaveText(/Run scrape in /);
  await expect(button).toBeDisabled();
  await expect(page.getByText("2-hour scrape cooldown")).toBeVisible();

  await expect(button).toHaveText("Run scrape", { timeout: 7_000 });
  await expect(button).toBeEnabled();
  expect(postRequests).toBe(0);
});
