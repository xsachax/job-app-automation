import { expect, test } from "@playwright/test";
import { makeDiscoveryJobs } from "./helpers";

test("stacks preserve individual actions and never bulk-open hidden members", async ({ page }) => {
  const jobs = makeDiscoveryJobs(5);
  for (const index of [0, 1, 2, 3]) jobs[index].company = "StackCo";
  jobs[0].title = "Software Engineer - Backend";
  jobs[1].title = "Backend Software Engineer";
  jobs[2].title = "SWE, Back-end";
  jobs[3].title = "Frontend Software Engineer";
  jobs[4].title = jobs[0].title;
  await page.route((url) => url.pathname === "/api/jobs", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")?.toLowerCase();
    return route.fulfill({ json: q ? jobs.filter((job) => job.title.toLowerCase().includes(q)) : jobs });
  });
  await page.route("**/api/jobs/pager-1", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    const body = route.request().postDataJSON();
    expect(body).toEqual({ applicationStatus: "saved" });
    await route.fulfill({ json: { ...jobs[1], applicationStatus: "saved" } });
  });
  await page.goto("/jobs");
  await expect(page.getByLabel("Stack similar roles")).toBeChecked();
  await expect(page.getByRole("article")).toHaveCount(3);
  const stack = page.getByTestId("job-stack");
  const toggle = stack.getByRole("button", { name: /3 similar roles at StackCo/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("select-all").check();
  await expect(page.getByTestId("selected-count")).toHaveText("3 selected");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("article")).toHaveCount(5);
  const second = stack.getByRole("article").nth(1);
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(stack.getByRole("article").first().getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await page.getByTestId("select-all").check();
  await expect(page.getByTestId("selected-count")).toHaveText("5 selected");
  await toggle.click();
  await expect(page.getByTestId("selected-count")).toHaveText("3 selected");

  await page.evaluate(() => {
    window.open = (url) => {
      const opened: string[] = JSON.parse(sessionStorage.getItem("opened-jobs") ?? "[]");
      opened.push(String(url));
      sessionStorage.setItem("opened-jobs", JSON.stringify(opened));
      return null;
    };
  });
  await page.getByTestId("open-selected").click();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("opened-jobs") ?? "[]")))
    .toEqual([jobs[0].applyUrl, jobs[3].applyUrl, jobs[4].applyUrl]);

  await page.getByLabel("Stack similar roles").uncheck();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByTestId("job-stack")).toHaveCount(0);
  await page.getByLabel("Stack similar roles").check();
  await page.getByPlaceholder("Search title or company…").fill("Frontend");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByTestId("job-stack")).toHaveCount(0);
});

test("groups the entire result set and paginates large expanded stacks", async ({ page }) => {
  const jobs = makeDiscoveryJobs(76);
  for (const job of jobs.slice(0, 75)) {
    job.title = "Software Engineer";
    job.company = "ManyRoles";
  }
  await page.route((url) => url.pathname === "/api/jobs", (route) => route.fulfill({ json: jobs }));
  await page.goto("/jobs");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Show 75 similar roles at ManyRoles" }).click();
  await expect(page.getByRole("article")).toHaveCount(61);
  await page.getByTestId("select-all").check();
  await expect(page.getByTestId("selected-count")).toHaveText("61 selected");
  await page.getByRole("button", { name: "Show more in stack (60 of 75)" }).click();
  await expect(page.getByRole("article")).toHaveCount(76);
  await expect(page.getByTestId("selected-count")).toHaveText("61 selected");
  await page.getByRole("button", { name: "Collapse 75 similar roles at ManyRoles" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByTestId("selected-count")).toHaveText("2 selected");
});

test("newly discovered sort explicitly switches the date filter to discovery time", async ({ page }) => {
  await page.goto("/jobs");
  const changed = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/jobs" && url.searchParams.get("sort") === "discovered";
  });
  await page.locator('label:has-text("Sort")').locator("select").selectOption("discovered");
  await changed;
  await expect(page.getByText("Date discovered", { exact: true })).toBeVisible();
});
