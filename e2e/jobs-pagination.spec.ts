import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";
import { makeDiscoveryJobs as makeJobs } from "./helpers";

// Match the discovery list request only (not /api/jobs/facets).
function isDiscoveryJobs(url: URL) {
  return url.pathname === "/api/jobs" && url.searchParams.get("view") === "discovery";
}

test.describe("jobs list pagination", () => {
  test("keeps the first scroll gesture responsive while cards render", async ({ page }) => {
    const jobs = makeJobs(60).map((job) => ({
      ...job,
      fitScore: 95,
      fitProvider: "agent",
      fitSummary:
        "Strong candidate fit based on directly relevant product engineering experience.",
      fitReasons: [
        "Fit: TypeScript and React experience",
        "Fit: Product engineering background",
        "Fit: Cross-functional collaboration",
        "Fit: Customer-facing systems delivery",
        "Gap: Confirm domain-specific compliance experience",
        "Gap: Limited direct industry exposure",
      ],
      isGolden: true,
      goldenMatch: { field: "title", keyword: "Role" },
    }));
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await page.addInitScript(() => {
      window.addEventListener(
        "wheel",
        () => sessionStorage.setItem("first-wheel-at", String(Date.now())),
        { once: true, passive: true },
      );
    });

    let releaseResponse = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let markRequestStarted = () => {};
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    let responseFulfilledAt = 0;

    await page.route(
      (url) => isDiscoveryJobs(url),
      async (route: Route) => {
        markRequestStarted();
        await responseGate;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(jobs),
        });
        responseFulfilledAt = Date.now();
        setTimeout(() => {
          void client.send("Input.dispatchMouseEvent", {
            type: "mouseWheel",
            x: 1100,
            y: 700,
            deltaX: 0,
            deltaY: 650,
          });
        }, 25);
      },
    );

    await page.goto("/jobs");
    await requestStarted;
    await page.waitForTimeout(200);
    releaseResponse();

    await page.waitForFunction(
      () => sessionStorage.getItem("first-wheel-at") !== null,
    );
    await expect(page.getByRole("article")).toHaveCount(60);

    const firstWheelAt = await page.evaluate(() =>
      Number(sessionStorage.getItem("first-wheel-at")),
    );
    expect(firstWheelAt - responseFulfilledAt).toBeLessThan(500);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

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
