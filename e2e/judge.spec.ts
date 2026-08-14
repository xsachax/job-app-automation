import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

function judgeStatus(scored: number) {
  const eligible = 7;
  return {
    eligible,
    scored,
    unscored: eligible - scored,
    providerCounts: {
      deterministic: scored,
      copilot: 0,
      openai: 0,
      anthropic: 0,
    },
    providerStatus: {
      provider: "openai",
      model: "gpt-4o-mini",
      hasApiKey: false,
      apiKeyHint: null,
      copilotConnected: false,
      copilotHasPriority: false,
      effectiveProvider: "deterministic",
      enhancedAvailable: false,
      status:
        "No enhanced Judge provider is available; re-runs use the deterministic baseline only.",
    },
    avgScore: scored ? 70 : null,
    lastScoredAt: scored ? "2026-01-01T00:00:01.000Z" : null,
    distribution: {
      strong: scored,
      possible: 0,
      weak: 0,
      unscored: eligible - scored,
    },
    companyTiers: 1,
    locationTiers: 1,
    resume: { url: "", skills: 0, titles: 0, hasSummary: false },
    salaryTarget: null,
  };
}

test.describe("judge hub", () => {
  test("renders the header, axes, and distribution", async ({ page }) => {
    await page.goto("/judge");
    await expect(page.getByRole("heading", { name: "Judge", exact: true })).toBeVisible();

    // Every scoring axis is documented in the "how it's built" table.
    await expect(page.getByRole("cell", { name: "Résumé fit" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Experience", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "Date posted" })).toBeVisible();
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

  test("re-running uses saved résumé text and keeps missing salary out of gaps", async ({
    page,
  }) => {
    await page.goto("/judge");
    await page.getByLabel("Target salary (USD)").fill("125000");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Target salary saved. Re-run the judge to apply it."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Re-run judge" }).click();
    await expect(page.getByText(/Judge complete/)).toBeVisible();
    // After a run the "Last run" tile is no longer "never".
    await expect(page.getByText("never")).toHaveCount(0);

    await page.goto("/jobs");
    const frontend = jobCard(page, "E2E Frontend Engineer");
    const fits = frontend.getByRole("region", { name: "Why it fits" });
    await expect(fits).toContainText(/Matches 3 saved résumé skills/i);
    await expect(fits).toContainText(/TypeScript/i);
    await expect(fits).toContainText(/React/i);
    await expect(fits).toContainText(/Node\.js/i);
    await expect(frontend).not.toContainText(
      "No saved résumé skills directly match the posting",
    );

    const missingSalary = jobCard(page, "E2E Apply Engineer");
    await expect(missingSalary.getByText("Salary unknown", { exact: true })).toBeVisible();
    await expect(
      missingSalary.getByRole("region", { name: "Gaps" }),
    ).not.toContainText(/salary/i);

    await page.evaluate(async () => {
      const criteria = await fetch("/api/criteria").then((response) =>
        response.json(),
      );
      await fetch("/api/criteria", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...criteria, salaryTarget: null }),
      });
    });
  });

  test("shows exact progress while the judge is running", async ({ page }) => {
    let getCount = 0;
    let postComplete = false;
    await page.route("**/api/judge/score", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        postComplete = true;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            scanned: 4,
            scored: 3,
            preservedEnhanced: 1,
            skipped: 0,
            provider: "deterministic",
            enhancedScored: 0,
            enhancedStatus: "unavailable",
            message:
              "Judge complete with deterministic scoring only; enhanced provider scoring is unavailable.",
          }),
        });
        return;
      }

      getCount += 1;
      const processed = Math.min(Math.max(getCount - 1, 0), 4);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          postComplete
            ? {
                running: false,
                phase: "complete",
                processed: 4,
                total: 4,
                scored: 3,
                preservedEnhanced: 1,
                skipped: 0,
                provider: "deterministic",
                currentJob: null,
                message: "Judge complete · 3 scored",
                startedAt: "2026-01-01T00:00:00.000Z",
                finishedAt: "2026-01-01T00:00:01.500Z",
              }
            : {
                running: getCount > 1,
                phase: getCount > 1 ? "baseline" : "idle",
                processed,
                total: getCount > 1 ? 4 : 0,
                scored: Math.max(processed - 1, 0),
                preservedEnhanced: processed > 1 ? 1 : 0,
                skipped: 0,
                provider: "deterministic",
                currentJob: getCount > 1 ? "Acme · Software Engineer I" : null,
                message:
                  getCount > 1
                    ? `Processed ${processed}/4 · Acme · Software Engineer I`
                    : "The judge is idle.",
                startedAt: getCount > 1 ? "2026-01-01T00:00:00.000Z" : null,
                finishedAt: null,
              },
        ),
      });
    });

    await page.goto("/judge");
    await expect.poll(() => getCount).toBe(1);
    await page.getByRole("button", { name: "Re-run judge" }).click();

    const progress = page.getByRole("progressbar", {
      name: "Judge scoring progress",
    });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByText("1/4 · 25%")).toBeVisible();
    await expect(page.getByText(/Judge complete/)).toBeVisible();
    await expect(progress).toHaveCount(0);
  });

  test("refreshes statistics after observing a run started elsewhere", async ({
    page,
  }) => {
    let statusCalls = 0;
    let progressCalls = 0;
    await page.route("**/api/judge/status", async (route) => {
      statusCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(judgeStatus(statusCalls === 1 ? 1 : 7)),
      });
    });
    await page.route("**/api/judge/score", async (route) => {
      progressCalls += 1;
      const running = progressCalls === 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          running,
          phase: running ? "baseline" : "complete",
          processed: running ? 1 : 2,
          total: 2,
          scored: running ? 1 : 2,
          preservedEnhanced: 0,
          skipped: 0,
          provider: "deterministic",
          currentJob: running ? "Acme · Software Engineer I" : null,
          message: running
            ? "Processed 1/2 · Acme · Software Engineer I"
            : "Judge complete · 2 scored",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: running ? null : "2026-01-01T00:00:01.000Z",
        }),
      });
    });

    await page.goto("/judge");
    await expect(page.getByText("1/7", { exact: true })).toBeVisible();
    await expect(page.getByText("7/7", { exact: true })).toBeVisible();
    expect(statusCalls).toBe(2);
  });

  test("refreshes retained baseline status when enhanced scoring fails", async ({
    page,
  }) => {
    let statusCalls = 0;
    await page.route("**/api/judge/status", async (route) => {
      statusCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(judgeStatus(statusCalls === 1 ? 1 : 2)),
      });
    });
    await page.route("**/api/judge/score", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: "OpenAI Judge request failed with HTTP 429.",
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          running: false,
          phase: "idle",
          processed: 0,
          total: 0,
          scored: 0,
          preservedEnhanced: 0,
          skipped: 0,
          provider: "openai",
          currentJob: null,
          message: "The judge is idle.",
          startedAt: null,
          finishedAt: null,
        }),
      });
    });

    await page.goto("/judge");
    await expect(page.getByText("1/7", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Re-run judge" }).click();
    await expect(
      page.getByText("OpenAI Judge request failed with HTTP 429."),
    ).toBeVisible();
    await expect(page.getByText("2/7", { exact: true })).toBeVisible();
    expect(statusCalls).toBeGreaterThanOrEqual(2);
  });

  test("keeps fallback keys masked across reload and reports provider status", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByText("Copilot not marked connected")).toBeVisible();

    await page
      .getByLabel("Enhanced fallback provider")
      .selectOption("openai");
    const key = page.getByLabel("OpenAI API key");
    await key.fill("sk-e2e-offline-key-9876");
    await page.getByRole("button", { name: "Save Judge provider" }).click();
    await expect(
      page.getByText("OpenAI Judge settings saved."),
    ).toBeVisible();
    await expect(key).toHaveValue("");
    await expect(key).toHaveAttribute(
      "placeholder",
      /\*\*\*\*9876 configured/,
    );

    await page.reload();
    await expect(page.getByLabel("OpenAI API key")).toHaveValue("");
    await expect(page.getByLabel("OpenAI API key")).toHaveAttribute(
      "placeholder",
      /\*\*\*\*9876 configured/,
    );
    await expect(
      page.getByText(/OpenAI is the enhanced Judge fallback/),
    ).toBeVisible();

    await page.goto("/judge");
    await expect(
      page.getByRole("heading", { name: "Active Judge path" }),
    ).toBeVisible();
    await expect(
      page.getByText(/OpenAI is the enhanced Judge fallback/),
    ).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Clear API key" }).click();
    await expect(page.getByText("OpenAI API key cleared.")).toBeVisible();
    await expect(
      page.getByText("No key is configured for this provider."),
    ).toBeVisible();
  });
});
