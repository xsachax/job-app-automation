import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import {
  externalExtensionMessage,
  launchUnpackedExtension,
  type UnpackedExtensionRuntime,
} from "./helpers/unpacked-extension-harness";

interface ExtensionChromeApi {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
  tabs: {
    query(queryInfo: object): Promise<{ id?: number; url?: string }[]>;
  };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The extension fixture server did not return a port."));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

test("the unpacked extension fills a known cross-origin ATS frame", async () => {
  let port = 0;
  const server = createServer((request, response) => {
    const hostname = String(request.headers.host || "").split(":")[0];
    response.setHeader("Content-Type", "text/html; charset=utf-8");

    if (hostname === "company.test") {
      response.end(
        `<iframe id="lever-frame" src="http://jobs.lever.co:${port}/embed"></iframe>`,
      );
      return;
    }
    if (hostname === "jobs.lever.co") {
      response.end(`
        <form class="application-form">
          <label>First name <input id="first-name" name="first_name" required></label>
          <label>Email address <input id="email" name="email"></label>
          <button type="button">Continue</button>
        </form>
      `);
      return;
    }
    response.end("<p>Extension control page</p>");
  });

  let runtime: UnpackedExtensionRuntime | undefined;
  try {
    port = await listen(server);
    runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP company.test 127.0.0.1,MAP jobs.lever.co 127.0.0.1",
    ]);
    const { context, extensionId } = runtime;
    const controlPage = context.pages()[0] ?? (await context.newPage());
    await controlPage.goto(`http://localhost:${port}/control`);

    const saved = await externalExtensionMessage<{ ok: boolean; error?: string }>(
      controlPage,
      extensionId,
      {
        type: "JOB_AUTOFILL_SET_PROFILE",
        profile: {
          firstName: "Sacha",
          email: "sacha@example.com",
        },
      },
    );
    expect(saved).toMatchObject({ ok: true });

    const applicationPagePromise = context.waitForEvent("page");
    const launched = await externalExtensionMessage<{
      ok: boolean;
      error?: string;
    }>(controlPage, extensionId, {
      type: "JOB_AUTOFILL_LAUNCH",
      url: `http://company.test:${port}/apply`,
      jobTitle: "Extension runtime fixture",
      company: "Example",
      country: "CA",
    });
    expect(launched).toMatchObject({ ok: true });

    const applicationPage =
      context.pages().find((page) => page.url().includes("company.test")) ??
      (await applicationPagePromise);
    await applicationPage
      .locator("#job-autofill-extension-panel")
      .waitFor({ timeout: 10_000 });

    const extensionPage = await context.newPage();
    await extensionPage.goto(
      `chrome-extension://${extensionId}/popup/popup.html`,
    );
    const applicationTab = await extensionPage.evaluate(async () => {
      const chromeApi = (
        globalThis as unknown as { chrome: ExtensionChromeApi }
      ).chrome;
      const tabs = await chromeApi.tabs.query({});
      return tabs.find((tab) => tab.url?.includes("company.test"));
    });
    expect(applicationTab?.id).toBeTruthy();

    await expect
      .poll(async () =>
        extensionPage.evaluate((tabId) => {
          const chromeApi = (
            globalThis as unknown as { chrome: ExtensionChromeApi }
          ).chrome;
          return chromeApi.runtime.sendMessage({
            type: "JOB_AUTOFILL_GET_STATE",
            tabId,
          });
        }, applicationTab!.id),
      )
      .toMatchObject({
        session: {
          progress: {
            readyToFill: 1,
            needsAttention: 0,
          },
        },
      });

    const result = await extensionPage.evaluate(
      ({ tabId, url }) => {
        const chromeApi = (
          globalThis as unknown as { chrome: ExtensionChromeApi }
        ).chrome;
        return chromeApi.runtime.sendMessage({
          type: "JOB_AUTOFILL_START_TAB",
          tabId,
          url,
          jobTitle: "Extension runtime fixture",
          autofill: true,
        });
      },
      { tabId: applicationTab!.id, url: applicationTab!.url },
    );
    expect(result).toMatchObject({ ok: true, filled: 1 });

    const leverFrame = applicationPage
      .locator("#lever-frame")
      .contentFrame();
    await expect(leverFrame.locator("#first-name")).toHaveValue("Sacha");
    await expect(leverFrame.locator("#email")).toHaveValue("");
  } finally {
    await runtime?.close();
    if (server.listening) {
      await closeServer(server);
    }
  }
});

test("the unpacked extension requests AI assistance from its trusted dashboard", async () => {
  let port = 0;
  let assistedRequest:
    | {
        body: {
          job?: { url?: string };
          fields?: Array<{ id?: string; label?: string; controlKind?: string }>;
        };
        extensionId: string;
        origin: string;
      }
    | null = null;
  const server = createServer((request, response) => {
    const hostname = String(request.headers.host || "").split(":")[0];
    const path = new URL(request.url || "/", "http://localhost").pathname;

    if (hostname === "company.test") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`
        <form>
          <label for="impact">Share one concrete example of technical impact *</label>
          <textarea id="impact" name="opaque_response_73" required></textarea>
        </form>
      `);
      return;
    }

    if (path === "/api/autofill/assist") {
      const origin = String(request.headers.origin || "");
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Job-Autofill-Extension",
      );
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.setHeader("Vary", "Origin");
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      let rawBody = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        rawBody += chunk;
      });
      request.on("end", () => {
        assistedRequest = {
          body: JSON.parse(rawBody) as {
            job?: { url?: string };
            fields?: Array<{
              id?: string;
              label?: string;
              controlKind?: string;
            }>;
          },
          extensionId: String(
            request.headers["x-job-autofill-extension"] || "",
          ),
          origin,
        };
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            provider: "openai",
            suggestions: [
              {
                fieldId: "field-1",
                answer: "Built reliable developer tooling used across teams.",
                confidence: 0.93,
                reason: "Supported by the saved profile.",
                sourceKeys: ["summary"],
              },
            ],
          }),
        );
      });
      return;
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<p>Dashboard control page</p>");
  });

  let runtime: UnpackedExtensionRuntime | undefined;
  try {
    port = await listen(server);
    runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP company.test 127.0.0.1",
    ]);
    const { context, extensionId } = runtime;
    const controlPage = context.pages()[0] ?? (await context.newPage());
    await controlPage.goto(`http://localhost:${port}/control`);
    await expect(
      externalExtensionMessage(controlPage, extensionId, {
        type: "JOB_AUTOFILL_SET_PROFILE",
        profile: {
          firstName: "Sacha",
          summary: "Built reliable developer tooling used across teams.",
        },
      }),
    ).resolves.toMatchObject({ ok: true });

    const applicationPagePromise = context.waitForEvent("page");
    await expect(
      externalExtensionMessage(controlPage, extensionId, {
        type: "JOB_AUTOFILL_LAUNCH",
        url: `http://company.test:${port}/apply`,
        jobTitle: "Assisted runtime fixture",
        company: "Example",
        country: "US",
      }),
    ).resolves.toMatchObject({ ok: true });
    const applicationPage =
      context.pages().find((page) => page.url().includes("company.test")) ??
      (await applicationPagePromise);
    await applicationPage
      .locator("#job-autofill-extension-panel")
      .waitFor({ timeout: 10_000 });

    const extensionPage = await context.newPage();
    await extensionPage.goto(
      `chrome-extension://${extensionId}/popup/popup.html`,
    );
    const applicationTab = await extensionPage.evaluate(async () => {
      const chromeApi = (
        globalThis as unknown as { chrome: ExtensionChromeApi }
      ).chrome;
      const tabs = await chromeApi.tabs.query({});
      return tabs.find((tab) => tab.url?.includes("company.test"));
    });
    expect(applicationTab?.id).toBeTruthy();

    const result = await extensionPage.evaluate(
      ({ tabId, url }) => {
        const chromeApi = (
          globalThis as unknown as { chrome: ExtensionChromeApi }
        ).chrome;
        return chromeApi.runtime.sendMessage({
          type: "JOB_AUTOFILL_ASSIST_TAB",
          tabId,
          url,
          jobTitle: "Assisted runtime fixture",
        });
      },
      { tabId: applicationTab!.id, url: applicationTab!.url },
    );
    expect(result).toMatchObject({
      ok: true,
      filled: 1,
      assisted: 1,
      providers: ["openai"],
    });
    await expect(applicationPage.locator("#impact")).toHaveValue(
      "Built reliable developer tooling used across teams.",
    );
    await expect.poll(() => assistedRequest).not.toBeNull();

    const captured = assistedRequest!;
    expect(captured.origin).toBe(`chrome-extension://${extensionId}`);
    expect(captured.extensionId).toBe(extensionId);
    expect(captured.body.job?.url).toBe(
      `http://company.test:${port}/apply`,
    );
    expect(captured.body.fields).toEqual([
      expect.objectContaining({
        id: "field-1",
        controlKind: "textarea",
        label: expect.stringMatching(/technical impact/i),
      }),
    ]);
  } finally {
    await runtime?.close();
    if (server.listening) {
      await closeServer(server);
    }
  }
});
