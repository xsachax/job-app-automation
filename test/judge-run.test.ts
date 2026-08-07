import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ScoreAllJobsOptions,
  ScoreAllJobsResult,
} from "../lib/judge/judge";

type ScoreAllJobs = typeof import("../lib/judge/judge").scoreAllJobs;

const mocks = vi.hoisted(() => ({
  scoreAllJobs: vi.fn<ScoreAllJobs>(),
}));

vi.mock("../lib/judge/judge", () => ({
  scoreAllJobs: mocks.scoreAllJobs,
}));

import {
  getJudgeRunProgress,
  JudgeRunInProgressError,
  runJudgeScoring,
} from "../lib/judge/run";

const RESULT: ScoreAllJobsResult = {
  scanned: 2,
  scored: 1,
  preservedAgent: 1,
  skipped: 0,
  provider: "deterministic",
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
        preservedAgent: 0,
        skipped: 0,
        currentJob: null,
      });
      return pending.promise;
    });

    const first = runJudgeScoring();
    expect(getJudgeRunProgress()).toMatchObject({
      running: true,
      phase: "scoring",
      processed: 0,
      total: 2,
    });
    await expect(runJudgeScoring()).rejects.toBeInstanceOf(
      JudgeRunInProgressError,
    );

    report?.({
      processed: 2,
      total: 2,
      scored: 1,
      preservedAgent: 1,
      skipped: 0,
      currentJob: {
        id: "job-2",
        company: "Acme",
        title: "Software Engineer I",
      },
    });
    pending.resolve(RESULT);
    await expect(first).resolves.toEqual(RESULT);
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
      .mockResolvedValueOnce(RESULT);

    const first = runJudgeScoring();
    const queued = runJudgeScoring(
      { onlyUnscored: true },
      { waitForActive: true },
    );
    expect(mocks.scoreAllJobs).toHaveBeenCalledTimes(1);

    pending.resolve(RESULT);
    await first;
    await expect(queued).resolves.toEqual(RESULT);
    expect(mocks.scoreAllJobs).toHaveBeenCalledTimes(2);
    expect(mocks.scoreAllJobs.mock.calls[1]?.[0]).toMatchObject({
      onlyUnscored: true,
    });
  });
});
