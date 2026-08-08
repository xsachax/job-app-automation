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
        warnings: 0,
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

test("scrape summary distinguishes failed and partial sources", async ({
  page,
}) => {
  await page.route("**/api/discovery/run", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          durationMs: 2_000,
          totals: {
            sources: 3,
            created: 2,
            updated: 8,
            usEntry: 1,
            caEntry: 1,
            errors: 1,
            warnings: 2,
            suspect: 0,
            closed: 1,
          },
          api: {
            companies: [
              { company: "Microsoft", error: "HTTP 429" },
              {
                company: "Y Combinator",
                sourceComplete: false,
                warning: "one board subrequest failed",
              },
            ],
          },
          browser: [
            {
              company: "Apple",
              sourceComplete: false,
              warning: "CA pagination stopped after page 2",
            },
          ],
          judge: { scored: 2 },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        running: false,
        phase: "complete",
        completedSteps: 5,
        totalSteps: 5,
        completedSources: 3,
        totalSources: 3,
        currentSource: null,
        message: "Scrape complete.",
        errors: 1,
        warnings: 2,
        startedAt: "2026-08-08T01:00:00.000Z",
        finishedAt: "2026-08-08T01:00:02.000Z",
        nextAllowedAt: null,
      }),
    });
  });

  await page.goto("/jobs");
  await page.getByRole("button", { name: "Run scrape" }).click();

  await expect(
    page.getByText(
      /failed: Microsoft · partial: Y Combinator, Apple/,
    ),
  ).toBeVisible();
  await page.getByText("Source issue details").click();
  await expect(page.getByText("Microsoft: HTTP 429")).toBeVisible();
  await expect(
    page.getByText("Y Combinator (partial): one board subrequest failed"),
  ).toBeVisible();
});
