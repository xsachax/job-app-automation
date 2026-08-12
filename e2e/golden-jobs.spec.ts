import { expect, test } from "@playwright/test";
import { jobCard } from "./helpers";

interface ConfigResponse {
  config: Record<string, unknown>;
}

let originalConfig: Record<string, unknown>;

test.describe("golden jobs", () => {
  test.beforeEach(async ({ request }) => {
    const response = await request.get("/api/config");
    expect(response.ok()).toBe(true);
    originalConfig = ((await response.json()) as ConfigResponse).config;
  });

  test.afterEach(async ({ request }) => {
    const response = await request.put("/api/config", {
      data: originalConfig,
    });
    expect(response.ok()).toBe(true);
  });

  test("Settings persists normalized editable matcher options", async ({
    page,
    request,
  }) => {
    await page.goto("/settings");

    const section = page.getByTestId("golden-job-settings");
    await expect(
      section.getByRole("heading", { name: "Golden jobs" }),
    ).toBeVisible();
    await expect(
      section.getByText("95+ after Judge", { exact: true }),
    ).toBeVisible();

    await page
      .getByLabel("Golden title keywords")
      .fill(" Campus-Launch\n2027\ncampus launch ");
    await page
      .getByLabel("Golden description phrases")
      .fill(" Class_of_2027 ");
    await section.getByRole("button", { name: "Save Golden jobs" }).click();
    await expect(
      page.getByText(
        "Golden job settings saved. Filtering updates immediately; rerun Judge to refresh scores.",
      ),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Golden title keywords")).toHaveValue(
      "campus launch, 2027",
    );
    await expect(page.getByLabel("Golden description phrases")).toHaveValue(
      "class of 2027",
    );

    const response = await request.get("/api/config");
    const body = (await response.json()) as {
      config: {
        goldenJobs: {
          enabled: boolean;
          titleKeywords: string[];
          descriptionKeywords: string[];
        };
      };
    };
    expect(body.config.goldenJobs).toEqual({
      enabled: true,
      titleKeywords: ["campus launch", "2027"],
      descriptionKeywords: ["class of 2027"],
    });
  });

  test("Golden filter and every normal sort keep golden matches first", async ({
    page,
  }) => {
    await page.goto("/jobs");

    const firstTitle = page.getByTestId("job-title").first();
    await expect(firstTitle).toHaveText("E2E 2027 Graduate Engineer");
    await expect(page.getByTestId("golden-filter")).toHaveText(
      "Golden only (1)",
    );

    const sort = page.locator('label:has-text("Sort")').locator("select");
    for (const option of ["company", "fit", "salary"]) {
      await sort.selectOption(option);
      await expect(firstTitle).toHaveText("E2E 2027 Graduate Engineer");
    }

    await page.getByTestId("golden-filter").click();
    await expect(
      jobCard(page, "E2E 2027 Graduate Engineer"),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(
      page.getByRole("link", {
        name: "E2E Exceptional Engineer",
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("all 95+ cards use blue Golden styling and reduced motion while lower scores do not", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/jobs");

    const keywordGolden = jobCard(page, "E2E 2027 Graduate Engineer");
    const scoreOnlyGolden = jobCard(page, "E2E Exceptional Engineer");
    const lowerScore = jobCard(page, "E2E Frontend Engineer");

    await expect(keywordGolden).toHaveAttribute("data-score-style", "blue");
    await expect(keywordGolden).toHaveClass(/border-blue-400/);
    await expect(keywordGolden.getByTestId("judge-score")).toHaveClass(
      /bg-blue-100/,
    );
    await expect(keywordGolden.getByTestId("golden-match-badge")).toHaveClass(
      /bg-blue-100/,
    );
    await expect(scoreOnlyGolden).toHaveAttribute(
      "data-score-style",
      "blue",
    );
    await expect(scoreOnlyGolden.getByTestId("golden-match-badge")).toHaveCount(
      0,
    );
    await expect(lowerScore).toHaveAttribute(
      "data-score-style",
      "standard",
    );
    await expect(
      scoreOnlyGolden
        .getByTestId("judge-score")
        .getByText("Golden fit", { exact: true }),
    ).toBeVisible();

    expect(
      await scoreOnlyGolden.evaluate(
        (element) =>
          getComputedStyle(element, "::after").animationName,
      ),
    ).toBe("none");
    expect(
      await scoreOnlyGolden.evaluate(
        (element) => getComputedStyle(element).overflow,
      ),
    ).toBe("visible");
  });
});
