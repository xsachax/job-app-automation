import {
  scoreAllJobs,
  type ScoreAllJobsOptions,
} from "./judge";
import { applyJudgeScores, buildJudgeBatch } from "./agent";
import {
  MAX_EXTERNAL_JUDGE_BATCH_SIZE,
  scoreExternalJudgeBatch,
} from "./external";
import {
  resolveJudgeProvider,
  type JudgeProviderResolution,
} from "./provider-settings";
import type { JudgeRunProvider } from "./provider";

export type JudgeRunPhase =
  | "idle"
  | "starting"
  | "baseline"
  | "enhanced"
  | "complete"
  | "failed";

export interface JudgeRunProgress {
  running: boolean;
  phase: JudgeRunPhase;
  processed: number;
  total: number;
  scored: number;
  preservedEnhanced: number;
  skipped: number;
  provider: JudgeRunProvider;
  currentJob: string | null;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JudgeRunCoordination {
  waitForActive?: boolean;
}

export interface JudgeRunResult {
  scanned: number;
  scored: number;
  preservedEnhanced: number;
  skipped: number;
  provider: JudgeRunProvider;
  enhancedScored: number;
  enhancedStatus: "applied" | "copilot-ready" | "unavailable";
  message: string;
}

export class JudgeRunInProgressError extends Error {
  constructor() {
    super("The judge is already running.");
    this.name = "JudgeRunInProgressError";
  }
}

let activeRun: Promise<JudgeRunResult> | null = null;
let progress: JudgeRunProgress = {
  running: false,
  phase: "idle",
  processed: 0,
  total: 0,
  scored: 0,
  preservedEnhanced: 0,
  skipped: 0,
  provider: "deterministic",
  currentJob: null,
  message: "The judge is idle.",
  startedAt: null,
  finishedAt: null,
};

export function getJudgeRunProgress(): JudgeRunProgress {
  return { ...progress };
}

function updateProgress(patch: Partial<JudgeRunProgress>) {
  progress = { ...progress, ...patch };
}

export async function runJudgeScoring(
  options: Omit<ScoreAllJobsOptions, "onProgress"> = {},
  coordination: JudgeRunCoordination = {},
): Promise<JudgeRunResult> {
  if (activeRun) {
    if (!coordination.waitForActive) throw new JudgeRunInProgressError();
    try {
      await activeRun;
    } catch {
      // A queued run still gets its own attempt after the active run fails.
    }
    return runJudgeScoring(options, coordination);
  }

  const startedAt = new Date().toISOString();
  progress = {
    running: true,
    phase: "starting",
    processed: 0,
    total: 0,
    scored: 0,
    preservedEnhanced: 0,
    skipped: 0,
    provider: "deterministic",
    currentJob: null,
    message: "Resolving the active Judge path...",
    startedAt,
    finishedAt: null,
  };

  const run = (async () => {
    const resolution = await resolveJudgeProvider();
    updateProgress({
      provider: resolution.provider,
      message: `Preparing ${
        resolution.provider === "deterministic"
          ? "deterministic"
          : resolution.provider
      } Judge path...`,
    });
    return runResolvedJudge(resolution, options);
  })();
  activeRun = run;

  try {
    const result = await run;
    updateProgress({
      running: false,
      phase: "complete",
      processed: result.scanned,
      total: result.scanned,
      scored: result.scored,
      preservedEnhanced: result.preservedEnhanced,
      skipped: result.skipped,
      provider: result.provider,
      currentJob: null,
      message: result.message,
      finishedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    updateProgress({
      running: false,
      phase: "failed",
      currentJob: null,
      message: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    if (activeRun === run) activeRun = null;
  }
}

async function runResolvedJudge(
  resolution: JudgeProviderResolution,
  options: Omit<ScoreAllJobsOptions, "onProgress">,
): Promise<JudgeRunResult> {
  const baselineJobIds: string[] = [];
  const baseline = await scoreAllJobs({
    ...options,
    onProgress: (current) => {
      if (
        current.currentJob &&
        baselineJobIds.at(-1) !== current.currentJob.id
      ) {
        baselineJobIds.push(current.currentJob.id);
      }
      const currentJob = current.currentJob
        ? `${current.currentJob.company} · ${current.currentJob.title}`
        : null;
      updateProgress({
        phase: "baseline",
        processed: current.processed,
        total: current.total,
        scored: current.scored,
        preservedEnhanced: current.preservedEnhanced,
        skipped: current.skipped,
        currentJob,
        message:
          current.total === 0
            ? "No eligible postings to score."
            : `Baseline ${current.processed}/${current.total}${
                currentJob ? ` · ${currentJob}` : ""
              }`,
      });
    },
  });

  if (resolution.provider === "copilot") {
    return {
      ...baseline,
      provider: "copilot",
      enhancedScored: 0,
      enhancedStatus: "copilot-ready",
      message:
        "Judge complete with deterministic coverage. Copilot has priority; export/apply remains ready for enhanced evidence.",
    };
  }
  if (!resolution.external) {
    return {
      ...baseline,
      provider: "deterministic",
      enhancedScored: 0,
      enhancedStatus: "unavailable",
      message:
        "Judge complete with deterministic scoring only; enhanced provider scoring is unavailable.",
    };
  }

  const batch = await buildJudgeBatch({
    topN: options.limit,
    country: options.country,
    jobIds: options.onlyUnscored ? baselineJobIds : undefined,
    write: false,
  });
  let enhancedScored = 0;
  let enhancedSkipped = 0;
  let batches = 0;
  updateProgress({
    phase: "enhanced",
    processed: 0,
    total: batch.items.length,
    scored: 0,
    skipped: 0,
    currentJob: null,
    message: `Sending 0/${batch.items.length} to ${
      resolution.provider === "openai" ? "OpenAI" : "Anthropic"
    }...`,
  });

  for (
    let start = 0;
    start < batch.items.length;
    start += MAX_EXTERNAL_JUDGE_BATCH_SIZE
  ) {
    const items = batch.items.slice(
      start,
      start + MAX_EXTERNAL_JUDGE_BATCH_SIZE,
    );
    const scores = await scoreExternalJudgeBatch(resolution.external, {
      resume: batch.resume,
      items,
    });
    const applied = await applyJudgeScores(scores, {
      provider: resolution.provider,
    });
    enhancedScored += applied.updated;
    enhancedSkipped += applied.skipped.length;
    batches++;
    updateProgress({
      phase: "enhanced",
      processed: Math.min(start + items.length, batch.items.length),
      total: batch.items.length,
      scored: enhancedScored,
      skipped: enhancedSkipped,
      currentJob: null,
      message: `${
        resolution.provider === "openai" ? "OpenAI" : "Anthropic"
      } scored ${Math.min(start + items.length, batch.items.length)}/${batch.items.length}`,
    });
  }

  const name = resolution.provider === "openai" ? "OpenAI" : "Anthropic";
  return {
    ...baseline,
    provider: resolution.provider,
    enhancedScored,
    enhancedStatus: "applied",
    message:
      batch.items.length === 0
        ? `Judge complete; no non-Copilot postings needed ${name} review.`
        : `Judge complete · ${enhancedScored} enhanced by ${name} in ${batches} batch${batches === 1 ? "" : "es"}.`,
  };
}
