import { prisma } from "../db";
import { getCriteria, getProfile, type ProfileData } from "../settings";
import { scoreResumeFit, type ResumeContext } from "../matching/resume";
import { salaryFit } from "../matching/salary";
import { normalizeLocation, normalizeLocationKey } from "../locations";
import { clampScore, isTier, normalizeCompanyKey, TIER_MODIFIER, UNRANKED_COMPANY_MODIFIER, type Tier } from "../tiers";
import { fitAdvice, gapAdvice } from "./advice";
import { freshnessFit } from "./freshness";

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
  strengths: string[],
  gaps: string[],
): string {
  const fit = score >= 70 ? "Strong fit" : score >= 40 ? "Possible fit" : "Weak fit";
  const reason = strengths[0] ?? "The résumé has limited direct overlap";
  const gap = gaps[0] ? ` Watch-out: ${gaps[0]}.` : "";
  return `${fit}: ${reason}.${gap}`.replace(/\.\./g, ".").slice(0, 300);
}

export async function scoreAllJobs(opts: ScoreAllJobsOptions = {}): Promise<ScoreAllJobsResult> {
  const profile = await getProfile();
  const resume = buildResumeContext(profile);
  const criteria = await getCriteria();
  const salaryTarget = typeof criteria.salaryTarget === "number" ? criteria.salaryTarget : null;
  const take = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 1000) : undefined;

  const tierRows = await prisma.companyTier.findMany();
  const tierByCompany = new Map<string, Tier>();
  for (const row of tierRows) {
    if (isTier(row.tier)) tierByCompany.set(normalizeCompanyKey(row.company), row.tier);
  }

  const locationTierRows = await prisma.locationTier.findMany();
  const tierByLocation = new Map<string, Tier>();
  for (const row of locationTierRows) {
    if (isTier(row.tier)) tierByLocation.set(normalizeLocationKey(row.location), row.tier);
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
      { title: job.title, company: job.company, description, skills },
      resume,
    );

    const tier = tierByCompany.get(normalizeCompanyKey(job.company)) ?? null;
    const canonicalLoc = normalizeLocation(job.location);
    const locTier = canonicalLoc ? tierByLocation.get(normalizeLocationKey(canonicalLoc)) ?? null : null;
    const salary = salaryFit(job, salaryTarget);
    const freshness = freshnessFit(job, now);

    // Unranked companies take a mild default penalty so ranking is worthwhile;
    // unranked locations stay neutral (see UNRANKED_COMPANY_MODIFIER).
    const companyMod = isTier(tier) ? TIER_MODIFIER[tier] : UNRANKED_COMPANY_MODIFIER;
    const locationMod = isTier(locTier) ? TIER_MODIFIER[locTier] : 0;
    const adjustedScore = clampScore(
      result.score + companyMod + locationMod + salary.delta + freshness.delta,
    );

    const strengths = result.reasons.filter(
      (reason) => !/\b(?:limited|no résumé skills)\b/i.test(reason),
    );
    const gaps: string[] = [];
    if ((resume.skills?.length ?? 0) > 0 && result.matchedSkills.length === 0) {
      gaps.push("No saved résumé skills directly match the posting");
    }
    if (result.missingSignals.length) {
      gaps.push(`Résumé does not show ${result.missingSignals.slice(0, 4).join(", ")}`);
    }
    if (job.minYoE != null && job.minYoE > 0) {
      gaps.push(
        `Posting asks for ${job.minYoE}+ ${
          job.minYoE === 1 ? "year" : "years"
        } of experience; verify the requirement`,
      );
    }

    if (freshness.reason) {
      if (freshness.delta > 0) {
        strengths.splice(Math.min(1, strengths.length), 0, freshness.reason);
      } else {
        gaps.push(freshness.reason);
      }
    }
    if (salary.reason && salary.delta !== 0) {
      (salary.delta > 0 ? strengths : gaps).push(salary.reason);
    } else if (salary.reason && !salary.known) {
      gaps.push("Salary is not listed");
    }
    if (isTier(tier) && companyMod !== 0) {
      const reason = `${job.company} is company tier ${tier} (${companyMod > 0 ? "+" : ""}${companyMod})`;
      (companyMod > 0 ? strengths : gaps).push(reason);
    } else if (!isTier(tier)) {
      gaps.push(`${job.company} is unranked (${UNRANKED_COMPANY_MODIFIER})`);
    }
    if (isTier(locTier) && canonicalLoc && locationMod !== 0) {
      const reason = `${canonicalLoc} is location tier ${locTier} (${locationMod > 0 ? "+" : ""}${locationMod})`;
      (locationMod > 0 ? strengths : gaps).push(reason);
    }

    const advice = [
      ...strengths.slice(0, 6).map(fitAdvice),
      ...gaps.slice(0, 6).map(gapAdvice),
    ];

    await prisma.job.update({
      where: { id: job.id },
      data: {
        fitScore: adjustedScore,
        fitReasons: JSON.stringify(advice),
        fitSummary: deterministicSummary(adjustedScore, strengths, gaps),
        fitProvider: "deterministic",
        fitScoredAt: now,
      },
    });
    scored++;
  }

  skipped = jobs.length - scored - preservedAgent;
  return { scanned: jobs.length, scored, preservedAgent, skipped, provider: "deterministic" };
}
