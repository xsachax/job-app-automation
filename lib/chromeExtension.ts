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
  key?: string;
  label: string;
  required: boolean;
  reason: string;
  controlKind: string;
  status?: string;
  confidence?: number;
  suggestedField?: string;
}

export interface AutofillProgress {
  total: number;
  answered: number;
  filledByExtension: number;
  readyToFill: number;
  recognized?: number;
  needsAttention: number;
  uncertain?: number;
  platform?: string;
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
  country?: string | null;
}

export interface AutofillProfile {
  firstName: string;
  preferredName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  school: string;
  degree: string;
  fieldOfStudy: string;
  graduationDate: string;
  relevantExperienceYears: string;
  certifications: string;
  undergraduateGpa: string;
  graduateGpa: string;
  doctorateGpa: string;
  satScore: string;
  actScore: string;
  greScore: string;
  heardAboutJob: string;
  securityClearances: string;
  spacexEmploymentHistory: string;
  canPerformEssentialFunctions: "" | "yes" | "no";
  citizenshipStatus: string;
  workAuthorization: "" | "yes" | "no";
  requiresSponsorship: "" | "yes" | "no";
  coverLetter: string;
}

export interface AutofillResumeFile {
  fileName: string;
  mimeType: "application/pdf";
  base64: string;
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

function listText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

export function buildAutofillProfile(
  profile: ProfileData,
  country?: string | null,
): AutofillProfile {
  const normalizedCountry = country?.trim().toLowerCase();
  const isCanada = normalizedCountry === "ca" || normalizedCountry === "canada";
  const isUnitedStates =
    normalizedCountry === "us" ||
    normalizedCountry === "usa" ||
    normalizedCountry === "united states" ||
    normalizedCountry === "united states of america";
  const hasCountryContext = isCanada || isUnitedStates;
  return {
    firstName: text(profile.firstName),
    preferredName: text(profile.preferredName),
    lastName: text(profile.lastName),
    email: text(profile.email),
    phone: text(profile.phone),
    country: !hasCountryContext
      ? ""
      : isCanada
        ? text(profile.caCountry) || "Canada"
        : text(profile.usCountry) || "United States",
    location: !hasCountryContext
      ? ""
      : isCanada
        ? text(profile.caLocation)
        : text(profile.usLocation) || text(profile.location),
    linkedinUrl: text(profile.linkedin),
    githubUrl: text(profile.github),
    portfolioUrl: text(profile.website) || text(profile.portfolio),
    school: text(profile.school),
    degree: text(profile.degree),
    fieldOfStudy: text(profile.fieldOfStudy),
    graduationDate: text(profile.graduationDate),
    relevantExperienceYears:
      typeof profile.relevantExperienceYears === "number" &&
      Number.isFinite(profile.relevantExperienceYears) &&
      profile.relevantExperienceYears >= 0
        ? String(profile.relevantExperienceYears)
        : "",
    certifications: listText(profile.certifications),
    undergraduateGpa: text(profile.undergraduateGpa),
    graduateGpa: text(profile.graduateGpa),
    doctorateGpa: text(profile.doctorateGpa),
    satScore: text(profile.satScore),
    actScore: text(profile.actScore),
    greScore: text(profile.greScore),
    heardAboutJob: text(profile.heardAboutJob),
    securityClearances: listText(profile.securityClearances),
    spacexEmploymentHistory: text(profile.spacexEmploymentHistory),
    canPerformEssentialFunctions: choice(profile.canPerformEssentialFunctions),
    citizenshipStatus: !hasCountryContext
      ? ""
      : isCanada
        ? text(profile.caCitizenshipStatus)
        : text(profile.usCitizenshipStatus),
    workAuthorization: !hasCountryContext
      ? ""
      : isCanada
        ? choice(profile.caWorkAuthorized)
        : choice(profile.usWorkAuthorized ?? profile.workAuthorized),
    requiresSponsorship: !hasCountryContext
      ? ""
      : isCanada
        ? choice(profile.caRequiresSponsorship)
        : choice(profile.usRequiresSponsorship ?? profile.requiresSponsorship),
    coverLetter: text(profile.coverLetterTemplate),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

async function loadSavedResumeFile(): Promise<AutofillResumeFile | null> {
  if (typeof window === "undefined") return null;
  const response = await fetch("/api/profile/resume", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load the saved resume PDF (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    fileName: response.headers.get("x-resume-filename") || "resume.pdf",
    mimeType: "application/pdf",
    base64: bytesToBase64(bytes),
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

export async function syncAutofillProfile(
  profile: ProfileData,
  runtime?: ChromeRuntimeLike | null,
): Promise<ChromeExtensionResponse> {
  const resumeFile = await loadSavedResumeFile();
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_SET_PROFILE",
      profile: buildAutofillProfile(profile),
      resumeFile,
    },
    runtime,
  );
}

export async function launchAutofillApplication(
  job: AutofillJob,
  profile: ProfileData,
  runtime?: ChromeRuntimeLike | null,
): Promise<AutofillLaunchResponse> {
  const resumeFile = await loadSavedResumeFile();
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_LAUNCH",
      ...job,
      profile: buildAutofillProfile(profile, job.country),
      resumeFile,
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
