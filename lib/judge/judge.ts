import type { Job, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getCriteria, getProfile, type ProfileData } from "../settings";
import { scoreResumeFit, type ResumeContext } from "../matching/resume";
import { salaryFit } from "../matching/salary";
import { normalizeLocation, normalizeLocationKey } from "../locations";
import { ACTIVE_JOB_WHERE } from "../jobs/availability";
import {
  isTier,
  latestCompanyTiersByKey,
  normalizeCompanyKey,
  tierModifier,
  type Tier,
} from "../tiers";
import { fitAdvice, gapAdvice } from "./advice";
import { freshnessFit } from "./freshness";
import {
  companyTierScoreBand,
  tierFirstJudgeScore,
} from "./scoring";
import { minRequiredBachelorYoE } from "../discovery/entryLevel";

export interface ScoreAllJobsOptions {
  onlyUnscored?: boolean;
  country?: string;
  limit?: number;
  force?: boolean;
  jobIds?: string[];
  onProgress?: (progress: ScoreAllJobsProgress) => void;
}

export interface ScoreAllJobsProgress {
  processed: number;
  total: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
  currentJob: { id: string; company: string; title: string } | null;
}

export interface ScoreAllJobsResult {
  scanned: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
  provider: "deterministic";
}

type JobScoreSnapshot = Pick<
  Job,
  | "id"
  | "fitBaseScore"
  | "fitBaseReasons"
  | "fitBaseSummary"
  | "fitScore"
  | "fitReasons"
  | "fitSummary"
  | "fitProvider"
  | "fitScoredAt"
>;

function scoreSnapshotWhere(job: JobScoreSnapshot): Prisma.JobWhereInput {
  return {
    id: job.id,
    fitBaseScore: job.fitBaseScore,
    fitBaseReasons: job.fitBaseReasons,
    fitBaseSummary: job.fitBaseSummary,
    fitScore: job.fitScore,
    fitReasons: job.fitReasons,
    fitSummary: job.fitSummary,
    fitProvider: job.fitProvider,
    fitScoredAt: job.fitScoredAt,
  };
}

export async function updateJobScoreFromSnapshot(
  job: JobScoreSnapshot,
  data: Prisma.JobUpdateManyMutationInput,
): Promise<boolean> {
  const update = await prisma.job.updateMany({
    where: scoreSnapshotWhere(job),
    data,
  });
  return update.count === 1;
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

export function buildQualificationContext(profile: ProfileData): string {
  const degree =
    profile.degree?.trim() === "Other" && profile.degreeOther?.trim()
      ? profile.degreeOther.trim()
      : profile.degree?.trim();
  const education = [degree, profile.fieldOfStudy?.trim()]
    .filter(Boolean)
    .join(" in ");
  const structured = compactText(
    profile.school?.trim() ? `School: ${profile.school.trim()}` : null,
    education ? `Education: ${education}` : null,
    profile.graduationDate?.trim()
      ? `Graduation date: ${profile.graduationDate.trim()}`
      : null,
    typeof profile.relevantExperienceYears === "number" &&
      Number.isFinite(profile.relevantExperienceYears) &&
      profile.relevantExperienceYears >= 0
      ? `Relevant experience: ${profile.relevantExperienceYears} years`
      : null,
    Array.isArray(profile.certifications) && profile.certifications.length
      ? `Certifications: ${cleanList(profile.certifications).join(", ")}`
      : null,
  );
  return structured || profile.qualifications?.trim() || "";
}

export function buildResumeContext(profile: ProfileData): ResumeContext {
  const skills = cleanList(profile.skills);
  const titles = cleanList([
    ...(Array.isArray(profile.targetRoles) ? profile.targetRoles : []),
    ...(Array.isArray(profile.titles) ? profile.titles : []),
  ]);
  const qualifications = buildQualificationContext(profile);
  const summary = compactText(profile.summary, qualifications);
  const text = compactText(profile.summary, qualifications, profile.resumeText);
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

function parseJobReasons(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return cleanList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function companyBandSignal(
  company: string,
  tier: Tier | null,
): { reason: string; positive: boolean } {
  const band = companyTierScoreBand(tier);
  const assignment = isTier(tier)
    ? `${company} is company tier ${tier}`
    : `${company} is unrated and uses company tier E`;
  return {
    reason: `${assignment}, setting the ${band.min}–${band.max} score band`,
    positive: band.min >= 42,
  };
}

function isContextAdvice(reason: string): boolean {
  return (
    /\b(?:company tier [A-FS]|unrated and uses company tier E)\b.*\bscore band\b/i.test(
      reason,
    ) ||
    /\b(?:posted|first seen) (?:within|more than)\b/i.test(reason) ||
    /\bis location tier\b.*\bcompany band\b/i.test(reason) ||
    /\bpay ~\$/i.test(reason) ||
    /\bsalary (?:is )?not listed\b/i.test(reason) ||
    /\bsaved experience\b.*\b(?:meets|below)\b/i.test(reason) ||
    /\bposting asks for\b.*\badd relevant experience\b/i.test(reason)
  );
}

function fitLabel(score: number): "Strong fit" | "Possible fit" | "Weak fit" {
  return score >= 70
    ? "Strong fit"
    : score >= 40
      ? "Possible fit"
      : "Weak fit";
}

function baseAgentSummary(summary: string | null): string {
  return (summary ?? "")
    .replace(
      /^(?:strong|possible|weak) fit: .*?score band\.\s*(?:Agent résumé assessment:\s*)?/i,
      "",
    )
    .trim();
}

function agentTierSummary(
  score: number,
  summary: string | null,
  companyReason: string,
): string {
  const agentSummary = baseAgentSummary(summary);
  return `${fitLabel(score)}: ${companyReason}.${
    agentSummary ? ` Agent résumé assessment: ${agentSummary}` : ""
  }`.slice(0, 300);
}

function appendContextSignals(
  strengths: string[],
  gaps: string[],
  context: {
    canonicalLoc: string | null;
    locTier: Tier | null;
    locationMod: number;
    experience: ReturnType<typeof experienceFit>;
    freshness: ReturnType<typeof freshnessFit>;
    salary: ReturnType<typeof salaryFit>;
  },
) {
  const {
    canonicalLoc,
    locTier,
    locationMod,
    experience,
    freshness,
    salary,
  } = context;
  if (experience.strength) strengths.push(experience.strength);
  if (experience.gap) gaps.push(experience.gap);
  if (freshness.reason) {
    (freshness.delta > 0 ? strengths : gaps).push(freshness.reason);
  }
  if (salary.reason && salary.delta !== 0) {
    (salary.delta > 0 ? strengths : gaps).push(salary.reason);
  } else if (salary.reason && !salary.known) {
    gaps.push("Salary is not listed");
  }
  if (isTier(locTier) && canonicalLoc && locationMod !== 0) {
    const reason = `${canonicalLoc} is location tier ${locTier}, moving the score within its company band`;
    (locationMod > 0 ? strengths : gaps).push(reason);
  }
}

function deterministicSummary(
  score: number,
  strengths: string[],
  gaps: string[],
): string {
  const reason = strengths[0] ?? "The résumé has limited direct overlap";
  const gap = gaps[0] ? ` Watch-out: ${gaps[0]}.` : "";
  return `${fitLabel(score)}: ${reason}.${gap}`
    .replace(/\.\./g, ".")
    .slice(0, 300);
}

function experienceFit(
  requiredYears: number | null,
  candidateYears: number | null,
): { delta: number; strength: string | null; gap: string | null } {
  const years = (value: number) =>
    `${value} ${value === 1 ? "year" : "years"}`;
  if (requiredYears == null || requiredYears <= 0) {
    return { delta: 0, strength: null, gap: null };
  }
  if (candidateYears == null) {
    return {
      delta: 0,
      strength: null,
      gap: `Posting asks for ${requiredYears}+ ${
        requiredYears === 1 ? "year" : "years"
      } of experience; add relevant experience to your profile`,
    };
  }
  if (candidateYears >= requiredYears) {
    return {
      delta: 4,
      strength: `Saved experience (${years(candidateYears)}) meets the ${requiredYears}+ year requirement`,
      gap: null,
    };
  }
  return {
    delta: -Math.min(
      12,
      Math.max(6, Math.ceil((requiredYears - candidateYears) * 6)),
    ),
    strength: null,
    gap: `Saved experience (${years(candidateYears)}) is below the ${requiredYears}+ year requirement`,
  };
}

export async function scoreAllJobs(opts: ScoreAllJobsOptions = {}): Promise<ScoreAllJobsResult> {
  const profile = await getProfile();
  const resume = buildResumeContext(profile);
  const criteria = await getCriteria();
  const salaryTarget = typeof criteria.salaryTarget === "number" ? criteria.salaryTarget : null;
  const candidateYears =
    typeof profile.relevantExperienceYears === "number" &&
    Number.isFinite(profile.relevantExperienceYears) &&
    profile.relevantExperienceYears >= 0
      ? profile.relevantExperienceYears
      : null;
  const take = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 1000) : undefined;

  const tierRows = await prisma.companyTier.findMany();
  const tierByCompany = new Map<string, Tier>();
  for (const [key, row] of latestCompanyTiersByKey(tierRows)) {
    if (isTier(row.tier)) tierByCompany.set(key, row.tier);
  }

  const locationTierRows = await prisma.locationTier.findMany();
  const tierByLocation = new Map<string, Tier>();
  for (const row of locationTierRows) {
    if (isTier(row.tier)) tierByLocation.set(normalizeLocationKey(row.location), row.tier);
  }

  const jobs = await prisma.job.findMany({
    where: {
      isEntryLevel: true,
      ...ACTIVE_JOB_WHERE,
      ...(opts.country ? { country: opts.country } : {}),
      ...(opts.onlyUnscored ? { fitScore: null } : {}),
      ...(opts.jobIds?.length ? { id: { in: opts.jobIds } } : {}),
    },
    orderBy: [{ fitScore: "desc" }, { firstSeenAt: "desc" }],
    take,
  });

  const now = new Date();
  let scored = 0;
  let preservedAgent = 0;
  let skipped = 0;
  let processed = 0;

  const reportProgress = (
    currentJob: ScoreAllJobsProgress["currentJob"],
  ) => {
    opts.onProgress?.({
      processed,
      total: jobs.length,
      scored,
      preservedAgent,
      skipped,
      currentJob,
    });
  };
  reportProgress(null);

  for (const job of jobs) {
    const tier = tierByCompany.get(normalizeCompanyKey(job.company)) ?? null;
    const canonicalLoc = normalizeLocation(job.location);
    const locTier = canonicalLoc
      ? tierByLocation.get(normalizeLocationKey(canonicalLoc)) ?? null
      : null;
    const salary = salaryFit(job, salaryTarget);
    const freshness = freshnessFit(job, now);
    const experience = experienceFit(
      minRequiredBachelorYoE(compactText(job.title, job.description)),
      candidateYears,
    );
    const locationMod = tierModifier(locTier);
    const contextDelta =
      locationMod + salary.delta + freshness.delta + experience.delta;
    const companySignal = companyBandSignal(job.company, tier);

    if (job.fitProvider === "agent" && !opts.force) {
      const baseScore = job.fitBaseScore ?? job.fitScore ?? 0;
      const adjustedScore = tierFirstJudgeScore(
        baseScore,
        tier,
        contextDelta,
      );
      const baseAdvice = parseJobReasons(
        job.fitBaseReasons ?? job.fitReasons,
      ).filter((reason) => !isContextAdvice(reason));
      const baseSummary = baseAgentSummary(
        job.fitBaseSummary ?? job.fitSummary,
      );
      const companyAdvice = companySignal.positive
        ? fitAdvice(companySignal.reason)
        : gapAdvice(companySignal.reason);
      const contextStrengths: string[] = [];
      const contextGaps: string[] = [];
      appendContextSignals(contextStrengths, contextGaps, {
        canonicalLoc,
        locTier,
        locationMod,
        experience,
        freshness,
        salary,
      });
      const contextAdvice = [
        ...contextStrengths.map(fitAdvice),
        ...contextGaps.map(gapAdvice),
      ];
      const updated = await updateJobScoreFromSnapshot(job, {
        fitBaseScore: baseScore,
        fitBaseReasons: JSON.stringify(baseAdvice),
        fitBaseSummary: baseSummary || null,
        fitScore: adjustedScore,
        fitReasons: JSON.stringify(
          [companyAdvice, ...baseAdvice, ...contextAdvice].slice(0, 8),
        ),
        fitSummary: agentTierSummary(
          adjustedScore,
          baseSummary,
          companySignal.reason,
        ),
        fitScoredAt: now,
      });
      if (updated) {
        preservedAgent++;
      } else {
        skipped++;
      }
      processed++;
      reportProgress({
        id: job.id,
        company: job.company,
        title: job.title,
      });
      continue;
    }

    const skills = parseJobSkills(job.skills);
    const description = compactText(job.description, skills.length ? `Skills: ${skills.join(", ")}` : "");
    const result = scoreResumeFit(
      { title: job.title, company: job.company, description, skills },
      resume,
    );
    const adjustedScore = tierFirstJudgeScore(
      result.score,
      tier,
      contextDelta,
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
    appendContextSignals(strengths, gaps, {
      canonicalLoc,
      locTier,
      locationMod,
      experience,
      freshness,
      salary,
    });
    (companySignal.positive ? strengths : gaps).unshift(
      companySignal.reason,
    );

    const advice = [
      ...strengths.slice(0, 6).map(fitAdvice),
      ...gaps.slice(0, 6).map(gapAdvice),
    ];

    const updated = await updateJobScoreFromSnapshot(job, {
      fitBaseScore: result.score,
      fitBaseReasons: null,
      fitBaseSummary: null,
      fitScore: adjustedScore,
      fitReasons: JSON.stringify(advice),
      fitSummary: deterministicSummary(adjustedScore, strengths, gaps),
      fitProvider: "deterministic",
      fitScoredAt: now,
    });
    if (updated) {
      scored++;
    } else {
      skipped++;
    }
    processed++;
    reportProgress({
      id: job.id,
      company: job.company,
      title: job.title,
    });
  }

  return { scanned: jobs.length, scored, preservedAgent, skipped, provider: "deterministic" };
}
