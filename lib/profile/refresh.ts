import { prisma } from "../db";
import { getProfile, saveProfile, type ProfileData } from "../settings";
import { extractResumeText } from "./resume";
import { fetchResumeText } from "./pdf";
import { parseResume } from "../llm";
import type { ParsedResume } from "../llm/types";

export interface RefreshResult {
  provider: string;
  source: string;
  parsed: ParsedResume;
  updatedFields: string[];
  profile: ProfileData;
  resumeVersionId: string;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

async function readResumeSource(source: string): Promise<string> {
  if (!source) return "";
  if (/^https?:\/\//i.test(source)) return fetchResumeText(source);
  try {
    return (await extractResumeText(source)).text;
  } catch {
    return "";
  }
}

function remember(updates: ProfileData, updatedFields: string[], key: keyof ProfileData, value: unknown) {
  updates[key] = value as never;
  updatedFields.push(String(key));
}

/**
 * "Refresh Profile": read the resume URL/source when available, parse it into
 * structured fields, save a ResumeVersion, and non-destructively fill blank
 * profile fields. Existing non-empty answers the user set by hand are preserved.
 */
export async function refreshProfile(sourceOverride?: string): Promise<RefreshResult> {
  const profile = await getProfile();
  const configuredSource = (sourceOverride || profile.resumeUrl || profile.resumeSource || "").trim();
  let source = configuredSource;
  let text = await readResumeSource(source);

  if (!text && profile.resumeText?.trim()) {
    text = profile.resumeText.trim();
    source = source || "profile.resumeText";
  }

  if (!source && !text) {
    throw new Error("Add a resume PDF URL or paste resume text before refreshing your profile.");
  }

  const { parsed, provider } = await parseResume(text);

  const version = await prisma.resumeVersion.create({
    data: { source: source || "profile.resumeText", text, parsed: JSON.stringify(parsed) },
  });

  const updates: ProfileData = {};
  const updatedFields: string[] = [];
  const candidate: Record<string, unknown> = { ...parsed };
  for (const [key, value] of Object.entries(candidate)) {
    if (isBlank(value)) continue;
    if (isBlank(profile[key])) {
      updates[key] = value;
      updatedFields.push(key);
    }
  }

  if (text && (profile.resumeText !== text || isBlank(profile.resumeText))) {
    remember(updates, updatedFields, "resumeText", text);
  }
  if (/^https?:\/\//i.test(source) && isBlank(profile.resumeUrl)) {
    remember(updates, updatedFields, "resumeUrl", source);
  }
  if (isBlank(profile.resumeSource) && source && source !== "profile.resumeText") {
    remember(updates, updatedFields, "resumeSource", source);
  }
  if (isBlank(profile.resumePath) && source && !/^https?:\/\//i.test(source) && source !== "profile.resumeText") {
    remember(updates, updatedFields, "resumePath", source);
  }

  const updatedProfile = await saveProfile(updates);

  // The judge no longer runs automatically on résumé refresh — scoring is a
  // deliberate, button-triggered action (see /judge and the profile "Re-run
  // judge" control) so a résumé change never silently rewrites every fit score.
  return {
    provider,
    source: source || "profile.resumeText",
    parsed,
    updatedFields,
    profile: updatedProfile,
    resumeVersionId: version.id,
  };
}
