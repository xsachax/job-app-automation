import { describe, expect, it } from "vitest";
import {
  CHROME_EXTENSION_ID_STORAGE_KEY,
  getAutofillProgress,
  isChromeExtensionId,
  isGoogleChromeBrowser,
  launchAutofillApplication,
  pingAutofillExtension,
  readChromeExtensionId,
  saveChromeExtensionId,
  sendChromeExtensionMessage,
  type ChromeRuntimeLike,
} from "../lib/chromeExtension";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function fakeRuntime(
  responder: (extensionId: string, message: unknown) => unknown,
): {
  runtime: ChromeRuntimeLike;
  calls: { extensionId: string; message: unknown }[];
} {
  const calls: { extensionId: string; message: unknown }[] = [];
  const runtime: ChromeRuntimeLike = {
    sendMessage(extensionId, message, callback) {
      calls.push({ extensionId, message });
      callback(responder(extensionId, message));
    },
  };
  return { runtime, calls };
}

describe("Chrome extension ID storage", () => {
  it("normalizes, stores, reads, and removes a valid ID", () => {
    const storage = new MemoryStorage();
    expect(saveChromeExtensionId(`  ${EXTENSION_ID.toUpperCase()}  `, storage)).toBe(
      EXTENSION_ID,
    );
    expect(storage.getItem(CHROME_EXTENSION_ID_STORAGE_KEY)).toBe(EXTENSION_ID);
    expect(readChromeExtensionId(storage)).toBe(EXTENSION_ID);
    expect(saveChromeExtensionId("", storage)).toBe("");
    expect(readChromeExtensionId(storage)).toBe("");
  });

  it("rejects malformed IDs", () => {
    expect(isChromeExtensionId(EXTENSION_ID)).toBe(true);
    expect(isChromeExtensionId("z".repeat(32))).toBe(false);
    expect(() => saveChromeExtensionId("too-short", new MemoryStorage())).toThrow(
      /32 letters/,
    );
  });
});

describe("Chrome browser support", () => {
  it("accepts desktop Google Chrome", () => {
    expect(
      isGoogleChromeBrowser({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isGoogleChromeBrowser({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      }),
    ).toBe(true);
  });

  it("rejects non-Chrome and mobile browsers", () => {
    expect(
      isGoogleChromeBrowser({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Microsoft Edge", version: "140" },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isGoogleChromeBrowser({
        userAgent:
          "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(false);
    expect(
      isGoogleChromeBrowser({
        userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      }),
    ).toBe(false);
  });
});

describe("Chrome extension messaging", () => {
  it("sends ping, launch, and progress requests to the configured extension", async () => {
    const { runtime, calls } = fakeRuntime((_extensionId, message) => {
      const type = (message as { type?: string }).type;
      if (type === "JOB_AUTOFILL_PING") {
        return {
          ok: true,
          enabled: true,
          extensionId: EXTENSION_ID,
          version: "0.1.0",
        };
      }
      if (type === "JOB_AUTOFILL_LAUNCH") {
        return { ok: true, sessionId: "session-1" };
      }
      return {
        ok: true,
        session: {
          id: "session-1",
          jobId: "job-1",
          jobTitle: "Engineer",
          company: "Acme",
          url: "https://example.com/apply",
          tabId: 2,
          status: "active",
          startedAt: "2026-08-04T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:01.000Z",
          progress: {
            total: 2,
            answered: 1,
            filledByExtension: 1,
            readyToFill: 0,
            needsAttention: 1,
            unknownFields: [],
          },
        },
      };
    });

    await expect(pingAutofillExtension(EXTENSION_ID, runtime)).resolves.toMatchObject({
      enabled: true,
      version: "0.1.0",
    });
    await expect(
      launchAutofillApplication(
        EXTENSION_ID,
        {
          jobId: "job-1",
          jobTitle: "Engineer",
          company: "Acme",
          url: "https://example.com/apply",
        },
        runtime,
      ),
    ).resolves.toMatchObject({ sessionId: "session-1" });
    await expect(
      getAutofillProgress(EXTENSION_ID, "session-1", runtime),
    ).resolves.toMatchObject({
      session: { id: "session-1", progress: { needsAttention: 1 } },
    });

    expect(calls.map((call) => call.extensionId)).toEqual([
      EXTENSION_ID,
      EXTENSION_ID,
      EXTENSION_ID,
    ]);
    expect(calls.map((call) => (call.message as { type: string }).type)).toEqual([
      "JOB_AUTOFILL_PING",
      "JOB_AUTOFILL_LAUNCH",
      "JOB_AUTOFILL_GET_PROGRESS",
    ]);
  });

  it("surfaces extension and Chrome runtime errors", async () => {
    const extensionFailure = fakeRuntime(() => ({
      ok: false,
      error: "Extension is turned off.",
    }));
    await expect(
      sendChromeExtensionMessage(EXTENSION_ID, { type: "TEST" }, extensionFailure.runtime),
    ).rejects.toThrow("Extension is turned off.");

    const runtimeFailure = fakeRuntime(() => undefined);
    runtimeFailure.runtime.lastError = { message: "Receiving end does not exist." };
    await expect(
      sendChromeExtensionMessage(EXTENSION_ID, { type: "TEST" }, runtimeFailure.runtime),
    ).rejects.toThrow("Receiving end does not exist.");

    await expect(
      sendChromeExtensionMessage(EXTENSION_ID, { type: "TEST" }, null),
    ).rejects.toThrow("Chrome did not expose extension messaging");
  });
});
