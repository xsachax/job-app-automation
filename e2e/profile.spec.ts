import { test, expect } from "@playwright/test";
import { CHROME_AUTOFILL_EXTENSION_ID } from "../lib/chromeExtension";

test.describe("profile page", () => {
  test("features a GitHub or Google Drive résumé PDF field", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Resume source" })).toBeVisible();
    await expect(
      page.getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf"),
    ).toBeVisible();
    // The judge signals the profile actually feeds.
    await expect(page.getByRole("heading", { name: "Judge signals" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Software Engineer, Full-stack Developer"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("TypeScript, React, Python, SQL")).toBeVisible();
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
    await expect(page.getByLabel("United States work authorization")).toBeVisible();
    await expect(page.getByLabel("Canada work authorization")).toBeVisible();
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
    await page.getByLabel("United States visa sponsorship").selectOption("no");
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

    await page.getByLabel("United States visa sponsorship").selectOption("");
    const clearResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/profile") &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    expect(await (await clearResponse).json()).toMatchObject({
      usRequiresSponsorship: null,
    });
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
