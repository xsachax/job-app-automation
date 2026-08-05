import type { ProfileData } from "./settings";

export const CHROME_AUTOFILL_EXTENSION_ID =
  "naihpjhebnkenkfdlblbefoimhhcdfcl";

export interface BrowserIdentityLike {
  userAgent?: string;
  userAgentData?: {
    brands?: { brand: string; version?: string }[];
  };
  brave?: unknown;
}

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

export interface AutofillProfile {
  firstName: string;
  preferredName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  workAuthorization: "" | "yes" | "no";
  requiresSponsorship: "" | "yes" | "no";
  coverLetter: string;
}

export function isGoogleChromeBrowser(
  identity?: BrowserIdentityLike,
): boolean {
  const browserIdentity =
    identity ??
    (typeof navigator === "undefined"
      ? undefined
      : (navigator as unknown as BrowserIdentityLike));
  if (!browserIdentity || browserIdentity.brave) return false;

  const brands = browserIdentity.userAgentData?.brands ?? [];
  if (brands.length) {
    return brands.some(({ brand }) => brand === "Google Chrome");
  }

  const userAgent = browserIdentity.userAgent ?? "";
  return (
    /\bChrome\/\d+/i.test(userAgent) &&
    !/\b(?:Edg|OPR|CriOS)\//i.test(userAgent) &&
    !/\bMobile\b/i.test(userAgent)
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function choice(value: unknown): "" | "yes" | "no" {
  return value === true ? "yes" : value === false ? "no" : "";
}

export function buildAutofillProfile(profile: ProfileData): AutofillProfile {
  return {
    firstName: text(profile.firstName),
    preferredName: text(profile.preferredName),
    lastName: text(profile.lastName),
    email: text(profile.email),
    phone: text(profile.phone),
    addressLine1: text(profile.addressLine1),
    city: text(profile.city),
    state: text(profile.state),
    postalCode: text(profile.postalCode),
    country: text(profile.country),
    linkedinUrl: text(profile.linkedin),
    githubUrl: text(profile.github),
    portfolioUrl: text(profile.website) || text(profile.portfolio),
    workAuthorization: choice(profile.workAuthorized),
    requiresSponsorship: choice(profile.requiresSponsorship),
    coverLetter: text(profile.coverLetterTemplate),
  };
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
  message: unknown,
  runtime: ChromeRuntimeLike | null = getChromeRuntime(),
): Promise<T> {
  if (!runtime) {
    return Promise.reject(
      new Error("Chrome did not expose extension messaging to this dashboard."),
    );
  }

  return new Promise<T>((resolve, reject) => {
    runtime.sendMessage(CHROME_AUTOFILL_EXTENSION_ID, message, (rawResponse) => {
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
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillPingResponse> {
  return sendChromeExtensionMessage({ type: "JOB_AUTOFILL_PING" }, runtime);
}

export function syncAutofillProfile(
  profile: ProfileData,
  runtime?: ChromeRuntimeLike | null,
): Promise<ChromeExtensionResponse> {
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_SET_PROFILE",
      profile: buildAutofillProfile(profile),
    },
    runtime,
  );
}

export function launchAutofillApplication(
  job: AutofillJob,
  profile: ProfileData,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillLaunchResponse> {
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_LAUNCH",
      ...job,
      profile: buildAutofillProfile(profile),
    },
    runtime,
  );
}

export function getAutofillProgress(
  sessionId: string,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillProgressResponse> {
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_GET_PROGRESS",
      sessionId,
    },
    runtime,
  );
}
