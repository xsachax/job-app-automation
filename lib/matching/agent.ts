// Tier-2 "agent-in-the-loop" resume matching.
//
// The expensive, judgement-based half of matching is powered by the Copilot
// agent itself (no OpenAI key required). The flow is:
//
//   1. buildReviewBatch()   -> a JSON payload of shortlisted jobs + the resume,
//                              exported for the agent to read.
//   2. (the agent reasons about fit against the resume)
//   3. applyAgentScores()   -> writes the agent's scores/reasons back onto Match.
//
// rescoreResumeFit() is the cheap deterministic baseline (lib/matching/resume.ts)
// that runs on every scan and after "Refresh Profile", so there is always a
// resume-aware score even before the agent reviews anything. Agent scores at the
// current resume version are preserved by the baseline pass.

import { prisma } from "../db";
import { getProfile, getCriteria } from "../settings";
import type { Criteria } from "./score";
import { scoreResumeFit, type ResumeContext } from "./resume";
import type { ParsedResume } from "../llm/types";

// Statuses whose resume score we still refresh (informational). Progressed rows
// keep their pipeline status; only the fit score is updated.
const SKIP_RESCORE_STATUS = new Set(["skipped"]);

export interface ResumeContextResult {
  versionId: string | null;
  ctx: ResumeContext;
  source: "resume" | "profile" | "none";
}

/** Load the freshest resume context — latest ResumeVersion, else the profile. */
export async function getResumeContext(): Promise<ResumeContextResult> {
  const version = await prisma.resumeVersion.findFirst({ orderBy: { createdAt: "desc" } });
  if (version) {
    let parsed: ParsedResume & { titles?: string[] } = {};
    try {
      parsed = JSON.parse(version.parsed) as ParsedResume & { titles?: string[] };
    } catch {
      /* keep empty */
    }
    return {
      versionId: version.id,
      source: "resume",
      ctx: {
        skills: parsed.skills ?? [],
        titles: parsed.titles ?? [],
        summary: parsed.summary ?? "",
        text: version.text ?? "",
      },
    };
  }
  const profile = await getProfile();
  const hasProfile = (profile.skills?.length ?? 0) > 0 || Boolean(profile.summary);
  return {
    versionId: null,
    source: hasProfile ? "profile" : "none",
    ctx: {
      skills: profile.skills ?? [],
      titles: [],
      summary: profile.summary ?? "",
      text: profile.summary ?? "",
    },
  };
}

function hasResumeSignal(ctx: ResumeContext): boolean {
  return (ctx.skills?.length ?? 0) > 0 || (ctx.text?.trim().length ?? 0) > 20;
}

// ---------------------------------------------------------------------------
// Deterministic baseline pass
// ---------------------------------------------------------------------------

export interface RescoreResult {
  scored: number;
  preservedAgent: number;
  resumeVersionId: string | null;
  source: string;
}

/**
 * Recompute the deterministic resume-fit baseline for every active match.
 * Agent scores already stamped at the current resume version are preserved.
 */
export async function rescoreResumeFit(): Promise<RescoreResult> {
  const { versionId, ctx, source } = await getResumeContext();
  if (!hasResumeSignal(ctx)) {
    return { scored: 0, preservedAgent: 0, resumeVersionId: versionId, source };
  }

  const matches = await prisma.match.findMany({
    where: { job: { isWorkday: false } },
    include: { job: true },
  });

  let scored = 0;
  let preservedAgent = 0;
  const now = new Date();
  for (const m of matches) {
    if (SKIP_RESCORE_STATUS.has(m.status)) continue;
    // Preserve a fresh agent judgement (same resume version).
    if (m.matchProvider === "agent" && m.scoredResumeVersion === versionId) {
      preservedAgent++;
      continue;
    }
    const r = scoreResumeFit(
      { title: m.job.title, description: m.job.description, company: m.job.company },
      ctx,
    );
    await prisma.match.update({
      where: { id: m.id },
      data: {
        resumeScore: r.score,
        resumeReasons: JSON.stringify(r.reasons),
        matchProvider: "deterministic",
        scoredResumeVersion: versionId,
        resumeScoredAt: now,
      },
    });
    scored++;
  }
  return { scored, preservedAgent, resumeVersionId: versionId, source };
}

// ---------------------------------------------------------------------------
// Agent review batch
// ---------------------------------------------------------------------------

export interface ReviewItem {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  atsType: string;
  applyUrl: string;
  ruleScore: number;
  ruleReasons: string[];
  baselineResumeScore: number | null;
  baselineResumeReasons: string[];
  description: string;
}

export interface ReviewBatch {
  generatedAt: string;
  resumeVersionId: string | null;
  resumeSource: string;
  resume: { skills: string[]; titles: string[]; summary: string; text: string };
  criteria: Criteria;
  count: number;
  items: ReviewItem[];
  instructions: string;
}

export interface BuildReviewOptions {
  limit?: number;
  minScore?: number;
  includeAgentScored?: boolean;
  descriptionChars?: number;
}

const REVIEW_INSTRUCTIONS =
  "You are scoring how well each job fits THIS candidate's resume. For every item " +
  "produce: score (0-100 resume fit, NOT the rule score), 1-3 short reasons, a one-line " +
  "summary of fit + any gaps, and recommend (true if worth applying). Judge real skill/domain " +
  "overlap and seniority — reward transferable experience, penalize hard-requirement gaps. " +
  "Write results as JSON {\"scores\":[{jobId,score,reasons:[],summary,recommend}]} to a file " +
  "and run: npm run match:apply -- --in <file>.";

function safeParseArr(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Build the shortlist of jobs for the agent to resume-match. Defaults to jobs
 * that (a) are still "new", (b) clear the rule-score floor, and (c) have not yet
 * been agent-scored at the current resume version.
 */
export async function buildReviewBatch(opts: BuildReviewOptions = {}): Promise<ReviewBatch> {
  const limit = opts.limit ?? 25;
  const minScore = opts.minScore ?? 40;
  const descriptionChars = opts.descriptionChars ?? 1500;

  const { versionId, ctx, source } = await getResumeContext();
  const criteria = await getCriteria();

  const matches = await prisma.match.findMany({
    where: { status: "new", score: { gte: minScore }, job: { isWorkday: false } },
    include: { job: true },
    orderBy: { score: "desc" },
    take: Math.min(Math.max(limit * 3, limit), 300),
  });

  const items: ReviewItem[] = [];
  for (const m of matches) {
    const alreadyAgent = m.matchProvider === "agent" && m.scoredResumeVersion === versionId;
    if (alreadyAgent && !opts.includeAgentScored) continue;
    items.push({
      jobId: m.jobId,
      title: m.job.title,
      company: m.job.company,
      location: m.job.location,
      remote: m.job.remote,
      atsType: m.job.atsType,
      applyUrl: m.job.applyUrl,
      ruleScore: m.score,
      ruleReasons: safeParseArr(m.reasons),
      baselineResumeScore: m.resumeScore,
      baselineResumeReasons: safeParseArr(m.resumeReasons),
      description: (m.job.description ?? "").slice(0, descriptionChars),
    });
    if (items.length >= limit) break;
  }

  return {
    generatedAt: new Date().toISOString(),
    resumeVersionId: versionId,
    resumeSource: source,
    resume: {
      skills: ctx.skills ?? [],
      titles: ctx.titles ?? [],
      summary: ctx.summary ?? "",
      text: (ctx.text ?? "").slice(0, 8000),
    },
    criteria,
    count: items.length,
    items,
    instructions: REVIEW_INSTRUCTIONS,
  };
}

// ---------------------------------------------------------------------------
// Apply agent scores
// ---------------------------------------------------------------------------

export interface AgentScore {
  jobId: string;
  score: number;
  reasons?: string[];
  summary?: string;
  recommend?: boolean;
}

export interface ApplyResult {
  updated: number;
  skipped: { jobId: string; reason: string }[];
  resumeVersionId: string | null;
}

function clampScore(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Persist agent-produced resume scores onto their Match rows. */
export async function applyAgentScores(scores: AgentScore[]): Promise<ApplyResult> {
  const { versionId } = await getResumeContext();
  const result: ApplyResult = { updated: 0, skipped: [], resumeVersionId: versionId };
  const now = new Date();

  for (const s of scores) {
    if (!s || typeof s.jobId !== "string") {
      result.skipped.push({ jobId: String(s?.jobId ?? "?"), reason: "missing jobId" });
      continue;
    }
    const score = clampScore(s.score);
    if (score === null) {
      result.skipped.push({ jobId: s.jobId, reason: "invalid score" });
      continue;
    }
    const match = await prisma.match.findUnique({ where: { jobId: s.jobId } });
    if (!match) {
      result.skipped.push({ jobId: s.jobId, reason: "no match for job" });
      continue;
    }
    const reasons = Array.isArray(s.reasons) ? s.reasons.filter((r) => typeof r === "string") : [];
    const summary = [
      typeof s.summary === "string" ? s.summary.trim() : "",
      s.recommend === true ? "[recommended]" : s.recommend === false ? "[not recommended]" : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    await prisma.match.update({
      where: { jobId: s.jobId },
      data: {
        resumeScore: score,
        resumeReasons: JSON.stringify(reasons),
        resumeSummary: summary || null,
        matchProvider: "agent",
        scoredResumeVersion: versionId,
        resumeScoredAt: now,
      },
    });
    result.updated++;
  }
  return result;
}
