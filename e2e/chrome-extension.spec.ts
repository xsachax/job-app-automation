import { expect, test } from "@playwright/test";
import { CHROME_AUTOFILL_EXTENSION_ID } from "../lib/chromeExtension";
import { jobCard } from "./helpers";

test("a connected extension launches a job and streams progress", async ({ page }) => {
  await page.addInitScript(
    ({ extensionId }) => {
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      });
      const host = window as unknown as {
        chrome?: {
          runtime?: {
            lastError?: { message?: string };
            sendMessage: (
              id: string,
              message: { type?: string },
              callback: (response: unknown) => void,
            ) => void;
          };
        };
        __extensionMessages?: { id: string; message: { type?: string } }[];
      };
      host.__extensionMessages = [];
      host.chrome ??= {};
      host.chrome.runtime = {
        sendMessage(id, message, callback) {
          host.__extensionMessages?.push({ id, message });
          if (message.type === "JOB_AUTOFILL_PING") {
            callback({
              ok: true,
              enabled: true,
              extensionId,
              version: "0.1.0",
            });
            return;
          }
          if (message.type === "JOB_AUTOFILL_LAUNCH") {
            callback({ ok: true, sessionId: "e2e-extension-session" });
            return;
          }
          callback({
            ok: true,
            session: {
              id: "e2e-extension-session",
              jobId: "e2e-job",
              jobTitle: "E2E Frontend Engineer",
              company: "Acme E2E",
              url: "https://boards.greenhouse.io/acmee2e/jobs/frontend",
              tabId: 10,
              status: "active",
              startedAt: "2026-08-04T00:00:00.000Z",
              updatedAt: "2026-08-04T00:00:01.000Z",
              progress: {
                total: 3,
                answered: 2,
                filledByExtension: 2,
                readyToFill: 0,
                needsAttention: 1,
                unknownFields: [
                  {
                    label: "Why this role?",
                    required: true,
                    reason: "The field was not recognized.",
                    controlKind: "textarea",
                  },
                ],
              },
            },
          });
        },
      };
    },
    {
      extensionId: CHROME_AUTOFILL_EXTENSION_ID,
    },
  );

  await page.goto("/jobs");
  await expect(page.getByText("Chrome autofill is ready.")).toBeVisible();

  await jobCard(page, "E2E Frontend Engineer")
    .getByRole("link", { name: "Open ↗", exact: true })
    .click();

  await expect(page.getByText("Application opened with the autofill extension.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Frontend Engineer at Acme E2E" })).toBeVisible();
  await expect(page.getByText("2 of 3 answered")).toBeVisible();
  await expect(page.getByText("Why this role?")).toBeVisible();

  const messages = await page.evaluate(
    () =>
      (
        window as unknown as {
          __extensionMessages: {
            id: string;
            message: { type?: string; profile?: Record<string, string> };
          }[];
        }
      ).__extensionMessages,
  );
  expect(messages.map((entry) => entry.message.type)).toEqual([
    "JOB_AUTOFILL_PING",
    "JOB_AUTOFILL_PING",
    "JOB_AUTOFILL_LAUNCH",
    "JOB_AUTOFILL_GET_PROGRESS",
  ]);
  expect(messages.every((entry) => entry.id === CHROME_AUTOFILL_EXTENSION_ID)).toBe(
    true,
  );
  expect(
    messages.find((entry) => entry.message.type === "JOB_AUTOFILL_LAUNCH")
      ?.message.profile,
  ).toBeDefined();
});
