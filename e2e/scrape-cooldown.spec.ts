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
        outcomes: {
          complete: 81,
          degraded: 0,
          limited: 0,
          failed: 0,
        },
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
  await expect(
    page.getByText("2-hour cooldown after a successful scrape"),
  ).toBeVisible();

  await expect(button).toHaveText("Run scrape", { timeout: 7_000 });
  await expect(button).toBeEnabled();
  expect(postRequests).toBe(0);
});

test("scrape summary separates failed, degraded, and intentionally limited sources", async ({
  page,
}) => {
  const completeSources = Array.from({ length: 64 }, (_, index) => ({
    company: `Complete Source ${index + 1}`,
    observedCount: 10,
    outcome: "complete",
    reason: "complete source response",
  }));
  const limitedApiDefinitions = [
    ["Amazon", 409],
    ["Netflix", 18],
    ["Snap", 180],
    ["Intuit", 389],
    ["Adobe", 100],
    ["Salesforce", 100],
    ["NVIDIA", 100],
    ["Zoom", 34],
    ["Cisco", 56],
  ] as const;
  const limitedApiSources = limitedApiDefinitions.map(
    ([company, observedCount]) => ({
      company,
      observedCount,
      outcome: "limited",
      reason: "search-limited by design; absence is not authoritative",
    }),
  );
  const nonAuthoritativeDefinitions = [
    ["GitHub", 78],
    ["Rivian", 153],
    ["Spotify", 91],
    ["SimplifyJobs New-Grad", 2649],
    ["vanshb03 New-Grad-2026", 635],
  ] as const;
  const nonAuthoritativeSources = nonAuthoritativeDefinitions.map(
    ([company, observedCount]) => ({
      company,
      observedCount,
      outcome: "limited",
      reason:
        "non-authoritative by design; absence is not closure evidence",
    }),
  );
  let postPending = false;
  await page.route("**/api/discovery/run", async (route) => {
    if (route.request().method() === "POST") {
      postPending = true;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      postPending = false;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          durationMs: 2_000,
          totals: {
            sources: 83,
            created: 2,
            updated: 8,
            usEntry: 1,
            caEntry: 1,
            outcomes: {
              complete: 64,
              degraded: 2,
              limited: 16,
              failed: 1,
            },
            suspect: 0,
            closed: 1,
          },
          api: {
            companies: [
              {
                company: "Uber",
                observedCount: 0,
                outcome: "failed",
                reason: "HTTP 404",
              },
              {
                company: "Microsoft",
                observedCount: 50,
                outcome: "degraded",
                reason:
                  "partial source response: Microsoft pagination stopped after 50 postings: HTTP 429",
              },
              {
                company: "Y Combinator",
                observedCount: 1433,
                outcome: "degraded",
                reason:
                  "partial source response: 27 non-fatal subrequest warnings",
              },
              ...limitedApiSources,
              ...nonAuthoritativeSources,
              ...completeSources,
            ],
          },
          browser: [
            {
              company: "Apple",
              observedCount: 25,
              outcome: "limited",
              reason: "search-limited by design; absence is not authoritative",
            },
            {
              company: "Shopify",
              observedCount: 44,
              outcome: "limited",
              reason: "search-limited by design; absence is not authoritative",
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
        running: postPending,
        phase: postPending ? "browser" : "complete",
        completedSteps: postPending ? 81 : 85,
        totalSteps: 85,
        completedSources: postPending ? 81 : 83,
        totalSources: 83,
        currentSource: postPending ? "Y Combinator" : null,
        message: postPending
          ? "API sources 81/81 · Y Combinator"
          : "Scrape complete.",
        outcomes: postPending
          ? {
              complete: 64,
              degraded: 2,
              limited: 14,
              failed: 1,
            }
          : {
              complete: 64,
              degraded: 2,
              limited: 16,
              failed: 1,
            },
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
      /API sources 81\/81 · Y Combinator · 64 complete · 1 failed · 2 degraded · 14 limited/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /64 complete · failed 1: Uber · degraded 2: Microsoft, Y Combinator · limited 16: Amazon, Netflix, Snap, Intuit, Adobe, Salesforce, \+10 more/,
    ),
  ).toBeVisible();
  await page.getByText("Source outcome details").click();
  await expect(page.getByText("Failed (1)")).toBeVisible();
  await expect(page.getByText("Degraded (2)")).toBeVisible();
  await expect(page.getByText("Limited by design (16)")).toBeVisible();
  await expect(page.getByText("Uber (0 observed): HTTP 404")).toBeVisible();
  await expect(
    page.getByText(
      "Microsoft (50 observed): partial source response: Microsoft pagination stopped after 50 postings: HTTP 429",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Y Combinator (1433 observed): partial source response: 27 non-fatal subrequest warnings",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Amazon (409 observed): search-limited by design; absence is not authoritative",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Apple (25 observed): search-limited by design; absence is not authoritative",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "GitHub (78 observed): non-authoritative by design; absence is not closure evidence",
    ),
  ).toBeVisible();
});
