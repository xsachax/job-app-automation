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
  pronouns?: string;
  pronounsOther?: string;
  gender?: string;
  genderOther?: string;
  raceEthnicity?: string;
  raceEthnicityOther?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  [key: string]: unknown;
}

export interface DraftJob {
  title: string;
  company: string;
  applyUrl: string;
  country?: string | null;
}

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

function otherDetail(selection: unknown, detail: unknown): string | undefined {
  return s(selection).trim() === "Other" ? s(detail).trim() || undefined : undefined;
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
  const isCanada = ["ca", "canada"].includes(
    String(job.country || "").toLowerCase(),
  );
  return {
    firstName: s(profile.firstName),
    lastName: s(profile.lastName),
    email: s(profile.email),
    phone: s(profile.phone),
    location: isCanada
      ? s(profile.caLocation)
      : s(profile.usLocation) || s(profile.location),
    linkedin: s(profile.linkedin),
    github: s(profile.github),
    website: s(profile.website) || s(profile.portfolio),
    resume: s(profile.resumePath) || s(profile.resumeSource),
    coverLetter: renderCoverLetter(profile.coverLetterTemplate, job, profile),
    workAuthorized: isCanada
      ? profile.caWorkAuthorized ?? undefined
      : profile.usWorkAuthorized ?? profile.workAuthorized ?? undefined,
    requiresSponsorship: isCanada
      ? profile.caRequiresSponsorship ?? undefined
      : profile.usRequiresSponsorship ??
        profile.requiresSponsorship ??
        undefined,
    pronouns: s(profile.pronouns) || undefined,
    pronounsOther: otherDetail(profile.pronouns, profile.pronounsOther),
    gender: s(profile.gender) || undefined,
    genderOther: otherDetail(profile.gender, profile.genderOther),
    raceEthnicity: s(profile.raceEthnicity) || undefined,
    raceEthnicityOther: otherDetail(
      profile.raceEthnicity,
      profile.raceEthnicityOther,
    ),
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
