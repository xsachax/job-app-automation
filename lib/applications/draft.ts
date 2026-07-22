import type { ProfileData } from "../settings";

export interface ApplicationFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  resume: string; // path or URL to attach
  coverLetter?: string;
  workAuthorized?: boolean;
  requiresSponsorship?: boolean;
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  [key: string]: unknown;
}

export interface DraftJob {
  title: string;
  company: string;
  applyUrl: string;
}

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

function renderCoverLetter(
  tpl: string | undefined,
  job: DraftJob,
  profile: ProfileData,
): string | undefined {
  if (!tpl || !tpl.trim()) return undefined;
  return tpl
    .replace(/\{\{\s*company\s*\}\}/gi, job.company)
    .replace(/\{\{\s*title\s*\}\}/gi, job.title)
    .replace(/\{\{\s*firstName\s*\}\}/gi, s(profile.firstName))
    .replace(/\{\{\s*lastName\s*\}\}/gi, s(profile.lastName));
}

// Map the canonical profile onto the standard fields Greenhouse/Lever/Ashby ask for.
export function buildFields(job: DraftJob, profile: ProfileData): ApplicationFields {
  return {
    firstName: s(profile.firstName),
    lastName: s(profile.lastName),
    email: s(profile.email),
    phone: s(profile.phone),
    location: s(profile.location),
    linkedin: s(profile.linkedin),
    github: s(profile.github),
    website: s(profile.website) || s(profile.portfolio),
    resume: s(profile.resumePath) || s(profile.resumeSource),
    coverLetter: renderCoverLetter(profile.coverLetterTemplate, job, profile),
    workAuthorized: profile.workAuthorized,
    requiresSponsorship: profile.requiresSponsorship,
    gender: s(profile.gender) || undefined,
    raceEthnicity: s(profile.raceEthnicity) || undefined,
    veteranStatus: s(profile.veteranStatus) || undefined,
    disabilityStatus: s(profile.disabilityStatus) || undefined,
  };
}

const REQUIRED: (keyof ApplicationFields)[] = ["firstName", "lastName", "email", "resume"];

// Which required fields are still blank (surfaced in the review card before sending).
export function missingRequired(fields: ApplicationFields): string[] {
  return REQUIRED.filter((k) => {
    const v = fields[k];
    return v == null || String(v).trim() === "";
  }) as string[];
}
