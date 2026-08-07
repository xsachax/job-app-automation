import {
  scoreAllJobs,
  type ScoreAllJobsOptions,
  type ScoreAllJobsResult,
} from "./judge";

export type JudgeRunPhase =
  | "idle"
  | "starting"
  | "scoring"
  | "complete"
  | "failed";

export interface JudgeRunProgress {
  running: boolean;
  phase: JudgeRunPhase;
  processed: number;
  total: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
  currentJob: string | null;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JudgeRunCoordination {
  waitForActive?: boolean;
}

export class JudgeRunInProgressError extends Error {
  constructor() {
    super("The judge is already running.");
    this.name = "JudgeRunInProgressError";
  }
}

let activeRun: Promise<ScoreAllJobsResult> | null = null;
let progress: JudgeRunProgress = {
  running: false,
  phase: "idle",
  processed: 0,
  total: 0,
  scored: 0,
  preservedAgent: 0,
  skipped: 0,
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
): Promise<ScoreAllJobsResult> {
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
    preservedAgent: 0,
    skipped: 0,
    currentJob: null,
    message: "Preparing eligible jobs…",
    startedAt,
    finishedAt: null,
  };

  const run = scoreAllJobs({
    ...options,
    onProgress: (current) => {
      const currentJob = current.currentJob
        ? `${current.currentJob.company} · ${current.currentJob.title}`
        : null;
      updateProgress({
        phase: "scoring",
        processed: current.processed,
        total: current.total,
        scored: current.scored,
        preservedAgent: current.preservedAgent,
        skipped: current.skipped,
        currentJob,
        message:
          current.total === 0
            ? "No eligible postings to score."
            : `Processed ${current.processed}/${current.total}${
                currentJob ? ` · ${currentJob}` : ""
              }`,
      });
    },
  });
  activeRun = run;

  try {
    const result = await run;
    updateProgress({
      running: false,
      phase: "complete",
      processed: result.scanned,
      total: result.scanned,
      scored: result.scored,
      preservedAgent: result.preservedAgent,
      skipped: result.skipped,
      currentJob: null,
      message: `Judge complete · ${result.scored} scored`,
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
