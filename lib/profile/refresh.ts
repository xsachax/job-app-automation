import { prisma } from "../db";
import { getProfile, saveProfile, type ProfileData } from "../settings";
import { extractResumeText } from "./resume";
import { parseResume } from "../llm";
import type { ParsedResume } from "../llm/types";
import { rescoreResumeFit } from "../matching/agent";

export interface RefreshResult {
  provider: string;
  source: string;
  parsed: ParsedResume;
  updatedFields: string[];
  profile: ProfileData;
  resumeVersionId: string;
  resumeScored: number;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * "Refresh Profile": read the latest resume, parse it into structured fields, save
 * a ResumeVersion, and non-destructively fill any blank profile fields. Existing
 * non-empty answers the user set by hand are preserved.
 */
export async function refreshProfile(sourceOverride?: string): Promise<RefreshResult> {
  const profile = await getProfile();
  const source = (sourceOverride || profile.resumeSource || "").trim();
  if (!source) {
    throw new Error("No resume source set. Add a resumeSource path/URL to your profile first.");
  }

  const { text } = await extractResumeText(source);
  const { parsed, provider } = await parseResume(text);

  const version = await prisma.resumeVersion.create({
    data: { source, text, parsed: JSON.stringify(parsed) },
  });

  // Merge: only fill fields that are currently blank.
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
  // Remember where the resume came from + attach it by default if unset.
  if (isBlank(profile.resumeSource)) updates.resumeSource = source;
  if (isBlank(profile.resumePath) && !/^https?:\/\//i.test(source)) updates.resumePath = source;

  const updatedProfile = await saveProfile(updates);

  // A new resume means every job's fit is now stale — refresh the deterministic
  // baseline immediately. This also re-queues jobs for agent review (their
  // scoredResumeVersion no longer matches the latest version).
  let resumeScored = 0;
  try {
    resumeScored = (await rescoreResumeFit()).scored;
  } catch {
    // best-effort
  }

  return {
    provider,
    source,
    parsed,
    updatedFields,
    profile: updatedProfile,
    resumeVersionId: version.id,
    resumeScored,
  };
}
