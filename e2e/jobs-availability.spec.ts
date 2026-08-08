import { expect, test } from "@playwright/test";
import { jobCard } from "./helpers";

test("keeps confirmed closures out of the active queue and available in the archive", async ({
  page,
}) => {
  await page.goto("/jobs");

  const archived = jobCard(page, "E2E Archived Engineer");
  await expect(archived).toHaveCount(0);
  await expect(jobCard(page, "E2E Frontend Engineer")).toBeVisible();

  await page
    .getByTestId("availability-tabs")
    .getByRole("button", { name: "Archived closed" })
    .click();

  await expect(archived).toBeVisible();
  await expect(archived.getByTestId("availability-badge")).toHaveText("Closed");
  await expect(archived.getByText("saved", { exact: true })).toBeVisible();
  await expect(
    archived.getByRole("link", { name: "View archived link ↗" }),
  ).toBeVisible();
  await expect(jobCard(page, "E2E Frontend Engineer")).toHaveCount(0);
});
