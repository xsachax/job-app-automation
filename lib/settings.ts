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
  location?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  portfolio?: string;
  summary?: string;
  skills?: string[];
  resumeUrl?: string; // public/direct URL to the user's PDF resume
  resumeText?: string; // pasted or parsed plain-text resume content
  targetRoles?: string[]; // roles the user wants the discovery judge to favor
  qualifications?: string; // degree, graduation date, projects, constraints
  // Common compliance / eligibility questions.
  workAuthorized?: boolean | null;
  requiresSponsorship?: boolean | null;
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
  location: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
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
  workAuthorized: null,
  requiresSponsorship: null,
  gender: "",
  raceEthnicity: "",
  veteranStatus: "",
  disabilityStatus: "",
  resumeSource: "",
  resumePath: "",
  coverLetterTemplate: "",
};

export async function getProfile(): Promise<ProfileData> {
  const row = await prisma.profile.findUnique({ where: { id: "me" } });
  if (!row) return { ...DEFAULT_PROFILE };
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(row.data) as ProfileData) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(data: ProfileData): Promise<ProfileData> {
  const current = await getProfile();
  const merged = { ...current, ...data };
  await prisma.profile.upsert({
    where: { id: "me" },
    update: { data: JSON.stringify(merged) },
    create: { id: "me", data: JSON.stringify(merged) },
  });
  return merged;
}
