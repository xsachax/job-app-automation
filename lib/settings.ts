import { prisma } from "./db";
import type { Criteria } from "./matching/score";
import {
  PROFILE_FIELD_VERSIONS_KEY,
  parseProfileFieldVersions,
  type ProfileFieldVersions,
} from "./profile/versioning";

export const DEFAULT_CRITERIA: Criteria = {
  titles: ["Software Engineer"],
  locations: [],
  keywords: [],
  excludeKeywords: [],
  remoteOnly: false,
  seniority: [],
  salaryTarget: null,
};

export async function getCriteria(): Promise<Criteria> {
  const row = await prisma.criteria.findUnique({ where: { id: "default" } });
  if (!row) return { ...DEFAULT_CRITERIA };
  try {
    return { ...DEFAULT_CRITERIA, ...(JSON.parse(row.data) as Criteria) };
  } catch {
    return { ...DEFAULT_CRITERIA };
  }
}

export async function saveCriteria(data: Criteria): Promise<Criteria> {
  const merged = { ...DEFAULT_CRITERIA, ...data };
  await prisma.criteria.upsert({
    where: { id: "default" },
    update: { data: JSON.stringify(merged) },
    create: { id: "default", data: JSON.stringify(merged) },
  });
  return merged;
}

export interface ProfileWorkExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  currentRole: boolean | null;
  description: string;
}

export interface ProfileEducationEntry {
  school: string;
  degree: string;
  degreeOther: string;
  fieldOfStudy: string;
  startDate: string;
  graduationDate: string;
  graduationDateExact?: string;
  gpa: string;
}

export interface ProfileCredential {
  name: string;
  issuer: string;
  credentialId: string;
  issueDate: string;
  expirationDate: string;
  doesNotExpire: boolean | null;
}

export interface ProfileLanguage {
  language: string;
  overallProficiency: string;
  speakingProficiency: string;
  readingProficiency: string;
  writingProficiency: string;
}

export interface ProfileWebsite {
  label: string;
  url: string;
}

// Canonical answers to the questions typically asked on application forms.
export interface ProfileData {
  firstName?: string;
  preferredName?: string;
  middleName?: string;
  lastName?: string;
  nameSuffix?: string;
  email?: string;
  phone?: string;
  phoneCountryCode?: string;
  phoneType?: string;
  phoneExtension?: string;
  homeAddressLine1?: string;
  homeAddressLine2?: string;
  homeCity?: string;
  homeRegion?: string;
  homePostalCode?: string;
  homeCountry?: string;
  location?: string; // legacy; migrated to usLocation
  linkedin?: string;
  github?: string;
  website?: string;
  portfolio?: string;
  additionalWebsites?: ProfileWebsite[];
  summary?: string;
  skills?: string[];
  resumeUrl?: string; // public/direct URL to the user's PDF resume
  resumeText?: string; // pasted or parsed plain-text resume content
  targetRoles?: string[]; // roles the user wants the discovery judge to favor
  qualifications?: string; // legacy free-form value; structured fields below take precedence
  school?: string;
  degree?: string;
  degreeOther?: string;
  fieldOfStudy?: string;
  educationStartDate?: string; // YYYY-MM
  graduationDate?: string; // YYYY-MM
  graduationDateExact?: string; // YYYY-MM-DD
  additionalEducation?: ProfileEducationEntry[];
  workExperiences?: ProfileWorkExperience[];
  relevantExperienceYears?: number | null;
  softwareIndustryExperienceYears?: number | null;
  certifications?: ProfileCredential[];
  languages?: ProfileLanguage[];
  undergraduateGpa?: string;
  graduateGpa?: string;
  doctorateGpa?: string;
  satScore?: string;
  actScore?: string;
  greScore?: string;
  heardAboutJob?: string;
  heardAboutJobOther?: string;
  referrerName?: string;
  referrerEmail?: string;
  previousEmployers?: string[];
  compensationExpectation?: string;
  compensationCurrency?: string;
  compensationFrequency?: string;
  availableStartDate?: string; // YYYY-MM-DD
  noticePeriod?: string;
  willingToRelocate?: boolean | null;
  willingToTravel?: boolean | null;
  maxTravelPercentage?: string;
  isAtLeast18?: boolean | null;
  securityClearances?: string[];
  canPerformEssentialFunctions?: boolean | null;
  usCitizenshipStatus?: string;
  usCitizenshipStatusOther?: string;
  caCitizenshipStatus?: string;
  caCitizenshipStatusOther?: string;
  pronouns?: string;
  pronounsOther?: string;
  gender?: string;
  genderOther?: string;
  raceEthnicity?: string;
  raceEthnicityOther?: string;
  hispanicLatino?: string;
  transgenderStatus?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  // Common compliance / eligibility questions.
  workAuthorized?: boolean | null; // legacy; migrated to country-specific answers
  requiresSponsorship?: boolean | null; // legacy; migrated to country-specific answers
  usCountry?: string;
  usLocation?: string;
  usWorkAuthorized?: boolean | null;
  usRequiresSponsorship?: boolean | null;
  caCountry?: string;
  caLocation?: string;
  caWorkAuthorized?: boolean | null;
  caRequiresSponsorship?: boolean | null;
  // Where the resume lives + what to attach.
  resumeSource?: string; // path or URL "Refresh Profile" reads from
  resumePath?: string; // file attached to applications
  coverLetterTemplate?: string;
  [key: string]: unknown;
}

export const DEFAULT_PROFILE: ProfileData = {
  firstName: "",
  preferredName: "",
  middleName: "",
  lastName: "",
  nameSuffix: "",
  email: "",
  phone: "",
  phoneCountryCode: "",
  phoneType: "",
  phoneExtension: "",
  homeAddressLine1: "",
  homeAddressLine2: "",
  homeCity: "",
  homeRegion: "",
  homePostalCode: "",
  homeCountry: "",
  linkedin: "",
  github: "",
  website: "",
  portfolio: "",
  additionalWebsites: [],
  summary: "",
  skills: [],
  resumeUrl: "",
  resumeText: "",
  targetRoles: [],
  qualifications: "",
  school: "",
  degree: "",
  degreeOther: "",
  fieldOfStudy: "",
  educationStartDate: "",
  graduationDate: "",
  graduationDateExact: "",
  additionalEducation: [],
  workExperiences: [],
  relevantExperienceYears: null,
  softwareIndustryExperienceYears: null,
  certifications: [],
  languages: [],
  undergraduateGpa: "",
  graduateGpa: "",
  doctorateGpa: "",
  satScore: "",
  actScore: "",
  greScore: "",
  heardAboutJob: "",
  heardAboutJobOther: "",
  referrerName: "",
  referrerEmail: "",
  previousEmployers: [],
  compensationExpectation: "",
  compensationCurrency: "",
  compensationFrequency: "",
  availableStartDate: "",
  noticePeriod: "",
  willingToRelocate: null,
  willingToTravel: null,
  maxTravelPercentage: "",
  isAtLeast18: null,
  securityClearances: [],
  canPerformEssentialFunctions: null,
  usCitizenshipStatus: "",
  usCitizenshipStatusOther: "",
  caCitizenshipStatus: "",
  caCitizenshipStatusOther: "",
  pronouns: "",
  pronounsOther: "",
  gender: "",
  genderOther: "",
  raceEthnicity: "",
  raceEthnicityOther: "",
  hispanicLatino: "",
  transgenderStatus: "",
  veteranStatus: "",
  disabilityStatus: "",
  usCountry: "United States",
  usLocation: "",
  usWorkAuthorized: null,
  usRequiresSponsorship: null,
  caCountry: "Canada",
  caLocation: "",
  caWorkAuthorized: null,
  caRequiresSponsorship: null,
  resumeSource: "",
  resumePath: "",
  coverLetterTemplate: "",
};

const LEGACY_PROFILE_KEYS = [
  "location",
  "addressLine1",
  "city",
  "state",
  "postalCode",
  "country",
  "workAuthorized",
  "requiresSponsorship",
  "spacexEmploymentHistory",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maxLength = 1_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function triState(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

function monthValue(value: unknown): string {
  const text = boundedText(value, 7);
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(text) ? text : "";
}

function dateValue(value: unknown): string {
  const text = boundedText(value, 10);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(text)) {
    return "";
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
    ? ""
    : text;
}

function percentageValue(value: unknown): string {
  const text = boundedText(value, 3);
  if (!/^\d{1,3}$/.test(text)) return "";
  const percentage = Number(text);
  return percentage <= 100 ? String(percentage) : "";
}

function limitedRecords(
  value: unknown,
  limit: number,
): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is Record<string, unknown> => Boolean(item)).slice(0, limit)
    : [];
}

function normalizeWorkExperiences(value: unknown): ProfileWorkExperience[] {
  return limitedRecords(value, 20)
    .map((item) => {
      const currentRole = triState(item.currentRole);
      return {
        company: boundedText(item.company, 200),
        title: boundedText(item.title, 200),
        location: boundedText(item.location, 300),
        startDate: monthValue(item.startDate),
        endDate: currentRole === true ? "" : monthValue(item.endDate),
        currentRole,
        description: boundedText(item.description, 5_000),
      };
    })
    .filter((item) => item.company || item.title);
}

function normalizeEducationEntries(value: unknown): ProfileEducationEntry[] {
  return limitedRecords(value, 10)
    .map((item) => {
      const graduationDateExact = dateValue(item.graduationDateExact);
      return {
        school: boundedText(item.school, 300),
        degree: boundedText(item.degree, 200),
        degreeOther: boundedText(item.degreeOther, 200),
        fieldOfStudy: boundedText(item.fieldOfStudy, 200),
        startDate: monthValue(item.startDate),
        graduationDate:
          graduationDateExact.slice(0, 7) || monthValue(item.graduationDate),
        graduationDateExact,
        gpa: boundedText(item.gpa, 20),
      };
    })
    .filter((item) => item.school || item.degree || item.fieldOfStudy);
}

function normalizeCredentials(value: unknown): ProfileCredential[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .map((item) => {
      if (typeof item === "string") {
        return {
          name: boundedText(item, 300),
          issuer: "",
          credentialId: "",
          issueDate: "",
          expirationDate: "",
          doesNotExpire: null,
        };
      }
      const entry = record(item);
      if (!entry) return null;
      const doesNotExpire = triState(entry.doesNotExpire);
      return {
        name: boundedText(entry.name, 300),
        issuer: boundedText(entry.issuer, 300),
        credentialId: boundedText(entry.credentialId, 200),
        issueDate: monthValue(entry.issueDate),
        expirationDate:
          doesNotExpire === true ? "" : monthValue(entry.expirationDate),
        doesNotExpire,
      };
    })
    .filter((item): item is ProfileCredential => Boolean(item?.name));
}

function normalizeLanguages(value: unknown): ProfileLanguage[] {
  return limitedRecords(value, 20)
    .map((item) => ({
      language: boundedText(item.language, 100),
      overallProficiency: boundedText(item.overallProficiency, 100),
      speakingProficiency: boundedText(item.speakingProficiency, 100),
      readingProficiency: boundedText(item.readingProficiency, 100),
      writingProficiency: boundedText(item.writingProficiency, 100),
    }))
    .filter((item) => item.language);
}

function normalizeWebsites(value: unknown): ProfileWebsite[] {
  return limitedRecords(value, 20)
    .map((item) => ({
      label: boundedText(item.label, 100),
      url: boundedText(item.url, 2_000),
    }))
    .filter((item) => item.url);
}

function normalizeProfileData(data: ProfileData): ProfileData {
  const profile = { ...DEFAULT_PROFILE, ...data };
  delete profile[PROFILE_FIELD_VERSIONS_KEY];
  profile.middleName = boundedText(profile.middleName, 200);
  profile.nameSuffix = boundedText(profile.nameSuffix, 100);
  profile.phoneCountryCode = boundedText(profile.phoneCountryCode, 20);
  profile.phoneType = boundedText(profile.phoneType, 100);
  profile.phoneExtension = boundedText(profile.phoneExtension, 30);
  profile.homeAddressLine1 = boundedText(profile.homeAddressLine1, 300);
  profile.homeAddressLine2 = boundedText(profile.homeAddressLine2, 300);
  profile.homeCity = boundedText(profile.homeCity, 200);
  profile.homeRegion = boundedText(profile.homeRegion, 200);
  profile.homePostalCode = boundedText(profile.homePostalCode, 40);
  profile.homeCountry = boundedText(profile.homeCountry, 200);
  profile.additionalWebsites = normalizeWebsites(profile.additionalWebsites);
  profile.educationStartDate = monthValue(profile.educationStartDate);
  profile.graduationDateExact = dateValue(profile.graduationDateExact);
  profile.graduationDate =
    profile.graduationDateExact.slice(0, 7) ||
    monthValue(profile.graduationDate);
  profile.additionalEducation = normalizeEducationEntries(
    profile.additionalEducation,
  );
  profile.workExperiences = normalizeWorkExperiences(profile.workExperiences);
  profile.certifications = normalizeCredentials(profile.certifications);
  profile.languages = normalizeLanguages(profile.languages);
  profile.referrerName = boundedText(profile.referrerName, 300);
  profile.referrerEmail = boundedText(profile.referrerEmail, 320);
  profile.compensationCurrency = boundedText(profile.compensationCurrency, 40);
  profile.compensationFrequency = boundedText(profile.compensationFrequency, 80);
  profile.availableStartDate = dateValue(profile.availableStartDate);
  profile.noticePeriod = boundedText(profile.noticePeriod, 200);
  profile.willingToRelocate = triState(profile.willingToRelocate);
  profile.willingToTravel = triState(profile.willingToTravel);
  profile.maxTravelPercentage =
    profile.willingToTravel === false
      ? ""
      : percentageValue(profile.maxTravelPercentage);
  profile.isAtLeast18 = triState(profile.isAtLeast18);
  const legacyCountry = String(profile.country || "").trim().toLowerCase();
  const legacyIsCanada =
    legacyCountry === "ca" || legacyCountry.includes("canada");
  if (legacyIsCanada) {
    if (!profile.caLocation && profile.location) profile.caLocation = profile.location;
    if (profile.caWorkAuthorized == null && profile.workAuthorized != null) {
      profile.caWorkAuthorized = profile.workAuthorized;
    }
    if (
      profile.caRequiresSponsorship == null &&
      profile.requiresSponsorship != null
    ) {
      profile.caRequiresSponsorship = profile.requiresSponsorship;
    }
  } else {
    if (!profile.usLocation && profile.location) profile.usLocation = profile.location;
    if (profile.usWorkAuthorized == null && profile.workAuthorized != null) {
      profile.usWorkAuthorized = profile.workAuthorized;
    }
    if (
      profile.usRequiresSponsorship == null &&
      profile.requiresSponsorship != null
    ) {
      profile.usRequiresSponsorship = profile.requiresSponsorship;
    }
  }
  for (const key of LEGACY_PROFILE_KEYS) {
    delete profile[key];
  }
  return profile;
}

function parseStoredProfile(data?: string): {
  profile: ProfileData;
  fieldVersions: ProfileFieldVersions;
} {
  if (!data) {
    return { profile: { ...DEFAULT_PROFILE }, fieldVersions: {} };
  }
  try {
    const parsed = JSON.parse(data) as ProfileData;
    return {
      profile: normalizeProfileData(parsed),
      fieldVersions: parseProfileFieldVersions(
        parsed[PROFILE_FIELD_VERSIONS_KEY],
      ),
    };
  } catch {
    return { profile: { ...DEFAULT_PROFILE }, fieldVersions: {} };
  }
}

export async function getProfile(): Promise<ProfileData> {
  const row = await prisma.profile.findUnique({ where: { id: "me" } });
  return parseStoredProfile(row?.data).profile;
}

export async function saveProfile(
  data: ProfileData,
  options: { fieldVersions?: ProfileFieldVersions } = {},
): Promise<ProfileData> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.profile.findUnique({ where: { id: "me" } });
    const stored = parseStoredProfile(row?.data);
    const mergedInput = { ...stored.profile };
    const nextVersions = { ...stored.fieldVersions };
    const receivedAt = Date.now();
    let resumeUrlChanged = false;

    for (const [key, value] of Object.entries(data)) {
      if (key === PROFILE_FIELD_VERSIONS_KEY) continue;
      const incomingVersion = options.fieldVersions?.[key] ?? receivedAt;
      if (incomingVersion < (nextVersions[key] ?? 0)) continue;
      if (
        key === "resumeUrl" &&
        String(mergedInput.resumeUrl || "").trim() !== String(value || "").trim()
      ) {
        resumeUrlChanged = true;
      }
      mergedInput[key] = value;
      nextVersions[key] = incomingVersion;
    }

    const merged = normalizeProfileData(mergedInput);
    for (const key of LEGACY_PROFILE_KEYS) {
      delete nextVersions[key];
    }
    await tx.profile.upsert({
      where: { id: "me" },
      update: {
        data: JSON.stringify({
          ...merged,
          [PROFILE_FIELD_VERSIONS_KEY]: nextVersions,
        }),
      },
      create: {
        id: "me",
        data: JSON.stringify({
          ...merged,
          [PROFILE_FIELD_VERSIONS_KEY]: nextVersions,
        }),
      },
    });
    if (resumeUrlChanged) {
      await tx.resumeAsset.deleteMany({ where: { id: "me" } });
    }
    return merged;
  });
}
