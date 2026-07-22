import { test, expect } from "@playwright/test";
import { jobCard } from "./helpers";

test.describe("human approval gate (dry-run)", () => {
  test("draft -> review -> confirm produces a submitted application", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Apply Engineer");
    await expect(card).toBeVisible();

    const draft = card.getByRole("button", { name: "Draft application" });

    // Idempotent across reruns: only drive the gate when the job is still fresh.
    if (await draft.count()) {
      await draft.click();

      // The review panel auto-expands and shows exactly what will be sent.
      await expect(card.getByText(/Review before sending/i)).toBeVisible();

      const confirm = card.getByRole("button", { name: "Confirm & send" });
      await expect(confirm).toBeEnabled();
      await confirm.click();
    }

    // Whether we just submitted or a prior run did, the end state is the same.
    await expect(card.getByText(/^Submitted/)).toBeVisible();
    await expect(card.getByText("dry_run")).toBeVisible();
  });

  test("reject marks a job rejected and hides it from the gate", async ({ page }) => {
    await page.goto("/jobs");

    const card = jobCard(page, "E2E Reject Engineer");
    await expect(card).toBeVisible();

    const reject = card.getByRole("button", { name: "Reject" });
    if (await reject.count()) {
      await reject.click();
    }

    await expect(card.getByText("rejected")).toBeVisible();
    await expect(card.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });
});
