export const CHROME_EXTENSION_ID_STORAGE_KEY = "jobAutofillExtensionId";

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

export interface ChromeRuntimeLike {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ): void;
}

interface ChromeExtensionResponse {
  ok: boolean;
  error?: string;
}

export interface AutofillUnknownField {
  label: string;
  required: boolean;
  reason: string;
  controlKind: string;
}

export interface AutofillProgress {
  total: number;
  answered: number;
  filledByExtension: number;
  readyToFill: number;
  needsAttention: number;
  unknownFields: AutofillUnknownField[];
}

export interface AutofillSession {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  url: string;
  tabId: number | null;
  status: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  progress: AutofillProgress;
}

export interface AutofillPingResponse extends ChromeExtensionResponse {
  enabled: boolean;
  extensionId: string;
  version: string;
}

export interface AutofillLaunchResponse extends ChromeExtensionResponse {
  sessionId: string;
}

export interface AutofillProgressResponse extends ChromeExtensionResponse {
  session: AutofillSession;
}

export interface AutofillJob {
  jobId: string;
  jobTitle: string;
  company: string;
  url: string;
}

function browserStorage(): Storage {
  if (typeof localStorage === "undefined") {
    throw new Error("Browser storage is unavailable.");
  }
  return localStorage;
}

export function normalizeChromeExtensionId(value: string): string {
  return value.trim().toLowerCase();
}

export function isChromeExtensionId(value: string): boolean {
  return CHROME_EXTENSION_ID_PATTERN.test(normalizeChromeExtensionId(value));
}

export function readChromeExtensionId(storage?: Pick<Storage, "getItem">): string {
  return normalizeChromeExtensionId(
    (storage ?? browserStorage()).getItem(CHROME_EXTENSION_ID_STORAGE_KEY) ?? "",
  );
}

export function saveChromeExtensionId(
  value: string,
  storage?: Pick<Storage, "setItem" | "removeItem">,
): string {
  const extensionId = normalizeChromeExtensionId(value);
  const target = storage ?? browserStorage();

  if (!extensionId) {
    target.removeItem(CHROME_EXTENSION_ID_STORAGE_KEY);
    return "";
  }
  if (!isChromeExtensionId(extensionId)) {
    throw new Error("Chrome extension IDs contain 32 letters from a through p.");
  }

  target.setItem(CHROME_EXTENSION_ID_STORAGE_KEY, extensionId);
  return extensionId;
}

export function getChromeRuntime(): ChromeRuntimeLike | null {
  const host = globalThis as typeof globalThis & {
    chrome?: { runtime?: ChromeRuntimeLike };
  };
  return typeof host.chrome?.runtime?.sendMessage === "function"
    ? host.chrome.runtime
    : null;
}

export function sendChromeExtensionMessage<T extends ChromeExtensionResponse>(
  extensionId: string,
  message: unknown,
  runtime: ChromeRuntimeLike | null = getChromeRuntime(),
): Promise<T> {
  const normalizedId = normalizeChromeExtensionId(extensionId);
  if (!isChromeExtensionId(normalizedId)) {
    return Promise.reject(
      new Error("Chrome extension IDs contain 32 letters from a through p."),
    );
  }
  if (!runtime) {
    return Promise.reject(
      new Error("Chrome did not expose extension messaging to this dashboard."),
    );
  }

  return new Promise<T>((resolve, reject) => {
    runtime.sendMessage(normalizedId, message, (rawResponse) => {
      const runtimeMessage = runtime.lastError?.message;
      if (runtimeMessage) {
        reject(new Error(runtimeMessage));
        return;
      }
      if (typeof rawResponse !== "object" || rawResponse === null) {
        reject(new Error("The Chrome extension did not return a response."));
        return;
      }

      const response = rawResponse as ChromeExtensionResponse;
      if (response.ok !== true) {
        reject(new Error(response.error || "The Chrome extension request failed."));
        return;
      }
      resolve(rawResponse as T);
    });
  });
}

export function pingAutofillExtension(
  extensionId: string,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillPingResponse> {
  return sendChromeExtensionMessage(
    extensionId,
    { type: "JOB_AUTOFILL_PING" },
    runtime,
  );
}

export function launchAutofillApplication(
  extensionId: string,
  job: AutofillJob,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillLaunchResponse> {
  return sendChromeExtensionMessage(
    extensionId,
    {
      type: "JOB_AUTOFILL_LAUNCH",
      ...job,
    },
    runtime,
  );
}

export function getAutofillProgress(
  extensionId: string,
  sessionId: string,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillProgressResponse> {
  return sendChromeExtensionMessage(
    extensionId,
    {
      type: "JOB_AUTOFILL_GET_PROGRESS",
      sessionId,
    },
    runtime,
  );
}
