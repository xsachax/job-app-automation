import { prisma } from "../db";
import { getProfile, type ProfileData } from "../settings";
import { scoreResumeFit, type ResumeContext } from "../matching/resume";
import { applyTierModifier, isTier, normalizeCompanyKey, type Tier } from "../tiers";

export interface ScoreAllJobsOptions {
  onlyUnscored?: boolean;
  country?: string;
  limit?: number;
  force?: boolean;
}

export interface ScoreAllJobsResult {
  scanned: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
  provider: "deterministic";
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const item = value.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function compactText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function buildResumeContext(profile: ProfileData): ResumeContext {
  const skills = cleanList(profile.skills);
  const titles = cleanList([
    ...(Array.isArray(profile.targetRoles) ? profile.targetRoles : []),
    ...(Array.isArray(profile.titles) ? profile.titles : []),
  ]);
  const summary = compactText(profile.summary, profile.qualifications);
  const text = compactText(profile.summary, profile.qualifications, profile.resumeText);
  return { skills, titles, summary, text };
}

function parseJobSkills(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return cleanList(parsed);
  } catch {
    return [];
  }
}

function deterministicSummary(
  score: number,
  reasons: string[],
  missingSignals: string[],
  tier?: Tier | null,
): string {
  const fit = score >= 70 ? "Strong fit" : score >= 40 ? "Possible fit" : "Weak fit";
  const reason = reasons[0] ?? "limited resume overlap";
  const gap = missingSignals.length ? ` Gaps: ${missingSignals.slice(0, 3).join(", ")}.` : "";
  const tierNote = isTier(tier) ? ` Tier ${tier}.` : "";
  return `${fit}: ${reason}.${gap}${tierNote}`.replace(/\.\./g, ".").slice(0, 300);
}

export async function scoreAllJobs(opts: ScoreAllJobsOptions = {}): Promise<ScoreAllJobsResult> {
  const profile = await getProfile();
  const resume = buildResumeContext(profile);
  const take = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 1000) : undefined;

  const tierRows = await prisma.companyTier.findMany();
  const tierByCompany = new Map<string, Tier>();
  for (const row of tierRows) {
    if (isTier(row.tier)) tierByCompany.set(normalizeCompanyKey(row.company), row.tier);
  }

  const jobs = await prisma.job.findMany({
    where: {
      isWorkday: false,
      isEntryLevel: true,
      ...(opts.country ? { country: opts.country } : {}),
      ...(opts.onlyUnscored ? { fitScore: null } : {}),
    },
    orderBy: [{ fitScore: "desc" }, { firstSeenAt: "desc" }],
    take,
  });

  const now = new Date();
  let scored = 0;
  let preservedAgent = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (job.fitProvider === "agent" && !opts.force) {
      preservedAgent++;
      continue;
    }

    const skills = parseJobSkills(job.skills);
    const description = compactText(job.description, skills.length ? `Skills: ${skills.join(", ")}` : "");
    const result = scoreResumeFit(
      { title: job.title, company: job.company, description },
      resume,
    );

    const tier = tierByCompany.get(normalizeCompanyKey(job.company)) ?? null;
    const adjustedScore = applyTierModifier(result.score, tier);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        fitScore: adjustedScore,
        fitReasons: JSON.stringify(result.reasons.slice(0, 5)),
        fitSummary: deterministicSummary(adjustedScore, result.reasons, result.missingSignals, tier),
        fitProvider: "deterministic",
        fitScoredAt: now,
      },
    });
    scored++;
  }

  skipped = jobs.length - scored - preservedAgent;
  return { scanned: jobs.length, scored, preservedAgent, skipped, provider: "deterministic" };
}
