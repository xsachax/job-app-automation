import { test, expect } from "@playwright/test";
import { CHROME_AUTOFILL_EXTENSION_ID } from "../lib/chromeExtension";

test.describe("profile page", () => {
  test("features a GitHub or Google Drive résumé PDF field", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Resume source" })).toBeVisible();
    await expect(
      page.getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf"),
    ).toBeVisible();
    const linkBox = await page
      .getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf")
      .boundingBox();
    const saveBox = await page
      .getByRole("button", { name: "Save resume PDF" })
      .boundingBox();
    expect(linkBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(Math.abs(linkBox!.y - saveBox!.y)).toBeLessThanOrEqual(1);
    await expect(page.getByText("No PDF saved", { exact: true })).toBeVisible();
    // The judge signals the profile actually feeds.
    await expect(page.getByRole("heading", { name: "Judge signals" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Software Engineer, Full-stack Developer"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("TypeScript, React, Python, SQL")).toBeVisible();
  });

  test("confirms and previews the saved resume PDF", async ({ page }) => {
    const source =
      "https://github.com/example/resume/blob/main/resume.pdf";
    await page.route("**/api/profile/resume*", async (route) => {
      if (route.request().method() === "HEAD") {
        await route.fulfill({
          status: 200,
          headers: {
            "X-Resume-Filename": "saved-resume.pdf",
            "X-Resume-Size": "204800",
            "X-Resume-Source": encodeURIComponent(source),
            "X-Resume-Updated-At": "2026-08-04T22:00:00.000Z",
          },
        });
        return;
      }
      await route.fulfill({
        body: "%PDF-1.4\n%%EOF\n",
        contentType: "application/pdf",
      });
    });

    await page.goto("/profile");
    await page
      .getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf")
      .fill(source);

    await expect(page.getByText("PDF saved", { exact: true })).toBeVisible();
    await expect(page.getByText("saved-resume.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview PDF" }).click();
    const preview = page.getByTitle("Saved resume PDF preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /preview=1/);
  });

  test("keeps application autofill details in the app profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Application autofill" }),
    ).toBeVisible();
    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    await expect(page.getByLabel("US location")).toBeVisible();
    await expect(page.getByLabel("Canada location")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Jobs in the United States" })
        .getByLabel("Do you have work authorization?"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Jobs in Canada" })
        .getByLabel("Do you need visa sponsorship?"),
    ).toBeVisible();
    await expect(page.getByLabel("Default cover letter")).toBeVisible();
    await expect(page.getByLabel("Pasted or parsed resume text")).toHaveCount(0);
    await expect(page.getByText(/never influence fit scores/i)).toBeVisible();
  });

  test("syncs saved autofill details to Chrome without an ID field", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      });
      const messages: { id: string; message: unknown }[] = [];
      Object.defineProperty(globalThis, "__profileExtensionMessages", {
        configurable: true,
        value: messages,
      });
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: {
          runtime: {
            sendMessage(
              id: string,
              message: unknown,
              callback: (response: unknown) => void,
            ) {
              messages.push({ id, message });
              callback({ ok: true, profileConfigured: true });
            },
          },
        },
      });
    });

    await page.goto("/profile");
    await page.getByLabel("First name").fill("Jane");
    await page.getByLabel("Email").fill("jane@example.com");
    const usSection = page.getByRole("region", {
      name: "Jobs in the United States",
    });
    await usSection.getByLabel("Do you need visa sponsorship?").selectOption("no");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText(/Chrome autofill synced/)).toBeVisible();

    const request = await page.evaluate(() => {
      const messages = (
        globalThis as unknown as {
          __profileExtensionMessages: { id: string; message: unknown }[];
        }
      ).__profileExtensionMessages;
      return messages.at(-1);
    });
    expect(request).toMatchObject({
      id: CHROME_AUTOFILL_EXTENSION_ID,
      message: {
        type: "JOB_AUTOFILL_SET_PROFILE",
        profile: {
          firstName: "Jane",
          email: "jane@example.com",
          requiresSponsorship: "no",
        },
      },
    });

    const messagesBeforeClear = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __profileExtensionMessages: unknown[];
          }
        ).__profileExtensionMessages.length,
    );
    await usSection.getByLabel("Do you need visa sponsorship?").selectOption("");
    const clearResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/profile") &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    expect(await (await clearResponse).json()).toMatchObject({
      usRequiresSponsorship: null,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __profileExtensionMessages: unknown[];
              }
            ).__profileExtensionMessages.length,
        ),
      )
      .toBeGreaterThan(messagesBeforeClear);
    const clearedRequest = await page.evaluate(() => {
      const messages = (
        globalThis as unknown as {
          __profileExtensionMessages: {
            message: { profile?: { requiresSponsorship?: string } };
          }[];
        }
      ).__profileExtensionMessages;
      return messages.at(-1);
    });
    expect(clearedRequest?.message.profile?.requiresSponsorship).toBe("");
  });

  test("preserves unsaved fields when refreshing the resume", async ({ page }) => {
    await page.route("**/api/profile/refresh", async (route) => {
      await route.fulfill({
        json: {
          provider: "test",
          source: "test-resume",
          updatedFields: [],
        },
      });
    });

    await page.goto("/profile");
    await page.getByLabel("Preferred name").fill("Unsaved Before Refresh");
    await page.getByRole("button", { name: "Save resume PDF" }).click();
    await expect(page.getByLabel("Preferred name")).toHaveValue(
      "Unsaved Before Refresh",
    );
    const profile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );
    expect(profile).toMatchObject({ preferredName: "Unsaved Before Refresh" });
  });
});
