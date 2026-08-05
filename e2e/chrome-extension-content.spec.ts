import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const extensionScripts = [
  "apps/chrome-extension/lib/session-scope.js",
  "apps/chrome-extension/lib/profile-schema.js",
  "apps/chrome-extension/lib/field-matcher.js",
  "apps/chrome-extension/content/application-panel.js",
].map((path) => resolve(process.cwd(), path));

async function installContentPanel(
  page: Page,
  {
    html,
    profile,
    deferProfile = false,
    revealPanel = false,
  }: {
    html: string;
    profile: Record<string, string>;
    deferProfile?: boolean;
    revealPanel?: boolean;
  },
) {
  await page.goto("/jobs");
  await page.setContent(html);
  if (revealPanel) {
    await page.evaluate(() => {
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function attachOpenShadow(init) {
        return attachShadow.call(this, { ...init, mode: "open" });
      };
    });
  }
  await page.evaluate(
    ({ savedProfile, deferred }) => {
      type Message = { type: string; sessionId?: string };
      type Listener = (
        message: Message & {
          session?: {
            id: string;
            url: string;
            applicationOrigins: string[];
            jobTitle: string;
          };
          profile?: Record<string, string>;
        },
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean;

      let resolveProfile: ((response: unknown) => void) | undefined;
      const profileResponse = { ok: true, profile: savedProfile };
      const profilePromise = deferred
        ? new Promise((resolve) => {
            resolveProfile = resolve;
          })
        : Promise.resolve(profileResponse);
      const harness = {
        listener: null as Listener | null,
        profileRequested: false,
        resolveProfile: () => resolveProfile?.(profileResponse),
        invoke(message: Parameters<Listener>[0]) {
          return new Promise<unknown>((resolve, reject) => {
            if (!harness.listener) {
              reject(new Error("The content listener is not installed."));
              return;
            }
            harness.listener(message, {}, resolve);
          });
        },
      };

      Object.defineProperty(globalThis, "__panelHarness", {
        value: harness,
        configurable: true,
      });
      Object.defineProperty(globalThis, "chrome", {
        value: {
          runtime: {
            sendMessage(message: Message) {
              if (message.type === "JOB_AUTOFILL_GET_PROFILE") {
                harness.profileRequested = true;
                return profilePromise;
              }
              return Promise.resolve({ ok: true });
            },
            onMessage: {
              addListener(listener: Listener) {
                harness.listener = listener;
              },
            },
          },
        },
        configurable: true,
      });
    },
    { savedProfile: profile, deferred: deferProfile },
  );

  for (const path of extensionScripts) {
    await page.addScriptTag({ path });
  }

  await page.evaluate(async () => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<{ ok?: boolean }>;
        };
      }
    ).__panelHarness;
    const response = await harness.invoke({
      type: "JOB_AUTOFILL_START_SESSION",
      session: {
        id: "content-e2e-session",
        url: location.href,
        applicationOrigins: [location.origin],
        jobTitle: "Content script fixture",
      },
      profile: {},
    });
    if (!response?.ok) {
      throw new Error("Unable to start the content script fixture.");
    }
  });
}

test("section headings prevent applicant data from filling reference fields", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <main>
        <section>
          <h2>References</h2>
          <label>Email address <input id="reference-email" autocomplete="email"></label>
        </section>
        <section>
          <h2>Applicant</h2>
          <label>Email address <input id="applicant-email" autocomplete="email"></label>
        </section>
      </main>
    `,
    profile: { email: "applicant@example.com" },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#reference-email")).toHaveValue("");
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("disabling the extension cancels an in-flight profile fill", async ({ page }) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    deferProfile: true,
  });

  const result = await page.evaluate(async () => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          profileRequested: boolean;
          resolveProfile(): void;
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness;
    const fill = harness.invoke({ type: "JOB_AUTOFILL_FILL" });
    if (!harness.profileRequested) {
      throw new Error("The profile request did not start.");
    }
    await harness.invoke({ type: "JOB_AUTOFILL_EXTENSION_DISABLED" });
    harness.resolveProfile();
    return fill;
  });

  expect(result).toMatchObject({ ok: false });
  await expect(page.locator("#applicant-email")).toHaveValue("");
});

test("negated sponsorship questions remain unanswered", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Do you not require visa sponsorship?</legend>
        <label><input type="radio" name="requires_sponsorship" value="yes"> Yes</label>
        <label><input type="radio" name="requires_sponsorship" value="no"> No</label>
      </fieldset>
    `,
    profile: { requiresSponsorship: "no" },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 0 });
  await expect(
    page.locator('input[name="requires_sponsorship"]:checked'),
  ).toHaveCount(0);
});

test("panel fits a narrow viewport and autofills from its own button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    revealPanel: true,
  });

  const panelHost = page.locator("#job-autofill-extension-panel");
  const panelBox = await panelHost.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(360);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(640);

  const firstStat = panelHost.locator(".stat").first();
  const countBox = await firstStat.locator("strong").boundingBox();
  const labelBox = await firstStat.locator("span").boundingBox();
  expect(countBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(labelBox!.x);

  await panelHost
    .getByRole("button", { name: "Autofill ready fields" })
    .click();
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
  await expect(
    panelHost.getByText("Filled 1 field. Review every answer."),
  ).toBeVisible();
});
