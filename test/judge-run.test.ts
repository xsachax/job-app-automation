import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ScoreAllJobsOptions,
  ScoreAllJobsResult,
} from "../lib/judge/judge";

type ScoreAllJobs = typeof import("../lib/judge/judge").scoreAllJobs;

const mocks = vi.hoisted(() => ({
  scoreAllJobs: vi.fn<ScoreAllJobs>(),
  resolveJudgeProvider: vi.fn(),
  buildJudgeBatch: vi.fn(),
  applyJudgeScores: vi.fn(),
  scoreExternalJudgeBatch: vi.fn(),
}));

vi.mock("../lib/judge/judge", () => ({
  scoreAllJobs: mocks.scoreAllJobs,
}));

vi.mock("../lib/judge/provider-settings", () => ({
  resolveJudgeProvider: mocks.resolveJudgeProvider,
}));

vi.mock("../lib/judge/agent", () => ({
  buildJudgeBatch: mocks.buildJudgeBatch,
  applyJudgeScores: mocks.applyJudgeScores,
}));

vi.mock("../lib/judge/external", () => ({
  MAX_EXTERNAL_JUDGE_BATCH_SIZE: 10,
  scoreExternalJudgeBatch: mocks.scoreExternalJudgeBatch,
}));

import {
  getJudgeRunProgress,
  JudgeRunInProgressError,
  runJudgeScoring,
  type JudgeRunResult,
} from "../lib/judge/run";

const BASELINE_RESULT: ScoreAllJobsResult = {
  scanned: 2,
  scored: 1,
  preservedEnhanced: 1,
  skipped: 0,
  provider: "deterministic",
};

const DETERMINISTIC_RESULT: JudgeRunResult = {
  ...BASELINE_RESULT,
  provider: "deterministic",
  enhancedScored: 0,
  enhancedStatus: "unavailable",
  message:
    "Judge complete with deterministic scoring only; enhanced provider scoring is unavailable.",
};

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error("Deferred promise was not initialized.");
      settle(value);
    },
  };
}

beforeEach(() => {
  mocks.scoreAllJobs.mockReset();
  mocks.resolveJudgeProvider.mockReset();
  mocks.buildJudgeBatch.mockReset();
  mocks.applyJudgeScores.mockReset();
  mocks.scoreExternalJudgeBatch.mockReset();
  mocks.resolveJudgeProvider.mockResolvedValue({
    provider: "deterministic",
    external: null,
    status: "No key.",
  });
});

describe("runJudgeScoring", () => {
  it("reports progress and rejects an overlapping manual run", async () => {
    const pending = deferred<ScoreAllJobsResult>();
    let report: ScoreAllJobsOptions["onProgress"];
    mocks.scoreAllJobs.mockImplementation((options = {}) => {
      report = options.onProgress;
      report?.({
        processed: 0,
        total: 2,
        scored: 0,
        preservedEnhanced: 0,
        skipped: 0,
        currentJob: null,
      });
      return pending.promise;
    });

    const first = runJudgeScoring();
    await expect(runJudgeScoring()).rejects.toBeInstanceOf(
      JudgeRunInProgressError,
    );
    await vi.waitFor(() => {
      expect(getJudgeRunProgress()).toMatchObject({
        running: true,
        phase: "baseline",
        processed: 0,
        total: 2,
      });
    });

    report?.({
      processed: 2,
      total: 2,
      scored: 1,
      preservedEnhanced: 1,
      skipped: 0,
      currentJob: {
        id: "job-2",
        company: "Acme",
        title: "Software Engineer I",
      },
    });
    pending.resolve(BASELINE_RESULT);
    await expect(first).resolves.toEqual(DETERMINISTIC_RESULT);
    expect(getJudgeRunProgress()).toMatchObject({
      running: false,
      phase: "complete",
      processed: 2,
      total: 2,
    });
  });

  it("queues discovery scoring until an active run finishes", async () => {
    const pending = deferred<ScoreAllJobsResult>();
    mocks.scoreAllJobs
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(BASELINE_RESULT);

    const first = runJudgeScoring();
    const queued = runJudgeScoring(
      { onlyUnscored: true },
      { waitForActive: true },
    );
    await vi.waitFor(() => {
      expect(mocks.scoreAllJobs).toHaveBeenCalledTimes(1);
    });

    pending.resolve(BASELINE_RESULT);
    await first;
    await expect(queued).resolves.toEqual(DETERMINISTIC_RESULT);
    expect(mocks.scoreAllJobs).toHaveBeenCalledTimes(2);
    expect(mocks.scoreAllJobs.mock.calls[1]?.[0]).toMatchObject({
      onlyUnscored: true,
    });
  });

  it("never calls an external provider when Copilot is marked connected", async () => {
    mocks.resolveJudgeProvider.mockResolvedValue({
      provider: "copilot",
      external: null,
      status: "Copilot priority.",
    });
    mocks.scoreAllJobs.mockResolvedValue(BASELINE_RESULT);

    const result = await runJudgeScoring();

    expect(result).toMatchObject({
      provider: "copilot",
      enhancedStatus: "copilot-ready",
    });
    expect(mocks.buildJudgeBatch).not.toHaveBeenCalled();
    expect(mocks.scoreExternalJudgeBatch).not.toHaveBeenCalled();
  });

  it("does not call an external provider without a configured key", async () => {
    mocks.scoreAllJobs.mockResolvedValue(BASELINE_RESULT);

    const result = await runJudgeScoring();

    expect(result).toEqual(DETERMINISTIC_RESULT);
    expect(mocks.buildJudgeBatch).not.toHaveBeenCalled();
    expect(mocks.scoreExternalJudgeBatch).not.toHaveBeenCalled();
  });

  it("scores and applies the selected external provider after the baseline", async () => {
    mocks.resolveJudgeProvider.mockResolvedValue({
      provider: "openai",
      external: {
        provider: "openai",
        model: "gpt-test",
        apiKey: "sk-test-secret",
      },
      status: "OpenAI selected.",
    });
    mocks.scoreAllJobs.mockImplementation(async (options = {}) => {
      options.onProgress?.({
        processed: 1,
        total: 1,
        scored: 1,
        preservedEnhanced: 0,
        skipped: 0,
        currentJob: {
          id: "job-1",
          title: "Software Engineer",
          company: "Acme",
        },
      });
      return BASELINE_RESULT;
    });
    mocks.buildJudgeBatch.mockResolvedValue({
      generatedAt: "2026-08-01T00:00:00.000Z",
      country: null,
      resume: { skills: [], titles: [], summary: "", text: "" },
      count: 1,
      items: [
        {
          id: "job-1",
          title: "Software Engineer",
          company: "Acme",
          country: "US",
          applyUrl: "https://example.test",
          fitScore: 20,
          fitReasons: [],
          fitSummary: null,
          skills: [],
          description: "Build software.",
          postedAt: null,
          firstSeenAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      instructions: "",
      outputPath: "",
    });
    mocks.scoreExternalJudgeBatch.mockResolvedValue([
      {
        id: "job-1",
        score: 90,
        summary: "Strong fit",
        fits: ["Relevant experience"],
        gaps: [],
      },
    ]);
    mocks.applyJudgeScores.mockResolvedValue({ updated: 1, skipped: [] });

    const result = await runJudgeScoring({ onlyUnscored: true });

    expect(result).toMatchObject({
      provider: "openai",
      enhancedScored: 1,
      enhancedStatus: "applied",
    });
    expect(mocks.scoreExternalJudgeBatch).toHaveBeenCalledOnce();
    expect(mocks.buildJudgeBatch).toHaveBeenCalledWith(
      expect.objectContaining({ jobIds: ["job-1"] }),
    );
    expect(mocks.applyJudgeScores).toHaveBeenCalledWith(
      expect.any(Array),
      { provider: "openai" },
    );
  });

  it("surfaces an external failure after the baseline instead of returning success", async () => {
    mocks.resolveJudgeProvider.mockResolvedValue({
      provider: "anthropic",
      external: {
        provider: "anthropic",
        model: "claude-test",
        apiKey: "sk-ant-test-secret",
      },
      status: "Anthropic selected.",
    });
    mocks.scoreAllJobs.mockResolvedValue(BASELINE_RESULT);
    mocks.buildJudgeBatch.mockResolvedValue({
      generatedAt: "2026-08-01T00:00:00.000Z",
      country: null,
      resume: { skills: [], titles: [], summary: "", text: "" },
      count: 1,
      items: [
        {
          id: "job-1",
          title: "Software Engineer",
          company: "Acme",
          country: "US",
          applyUrl: "https://example.test",
          fitScore: 20,
          fitReasons: [],
          fitSummary: null,
          skills: [],
          description: "Build software.",
          postedAt: null,
          firstSeenAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      instructions: "",
      outputPath: "",
    });
    mocks.scoreExternalJudgeBatch.mockRejectedValue(
      new Error("Anthropic Judge request timed out."),
    );

    await expect(runJudgeScoring()).rejects.toThrow(
      "Anthropic Judge request timed out.",
    );
    expect(getJudgeRunProgress()).toMatchObject({
      running: false,
      phase: "failed",
      provider: "anthropic",
    });
    expect(mocks.applyJudgeScores).not.toHaveBeenCalled();
  });
});
