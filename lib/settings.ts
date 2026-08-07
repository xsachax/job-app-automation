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
  degreeOther?: string;
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
  heardAboutJobOther?: string;
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
  degreeOther: "",
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
  heardAboutJobOther: "",
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

function normalizeProfileData(data: ProfileData): ProfileData {
  const profile = { ...DEFAULT_PROFILE, ...data };
  delete profile[PROFILE_FIELD_VERSIONS_KEY];
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
