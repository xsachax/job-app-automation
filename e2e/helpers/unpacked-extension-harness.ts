import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

interface ExternalChromeApi {
  runtime: {
    lastError?: { message?: string };
    sendMessage(
      extensionId: string,
      message: unknown,
      callback: (response: unknown) => void,
    ): void;
  };
}

export interface UnpackedExtensionRuntime {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  close(): Promise<void>;
}

export async function launchUnpackedExtension(
  extraArgs: string[] = [],
): Promise<UnpackedExtensionRuntime> {
  const userDataDir = await mkdtemp(join(tmpdir(), "job-autofill-extension-"));
  const extensionPath = resolve(process.cwd(), "apps/chrome-extension");
  let context: BrowserContext | undefined;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        ...extraArgs,
      ],
    });
    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(serviceWorker.url()).hostname;

    return {
      context,
      extensionId,
      serviceWorker,
      async close() {
        await context?.close();
        await rm(userDataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

export async function externalExtensionMessage<T>(
  page: Page,
  extensionId: string,
  message: unknown,
): Promise<T> {
  return page.evaluate(
    ({ id, payload }) =>
      new Promise<T>((resolveMessage, reject) => {
        const chromeApi = (
          globalThis as unknown as { chrome: ExternalChromeApi }
        ).chrome;
        chromeApi.runtime.sendMessage(id, payload, (response) => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message));
            return;
          }
          resolveMessage(response as T);
        });
      }),
    { id: extensionId, payload: message },
  );
}

export async function openPopupForPage(
  runtime: UnpackedExtensionRuntime,
  applicationPage: Page,
): Promise<Page> {
  const popup = await runtime.context.newPage();
  await popup.goto(
    `chrome-extension://${runtime.extensionId}/popup/popup.html`,
  );
  await applicationPage.bringToFront();
  await popup.evaluate(async () => {
    const popupWindow = globalThis as typeof globalThis & {
      refresh?: () => Promise<void>;
    };
    if (typeof popupWindow.refresh !== "function") {
      throw new Error("The extension popup did not expose its refresh routine.");
    }
    await popupWindow.refresh();
  });
  return popup;
}
