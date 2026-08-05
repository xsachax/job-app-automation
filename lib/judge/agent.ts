import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prisma } from "../db";
import { getProfile } from "../settings";
import { buildResumeContext } from "./judge";
import { fitAdvice, gapAdvice } from "./advice";
import { freshnessFit } from "./freshness";

export interface BuildJudgeBatchOptions {
  topN?: number;
  country?: string;
  out?: string;
  descriptionChars?: number;
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

const DEFAULT_OUT = ".match/judge-review.json";

const JUDGE_INSTRUCTIONS =
  "You are the Copilot agent scoring post-scrape discovery jobs against THIS candidate. " +
  "Return JSON as {\"scores\":[{\"id\":\"job_id\",\"score\":0-100,\"summary\":\"actionable one-line advice\",\"fits\":[\"specific evidence\"],\"gaps\":[\"specific gap\"]}]}. " +
  "Judge concrete skill and domain overlap, qualifications, seniority, transferable experience, and hard requirements. " +
  "Name evidence from the résumé and posting; never use vague phrases like \"good fit\" or invent experience. " +
  "Score candidate fit only. The app applies the date-posted freshness modifier separately. " +
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
      fitProvider: "deterministic",
      fitScore: { not: null },
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

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(batch, null, 2));
  return batch;
}

export async function applyJudgeScores(scores: JudgeScoreInput[]): Promise<ApplyJudgeScoresResult> {
  const result: ApplyJudgeScoresResult = { updated: 0, skipped: [] };
  const now = new Date();

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

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      result.skipped.push({ id, reason: "unknown job" });
      continue;
    }

    const summary = typeof item.summary === "string" ? item.summary.trim().slice(0, 300) : "";
    const fits = cleanReasons(item.fits);
    const gaps = cleanReasons(item.gaps);
    const legacyReasons = cleanReasons(item.reasons);
    const freshness = freshnessFit(job, now);
    const score = clampScore(baseScore + freshness.delta) ?? baseScore;
    const reasons = [
      ...fits.map(fitAdvice),
      ...gaps.map(gapAdvice),
      ...(fits.length || gaps.length ? [] : legacyReasons),
      ...(freshness.reason
        ? [freshness.delta > 0 ? fitAdvice(freshness.reason) : gapAdvice(freshness.reason)]
        : []),
    ].slice(0, 8);
    await prisma.job.update({
      where: { id },
      data: {
        fitScore: score,
        fitReasons: JSON.stringify(reasons),
        fitSummary: summary || null,
        fitProvider: "agent",
        fitScoredAt: now,
      },
    });
    result.updated++;
  }

  return result;
}
