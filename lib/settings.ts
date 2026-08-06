import { prisma } from "./db";
import type { Criteria } from "./matching/score";

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

// Canonical answers to the questions typically asked on Greenhouse/Lever/Ashby forms.
export interface ProfileData {
  firstName?: string;
  preferredName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string; // legacy; migrated to usLocation
  linkedin?: string;
  github?: string;
  website?: string;
  portfolio?: string;
  summary?: string;
  skills?: string[];
  resumeUrl?: string; // public/direct URL to the user's PDF resume
  resumeText?: string; // pasted or parsed plain-text resume content
  targetRoles?: string[]; // roles the user wants the discovery judge to favor
  qualifications?: string; // legacy free-form value; structured fields below take precedence
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationDate?: string; // YYYY-MM
  relevantExperienceYears?: number | null;
  certifications?: string[];
  undergraduateGpa?: string;
  graduateGpa?: string;
  doctorateGpa?: string;
  satScore?: string;
  actScore?: string;
  greScore?: string;
  heardAboutJob?: string;
  securityClearances?: string[];
  spacexEmploymentHistory?: string;
  canPerformEssentialFunctions?: boolean | null;
  usCitizenshipStatus?: string;
  caCitizenshipStatus?: string;
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
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  // Where the resume lives + what to attach.
  resumeSource?: string; // path or URL "Refresh Profile" reads from
  resumePath?: string; // file attached to applications
  coverLetterTemplate?: string;
  [key: string]: unknown;
}

export const DEFAULT_PROFILE: ProfileData = {
  firstName: "",
  preferredName: "",
  lastName: "",
  email: "",
  phone: "",
  linkedin: "",
  github: "",
  website: "",
  portfolio: "",
  summary: "",
  skills: [],
  resumeUrl: "",
  resumeText: "",
  targetRoles: [],
  qualifications: "",
  school: "",
  degree: "",
  fieldOfStudy: "",
  graduationDate: "",
  relevantExperienceYears: null,
  certifications: [],
  undergraduateGpa: "",
  graduateGpa: "",
  doctorateGpa: "",
  satScore: "",
  actScore: "",
  greScore: "",
  heardAboutJob: "",
  securityClearances: [],
  spacexEmploymentHistory: "",
  canPerformEssentialFunctions: null,
  usCitizenshipStatus: "",
  caCitizenshipStatus: "",
  usCountry: "United States",
  usLocation: "",
  usWorkAuthorized: null,
  usRequiresSponsorship: null,
  caCountry: "Canada",
  caLocation: "",
  caWorkAuthorized: null,
  caRequiresSponsorship: null,
  gender: "",
  raceEthnicity: "",
  veteranStatus: "",
  disabilityStatus: "",
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
] as const;

function normalizeProfileData(data: ProfileData): ProfileData {
  const profile = { ...DEFAULT_PROFILE, ...data };
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

export async function getProfile(): Promise<ProfileData> {
  const row = await prisma.profile.findUnique({ where: { id: "me" } });
  if (!row) return { ...DEFAULT_PROFILE };
  try {
    return normalizeProfileData(JSON.parse(row.data) as ProfileData);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(data: ProfileData): Promise<ProfileData> {
  const current = await getProfile();
  const merged = normalizeProfileData({ ...current, ...data });
  const resumeUrlChanged =
    Object.prototype.hasOwnProperty.call(data, "resumeUrl") &&
    String(current.resumeUrl || "").trim() !==
      String(merged.resumeUrl || "").trim();
  await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { id: "me" },
      update: { data: JSON.stringify(merged) },
      create: { id: "me", data: JSON.stringify(merged) },
    });
    if (resumeUrlChanged) {
      await tx.resumeAsset.deleteMany({ where: { id: "me" } });
    }
  });
  return merged;
}
