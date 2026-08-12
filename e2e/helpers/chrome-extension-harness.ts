import { resolve } from "node:path";
import type { Page } from "@playwright/test";

const extensionScripts = [
  "apps/chrome-extension/lib/session-scope.js",
  "apps/chrome-extension/lib/profile-schema.js",
  "apps/chrome-extension/lib/field-matcher.js",
  "apps/chrome-extension/lib/control-interactions.js",
  "apps/chrome-extension/lib/workday-adapter.js",
  "apps/chrome-extension/lib/ats-adapter.js",
  "apps/chrome-extension/content/application-panel.js",
].map((path) => resolve(process.cwd(), path));

export interface ContentPanelOptions {
  html: string;
  profile: Record<string, unknown>;
  resumeFile?: {
    fileName: string;
    mimeType: "application/pdf";
    base64: string;
  };
  deferProfile?: boolean;
  revealPanel?: boolean;
  frameMode?: boolean;
  country?: string;
  company?: string;
  profileAvailability?: Record<string, boolean>;
  assistResponse?: Record<string, unknown>;
  requiredByDefault?: boolean;
  url?: string;
}

export async function installContentPanel(
  page: Page,
  {
    html,
    profile,
    resumeFile,
    deferProfile = false,
    revealPanel = false,
    frameMode = false,
    country = "",
    company = "",
    profileAvailability,
    assistResponse,
    requiredByDefault = true,
    url,
  }: ContentPanelOptions,
) {
  if (url) {
    const fixtureUrl = new URL(url);
    await page.route(`${fixtureUrl.origin}/**`, (route) =>
      route.request().url() === url
        ? route.fulfill({ status: 200, contentType: "text/html", body: html })
        : route.abort("blockedbyclient"),
    );
    await page.goto(url);
  } else {
    await page.goto("/jobs");
    await page.setContent(html);
  }
  if (requiredByDefault) {
    await page.evaluate(() => {
      const controls = document.querySelectorAll(
        "input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, select, [contenteditable='true'], [role='combobox'], [role='radio'], [role='checkbox'], button[aria-haspopup='listbox']",
      );
      for (const control of controls) {
        if (["INPUT", "TEXTAREA", "SELECT"].includes(control.tagName)) {
          control.setAttribute("required", "");
        } else {
          control.setAttribute("aria-required", "true");
        }
      }
    });
  }
  if (revealPanel) {
    await page.evaluate(() => {
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function attachOpenShadow(init) {
        return attachShadow.call(this, { ...init, mode: "open" });
      };
    });
  }
  await page.evaluate(
    ({ savedProfile, savedResumeFile, savedAssistResponse, deferred }) => {
      type Message = {
        type: string;
        sessionId?: string;
        fields?: Record<string, unknown>[];
      };
      type Listener = (
        message: Message & {
          session?: {
            id: string;
            url: string;
            applicationOrigins: string[];
            jobTitle: string;
            country: string;
            company: string;
          };
          profile?: Record<string, unknown>;
          profileAvailability?: Record<string, boolean>;
          frameMode?: boolean;
        },
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean;

      let resolveProfile: ((response: unknown) => void) | undefined;
      const profileResponse = {
        ok: true,
        profile: savedProfile,
        resumeFile: savedResumeFile,
      };
      const profilePromise = deferred
        ? new Promise((resolve) => {
            resolveProfile = resolve;
          })
        : Promise.resolve(profileResponse);
      const harness = {
        listener: null as Listener | null,
        messages: [] as Message[],
        profileRequested: false,
        resolveProfile: () => resolveProfile?.(profileResponse),
        invoke(message: Parameters<Listener>[0]) {
          return new Promise<unknown>((resolvePromise, reject) => {
            if (!harness.listener) {
              reject(new Error("The content listener is not installed."));
              return;
            }
            harness.listener(message, {}, resolvePromise);
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
              harness.messages.push(message);
              if (message.type === "JOB_AUTOFILL_GET_PROFILE") {
                harness.profileRequested = true;
                return profilePromise;
              }
              if (message.type === "JOB_AUTOFILL_REQUEST_ASSISTANCE") {
                return Promise.resolve(
                  savedAssistResponse ?? {
                    ok: false,
                    error: "No assisted response was configured.",
                  },
                );
              }
              if (message.type === "JOB_AUTOFILL_ASSIST_EMBEDDED") {
                return Promise.resolve({
                  ok: true,
                  filled: 0,
                  assisted: 0,
                  providers: [],
                });
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
    {
      savedProfile: profile,
      savedResumeFile: resumeFile ?? null,
      savedAssistResponse: assistResponse ?? null,
      deferred: deferProfile,
    },
  );

  for (const path of extensionScripts) {
    await page.addScriptTag({ path });
  }

  await page.evaluate(
    async ({
      embeddedFrame,
      applicationCountry,
      applicationCompany,
      availableProfile,
    }) => {
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
          country: applicationCountry,
          company: applicationCompany,
        },
        profile: {},
        profileAvailability: availableProfile,
        frameMode: embeddedFrame,
      });
      if (!response?.ok) {
        throw new Error("Unable to start the content script fixture.");
      }
    },
    {
      embeddedFrame: frameMode,
      applicationCountry: country,
      applicationCompany: company,
      availableProfile: profileAvailability ?? {},
    },
  );
}

export async function invokeAutofill(page: Page) {
  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );
  if (
    result &&
    typeof result === "object" &&
    "ok" in result &&
    result.ok === false
  ) {
    throw new Error(
      "error" in result ? String(result.error) : "Content autofill failed.",
    );
  }
  return result;
}

export async function invokePanel(
  page: Page,
  message: Record<string, unknown>,
) {
  return page.evaluate(
    (payload) =>
      (
        globalThis as unknown as {
          __panelHarness: {
            invoke(message: unknown): Promise<unknown>;
          };
        }
      ).__panelHarness.invoke(payload),
    message,
  );
}
