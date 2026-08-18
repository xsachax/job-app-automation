import type { ProfileData } from "./settings";
import { canonicalCompanyName } from "./company-names";

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

export interface AutofillWorkExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  currentRole: "" | "yes" | "no";
  description: string;
}

export interface AutofillEducationEntry {
  school: string;
  degree: string;
  degreeOther: string;
  fieldOfStudy: string;
  startDate: string;
  graduationDate: string;
  graduationDateExact: string;
  gpa: string;
}

export interface AutofillCredential {
  name: string;
  issuer: string;
  credentialId: string;
  issueDate: string;
  expirationDate: string;
  doesNotExpire: "" | "yes" | "no";
}

export interface AutofillLanguage {
  language: string;
  overallProficiency: string;
  speakingProficiency: string;
  readingProficiency: string;
  writingProficiency: string;
}

export interface AutofillWebsite {
  label: string;
  url: string;
}

export interface AutofillProfile {
  firstName: string;
  preferredName: string;
  middleName: string;
  lastName: string;
  nameSuffix: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  phoneType: string;
  phoneExtension: string;
  homeAddressLine1: string;
  homeAddressLine2: string;
  homeCity: string;
  homeRegion: string;
  homePostalCode: string;
  homeCountry: string;
  country: string;
  location: string;
  usCountry: string;
  usLocation: string;
  usWorkAuthorization: "" | "yes" | "no";
  usRequiresSponsorship: "" | "yes" | "no";
  usCitizenshipStatus: string;
  usCitizenshipStatusOther: string;
  caCountry: string;
  caLocation: string;
  caWorkAuthorization: "" | "yes" | "no";
  caRequiresSponsorship: "" | "yes" | "no";
  caCitizenshipStatus: string;
  caCitizenshipStatusOther: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  exceptionalWork: string;
  additionalWebsites: AutofillWebsite[];
  school: string;
  degree: string;
  degreeOther: string;
  fieldOfStudy: string;
  educationStartDate: string;
  graduationDate: string;
  graduationDateExact: string;
  educationEntries: AutofillEducationEntry[];
  workExperiences: AutofillWorkExperience[];
  relevantExperienceYears: string;
  softwareIndustryExperienceYears: string;
  certifications: string;
  credentialEntries: AutofillCredential[];
  languages: AutofillLanguage[];
  undergraduateGpa: string;
  graduateGpa: string;
  doctorateGpa: string;
  satScore: string;
  actScore: string;
  greScore: string;
  heardAboutJob: string;
  heardAboutJobOther: string;
  referrerName: string;
  referrerEmail: string;
  previousEmployers: string;
  compensationExpectation: string;
  compensationCurrency: string;
  compensationFrequency: string;
  availableStartDate: string;
  noticePeriod: string;
  willingToRelocate: "" | "yes" | "no";
  willingToTravel: "" | "yes" | "no";
  maxTravelPercentage: string;
  isAtLeast18: "" | "yes" | "no";
  preferredOfficeLocations: string;
  securityClearances: string;
  canPerformEssentialFunctions: "" | "yes" | "no";
  citizenshipStatus: string;
  citizenshipStatusOther: string;
  workAuthorization: "" | "yes" | "no";
  requiresSponsorship: "" | "yes" | "no";
  pronouns: string;
  pronounsOther: string;
  gender: string;
  genderOther: string;
  raceEthnicity: string;
  raceEthnicityOther: string;
  hispanicLatino: string;
  transgenderStatus: string;
  disabilityStatus: string;
  veteranStatus: string;
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

function listText(value: unknown, separator = ", "): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(separator);
}

function companyListText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => canonicalCompanyName(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

function numberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? String(value)
    : "";
}

function credentialEntries(profile: ProfileData): AutofillCredential[] {
  return (profile.certifications ?? []).map((credential) => ({
    name: text(credential.name),
    issuer: text(credential.issuer),
    credentialId: text(credential.credentialId),
    issueDate: text(credential.issueDate),
    expirationDate: text(credential.expirationDate),
    doesNotExpire: choice(credential.doesNotExpire),
  }));
}

function primaryEducation(profile: ProfileData): AutofillEducationEntry | null {
  const school = text(profile.school);
  const degree = text(profile.degree);
  const fieldOfStudy = text(profile.fieldOfStudy);
  if (!school && !degree && !fieldOfStudy) return null;
  const gpa =
    degree === "Master's degree"
      ? text(profile.graduateGpa)
      : degree === "Doctorate"
        ? text(profile.doctorateGpa)
        : text(profile.undergraduateGpa);
  return {
    school,
    degree,
    degreeOther: degree === "Other" ? text(profile.degreeOther) : "",
    fieldOfStudy,
    startDate: text(profile.educationStartDate),
    graduationDate: text(profile.graduationDate),
    graduationDateExact: text(profile.graduationDateExact),
    gpa,
  };
}

function educationEntries(profile: ProfileData): AutofillEducationEntry[] {
  const primary = primaryEducation(profile);
  return [
    ...(primary ? [primary] : []),
    ...(profile.additionalEducation ?? []).map((entry) => ({
      school: text(entry.school),
      degree: text(entry.degree),
      degreeOther:
        text(entry.degree) === "Other" ? text(entry.degreeOther) : "",
      fieldOfStudy: text(entry.fieldOfStudy),
      startDate: text(entry.startDate),
      graduationDate: text(entry.graduationDate),
      graduationDateExact: text(entry.graduationDateExact),
      gpa: text(entry.gpa),
    })),
  ];
}

export function buildAutofillProfile(
  profile: ProfileData,
  country?: string | null,
  preferredOfficeLocations: string[] = [],
): AutofillProfile {
  const normalizedCountry = country?.trim().toLowerCase();
  const isCanada = normalizedCountry === "ca" || normalizedCountry === "canada";
  const isUnitedStates =
    normalizedCountry === "us" ||
    normalizedCountry === "usa" ||
    normalizedCountry === "united states" ||
    normalizedCountry === "united states of america";
  const hasCountryContext = isCanada || isUnitedStates;
  const credentials = credentialEntries(profile);
  const workExperiences: AutofillWorkExperience[] = (
    profile.workExperiences ?? []
  ).map((entry) => ({
    company: text(entry.company),
    title: text(entry.title),
    location: text(entry.location),
    startDate: text(entry.startDate),
    endDate: text(entry.endDate),
    currentRole: choice(entry.currentRole),
    description: text(entry.description),
  }));
  const websites = [
    { label: "LinkedIn", url: text(profile.linkedin) },
    { label: "GitHub", url: text(profile.github) },
    {
      label: "Portfolio",
      url: text(profile.website) || text(profile.portfolio),
    },
    ...(profile.additionalWebsites ?? []).map((entry) => ({
      label: text(entry.label),
      url: text(entry.url),
    })),
  ].filter(
    (entry, index, entries) =>
      entry.url &&
      entries.findIndex(
        (candidate) => candidate.url.toLowerCase() === entry.url.toLowerCase(),
      ) === index,
  );
  return {
    firstName: text(profile.firstName),
    preferredName: text(profile.preferredName),
    middleName: text(profile.middleName),
    lastName: text(profile.lastName),
    nameSuffix: text(profile.nameSuffix),
    email: text(profile.email),
    phone: text(profile.phone),
    phoneCountryCode: text(profile.phoneCountryCode),
    phoneType: text(profile.phoneType),
    phoneExtension: text(profile.phoneExtension),
    homeAddressLine1: text(profile.homeAddressLine1),
    homeAddressLine2: text(profile.homeAddressLine2),
    homeCity: text(profile.homeCity),
    homeRegion: text(profile.homeRegion),
    homePostalCode: text(profile.homePostalCode),
    homeCountry: text(profile.homeCountry),
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
    usCountry: text(profile.usCountry) || "United States",
    usLocation: text(profile.usLocation) || text(profile.location),
    usWorkAuthorization: choice(
      profile.usWorkAuthorized ?? profile.workAuthorized,
    ),
    usRequiresSponsorship: choice(
      profile.usRequiresSponsorship ?? profile.requiresSponsorship,
    ),
    usCitizenshipStatus: text(profile.usCitizenshipStatus),
    usCitizenshipStatusOther:
      text(profile.usCitizenshipStatus) === "Other"
        ? text(profile.usCitizenshipStatusOther)
        : "",
    caCountry: text(profile.caCountry) || "Canada",
    caLocation: text(profile.caLocation),
    caWorkAuthorization: choice(profile.caWorkAuthorized),
    caRequiresSponsorship: choice(profile.caRequiresSponsorship),
    caCitizenshipStatus: text(profile.caCitizenshipStatus),
    caCitizenshipStatusOther:
      text(profile.caCitizenshipStatus) === "Other"
        ? text(profile.caCitizenshipStatusOther)
        : "",
    linkedinUrl: text(profile.linkedin),
    githubUrl: text(profile.github),
    portfolioUrl: text(profile.website) || text(profile.portfolio),
    exceptionalWork: text(profile.exceptionalWork),
    additionalWebsites: websites,
    school: text(profile.school),
    degree: text(profile.degree),
    degreeOther:
      text(profile.degree) === "Other" ? text(profile.degreeOther) : "",
    fieldOfStudy: text(profile.fieldOfStudy),
    educationStartDate: text(profile.educationStartDate),
    graduationDate: text(profile.graduationDate),
    graduationDateExact: text(profile.graduationDateExact),
    educationEntries: educationEntries(profile),
    workExperiences,
    relevantExperienceYears: numberText(profile.relevantExperienceYears),
    softwareIndustryExperienceYears: numberText(
      profile.softwareIndustryExperienceYears,
    ),
    certifications: listText(credentials.map((credential) => credential.name)),
    credentialEntries: credentials,
    languages: (profile.languages ?? []).map((entry) => ({
      language: text(entry.language),
      overallProficiency: text(entry.overallProficiency),
      speakingProficiency: text(entry.speakingProficiency),
      readingProficiency: text(entry.readingProficiency),
      writingProficiency: text(entry.writingProficiency),
    })),
    undergraduateGpa: text(profile.undergraduateGpa),
    graduateGpa: text(profile.graduateGpa),
    doctorateGpa: text(profile.doctorateGpa),
    satScore: text(profile.satScore),
    actScore: text(profile.actScore),
    greScore: text(profile.greScore),
    heardAboutJob: text(profile.heardAboutJob),
    heardAboutJobOther:
      text(profile.heardAboutJob) === "Other"
        ? text(profile.heardAboutJobOther)
        : "",
    referrerName: text(profile.referrerName),
    referrerEmail: text(profile.referrerEmail),
    previousEmployers: companyListText([
      ...(profile.previousEmployers ?? []),
      ...workExperiences.map((entry) => entry.company),
    ]),
    compensationExpectation: text(profile.compensationExpectation),
    compensationCurrency: text(profile.compensationCurrency),
    compensationFrequency: text(profile.compensationFrequency),
    availableStartDate: text(profile.availableStartDate),
    noticePeriod: text(profile.noticePeriod),
    willingToRelocate:
      profile.willingToRelocate == null
        ? "yes"
        : choice(profile.willingToRelocate),
    willingToTravel: choice(profile.willingToTravel),
    maxTravelPercentage: text(profile.maxTravelPercentage),
    isAtLeast18: choice(profile.isAtLeast18),
    preferredOfficeLocations: listText(preferredOfficeLocations, "\n"),
    securityClearances: listText(profile.securityClearances),
    canPerformEssentialFunctions: choice(profile.canPerformEssentialFunctions),
    citizenshipStatus: !hasCountryContext
      ? ""
      : isCanada
        ? text(profile.caCitizenshipStatus)
        : text(profile.usCitizenshipStatus),
    citizenshipStatusOther: !hasCountryContext
      ? ""
      : isCanada
        ? text(profile.caCitizenshipStatus) === "Other"
          ? text(profile.caCitizenshipStatusOther)
          : ""
        : text(profile.usCitizenshipStatus) === "Other"
          ? text(profile.usCitizenshipStatusOther)
          : "",
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
    pronouns: text(profile.pronouns),
    pronounsOther:
      text(profile.pronouns) === "Other" ? text(profile.pronounsOther) : "",
    gender: text(profile.gender),
    genderOther:
      text(profile.gender) === "Other" ? text(profile.genderOther) : "",
    raceEthnicity: text(profile.raceEthnicity),
    raceEthnicityOther:
      text(profile.raceEthnicity) === "Other"
        ? text(profile.raceEthnicityOther)
        : "",
    hispanicLatino: text(profile.hispanicLatino),
    transgenderStatus: text(profile.transgenderStatus),
    disabilityStatus: text(profile.disabilityStatus),
    veteranStatus: text(profile.veteranStatus),
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

export function preferredOfficeLocationsFromTiers(
  locations: { location?: unknown; tier?: unknown }[],
): string[] {
  const acceptedTiers = new Set(["S", "A", "B", "C"]);
  const seen = new Set<string>();
  return locations
    .filter((item) => acceptedTiers.has(String(item.tier || "").toUpperCase()))
    .map((item) => (typeof item.location === "string" ? item.location.trim() : ""))
    .filter((location) => {
      const key = location.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
}

async function loadPreferredOfficeLocations(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  const response = await fetch("/api/location-tiers", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ranked office locations (${response.status}).`);
  }
  const payload = (await response.json()) as {
    locations?: { location?: unknown; tier?: unknown }[];
  };
  if (!Array.isArray(payload.locations)) {
    throw new Error("The ranked office location response is invalid.");
  }
  return preferredOfficeLocationsFromTiers(payload.locations);
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
  const [resumeFile, preferredOfficeLocations] = await Promise.all([
    loadSavedResumeFile(),
    loadPreferredOfficeLocations(),
  ]);
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_SET_PROFILE",
      profile: buildAutofillProfile(profile, undefined, preferredOfficeLocations),
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
  const [resumeFile, preferredOfficeLocations] = await Promise.all([
    loadSavedResumeFile(),
    loadPreferredOfficeLocations(),
  ]);
  return sendChromeExtensionMessage(
    {
      type: "JOB_AUTOFILL_LAUNCH",
      ...job,
      profile: buildAutofillProfile(
        profile,
        job.country,
        preferredOfficeLocations,
      ),
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
