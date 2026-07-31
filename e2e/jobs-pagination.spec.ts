import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";

// Build N synthetic discovery jobs so we can exercise the Jobs list pager without
// bloating the shared seed. Only the fields the card actually reads need to be
// realistic; the rest are valid empty defaults.
function makeJobs(n: number) {
  const now = new Date().toISOString();
  return Array.from({ length: n }, (_, i) => ({
    id: `pager-${i}`,
    title: `Pager Role ${i}`,
    company: `PagerCo ${i}`,
    location: "Remote, US",
    applyUrl: `https://boards.greenhouse.io/pagerco/jobs/${i}`,
    atsType: "greenhouse",
    remote: true,
    country: "US",
    category: "startup",
    minYoE: 0,
    discoverySystem: "greenhouse",
    postedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    applicationStatus: "none",
    appliedAt: null,
    fitScore: null,
    fitProvider: null,
    fitSummary: null,
    fitReasons: [],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryRaw: null,
    sponsorship: null,
    skills: [],
    employmentType: null,
    sightings: [],
  }));
}

// Match the discovery list request only (not /api/jobs/facets).
function isDiscoveryJobs(url: URL) {
  return url.pathname === "/api/jobs" && url.searchParams.get("view") === "discovery";
}

test.describe("jobs list pagination", () => {
  test("renders one page at a time and reveals more on demand", async ({ page }) => {
    const jobs = makeJobs(70);
    await page.route(
      (url) => isDiscoveryJobs(url),
      (route: Route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobs) }),
    );

    await page.goto("/jobs");
    await expect(page.getByRole("article").first()).toBeVisible();

    // First page caps the DOM at 60 cards even though 70 exist.
    await expect(page.getByRole("article")).toHaveCount(60);
    await expect(page.getByTestId("show-more-count")).toHaveText("Showing 60 of 70");

    // Show more reveals the rest and then hides the control.
    await page.getByTestId("show-more").click();
    await expect(page.getByRole("article")).toHaveCount(70);
    await expect(page.getByTestId("show-more")).toHaveCount(0);
  });

  test("select all applies to the visible page only", async ({ page }) => {
    const jobs = makeJobs(70);
    await page.route(
      (url) => isDiscoveryJobs(url),
      (route: Route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobs) }),
    );

    await page.goto("/jobs");
    await expect(page.getByRole("article").first()).toBeVisible();

    // Selecting all picks the 60 visible cards, not the full 70.
    await page.getByTestId("select-all").check();
    await expect(page.getByTestId("selected-count")).toHaveText("60 selected");

    // Revealing more keeps the earlier selection; the new page starts unselected.
    await page.getByTestId("show-more").click();
    await expect(page.getByRole("article")).toHaveCount(70);
    await expect(page.getByTestId("selected-count")).toHaveText("60 selected");

    // A second select-all now adds the freshly revealed cards.
    await page.getByTestId("select-all").check();
    await expect(page.getByTestId("selected-count")).toHaveText("70 selected");
  });
});
