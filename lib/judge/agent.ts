import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prisma } from "../db";
import { getProfile } from "../settings";
import {
  buildResumeContext,
  scoreAllJobs,
  updateJobScoreFromSnapshot,
} from "./judge";
import { fitAdvice, gapAdvice } from "./advice";
import { ACTIVE_JOB_WHERE } from "../jobs/availability";
import {
  canReplaceJudgeProvider,
  type EnhancedJudgeProvider,
} from "./provider";

export interface BuildJudgeBatchOptions {
  topN?: number;
  country?: string;
  jobIds?: string[];
  out?: string;
  descriptionChars?: number;
  write?: boolean;
}

export interface JudgeBatchItem {
  id: string;
  title: string;
  company: string;
  country: string | null;
  applyUrl: string;
  fitScore: number;
  fitReasons: string[];
  fitSummary: string | null;
  skills: string[];
  description: string;
  postedAt: string | null;
  firstSeenAt: string;
}

export interface JudgeBatch {
  generatedAt: string;
  country: string | null;
  resume: { skills: string[]; titles: string[]; summary: string; text: string };
  count: number;
  items: JudgeBatchItem[];
  instructions: string;
  outputPath: string;
}

export interface JudgeScoreInput {
  id?: string;
  jobId?: string;
  score: unknown;
  summary?: unknown;
  reasons?: unknown;
  fits?: unknown;
  gaps?: unknown;
}

export interface ApplyJudgeScoresResult {
  updated: number;
  skipped: { id: string; reason: string }[];
}

export interface ApplyJudgeScoresOptions {
  provider?: EnhancedJudgeProvider;
}

const DEFAULT_OUT = ".match/judge-review.json";

const JUDGE_INSTRUCTIONS =
  "You are the Copilot agent scoring post-scrape discovery jobs against THIS candidate. " +
  "Return JSON as {\"scores\":[{\"id\":\"job_id\",\"score\":0-100,\"summary\":\"actionable one-line advice\",\"fits\":[\"specific evidence\"],\"gaps\":[\"specific gap\"]}]}. " +
  "Judge concrete skill and domain overlap, qualifications, seniority, transferable experience, and hard requirements. " +
  "Name evidence from the résumé and posting; never use vague phrases like \"good fit\" or invent experience. " +
  "Score candidate résumé and qualification fit only. The app stores that as the base score, selects the final band from company tier, and applies freshness, location, experience, and pay context within that band. " +
  "Then run: npm run judge:apply -- <scores.json>.";

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function clampScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function compactDescription(text: string | null, chars: number): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, chars);
}

export async function buildJudgeBatch(opts: BuildJudgeBatchOptions = {}): Promise<JudgeBatch> {
  const topN = opts.topN && opts.topN > 0 ? Math.min(Math.floor(opts.topN), 100) : 25;
  const descriptionChars = opts.descriptionChars ?? 1400;
  const profile = await getProfile();
  const ctx = buildResumeContext(profile);

  const jobs = await prisma.job.findMany({
    where: {
      isEntryLevel: true,
      ...ACTIVE_JOB_WHERE,
      fitScore: { not: null },
      OR: [
        { fitProvider: null },
        { fitProvider: { notIn: ["agent", "copilot"] } },
      ],
      ...(opts.jobIds ? { id: { in: opts.jobIds } } : {}),
      ...(opts.country ? { country: opts.country } : {}),
    },
    orderBy: [{ fitScore: "desc" }, { firstSeenAt: "desc" }],
    take: topN,
  });

  const outputPath = resolve(opts.out ?? DEFAULT_OUT);
  const batch: JudgeBatch = {
    generatedAt: new Date().toISOString(),
    country: opts.country ?? null,
    resume: {
      skills: ctx.skills ?? [],
      titles: ctx.titles ?? [],
      summary: ctx.summary ?? "",
      text: (ctx.text ?? "").slice(0, 8000),
    },
    count: jobs.length,
    items: jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      country: job.country,
      applyUrl: job.applyUrl,
      fitScore: job.fitScore ?? 0,
      fitReasons: parseStringArray(job.fitReasons),
      fitSummary: job.fitSummary,
      skills: parseStringArray(job.skills),
      description: compactDescription(job.description, descriptionChars),
      postedAt: job.postedAt?.toISOString() ?? null,
      firstSeenAt: job.firstSeenAt.toISOString(),
    })),
    instructions: JUDGE_INSTRUCTIONS,
    outputPath,
  };

  if (opts.write !== false) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(batch, null, 2));
  }
  return batch;
}

export async function applyJudgeScores(
  scores: JudgeScoreInput[],
  options: ApplyJudgeScoresOptions = {},
): Promise<ApplyJudgeScoresResult> {
  const result: ApplyJudgeScoresResult = { updated: 0, skipped: [] };
  const updatedIds: string[] = [];
  const provider = options.provider ?? "copilot";
  for (const item of scores) {
    const id = typeof item?.id === "string" ? item.id : typeof item?.jobId === "string" ? item.jobId : "";
    if (!id) {
      result.skipped.push({ id: "?", reason: "missing id" });
      continue;
    }

    const baseScore = clampScore(item.score);
    if (baseScore === null) {
      result.skipped.push({ id, reason: "invalid score" });
      continue;
    }

    let job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      result.skipped.push({ id, reason: "unknown job" });
      continue;
    }
    if (job.availabilityStatus === "closed") {
      result.skipped.push({ id, reason: "closed job" });
      continue;
    }
    const summary = typeof item.summary === "string" ? item.summary.trim().slice(0, 300) : "";
    const fits = cleanReasons(item.fits);
    const gaps = cleanReasons(item.gaps);
    const legacyReasons = cleanReasons(item.reasons);
    const reasons = [
      ...fits.map(fitAdvice),
      ...gaps.map(gapAdvice),
      ...(fits.length || gaps.length ? [] : legacyReasons),
    ].slice(0, 8);
    let updated = false;
    let failureRecorded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!canReplaceJudgeProvider(job.fitProvider, provider)) {
        result.skipped.push({ id, reason: "Copilot score preserved" });
        failureRecorded = true;
        break;
      }
      updated = await updateJobScoreFromSnapshot(job, {
        fitBaseScore: baseScore,
        fitBaseReasons: JSON.stringify(reasons),
        fitBaseSummary: summary || null,
        fitScore: null,
        fitReasons: JSON.stringify(reasons),
        fitSummary: summary || null,
        fitProvider: provider,
        fitScoredAt: null,
      });
      if (updated) break;
      const current = await prisma.job.findUnique({ where: { id } });
      if (!current) {
        result.skipped.push({ id, reason: "job removed while applying" });
        failureRecorded = true;
        break;
      }
      if (current.availabilityStatus === "closed") {
        result.skipped.push({ id, reason: "job closed while applying" });
        failureRecorded = true;
        break;
      }
      job = current;
    }
    if (!updated) {
      if (!failureRecorded) {
        result.skipped.push({ id, reason: "score changed while applying" });
      }
      continue;
    }
    result.updated++;
    updatedIds.push(id);
  }

  if (updatedIds.length) {
    await scoreAllJobs({ jobIds: updatedIds });
  }
  return result;
}
