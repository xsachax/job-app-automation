"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  JudgeRunProgress,
  JudgeRunResult,
} from "@/lib/judge/run";
import { api } from "./api";

const STARTING_PROGRESS: JudgeRunProgress = {
  running: true,
  phase: "starting",
  processed: 0,
  total: 0,
  scored: 0,
  preservedEnhanced: 0,
  skipped: 0,
  provider: "deterministic",
  currentJob: null,
  message: "Preparing eligible jobs…",
  startedAt: null,
  finishedAt: null,
};

export function useJudgeRun() {
  const [progress, setProgress] = useState<JudgeRunProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [requestActive, setRequestActive] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestActiveRef = useRef(false);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      const next = await api<JudgeRunProgress>("/api/judge/score");
      if (mountedRef.current) {
        setProgress((current) => {
          const sameRun =
            Boolean(current?.startedAt) &&
            current?.startedAt === next.startedAt;
          if (
            sameRun &&
            current.phase === next.phase &&
            ((!current.running && next.running) ||
              next.processed < current.processed)
          ) {
            return current;
          }
          return next;
        });
        setProgressError(null);
      }
      return next;
    } catch (error) {
      if (mountedRef.current) {
        setProgressError(`Progress unavailable: ${(error as Error).message}`);
      }
      return null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(() => {
      void pollProgress().then((next) => {
        if (next && !next.running && !requestActiveRef.current) {
          stopPolling();
        }
      });
    }, 500);
  }, [pollProgress, stopPolling]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    (async () => {
      try {
        const current = await api<JudgeRunProgress>("/api/judge/score");
        if (!active) return;
        if (!requestActiveRef.current || current.running) {
          setProgress(current);
        }
        setProgressError(null);
        if (current.running) startPolling();
      } catch (error) {
        if (active) {
          setProgressError(`Progress unavailable: ${(error as Error).message}`);
        }
      }
    })();
    return () => {
      active = false;
      mountedRef.current = false;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  const runJudge = useCallback(
    async (body: Record<string, unknown> = {}) => {
      requestActiveRef.current = true;
      setRequestActive(true);
      setProgress(STARTING_PROGRESS);
      setProgressError(null);
      const request = api<JudgeRunResult>("/api/judge/score", {
        method: "POST",
        body: JSON.stringify(body),
      });
      startPolling();
      let result: JudgeRunResult | undefined;
      let requestError: unknown;
      try {
        const completed = await request;
        result = completed;
        if (mountedRef.current) {
          setProgress((current) => ({
            ...(current ?? STARTING_PROGRESS),
            running: false,
            phase: "complete",
            processed: completed.scanned,
            total: completed.scanned,
            scored: completed.scored,
            preservedEnhanced: completed.preservedEnhanced,
            skipped: completed.skipped,
            provider: completed.provider,
            currentJob: null,
            message: completed.message,
            finishedAt: new Date().toISOString(),
          }));
        }
      } catch (error) {
        requestError = error;
      } finally {
        requestActiveRef.current = false;
        const current = await pollProgress();
        if (!current && mountedRef.current) {
          setProgress((previous) => ({
            ...(previous ?? STARTING_PROGRESS),
            running: false,
            phase: result ? "complete" : "failed",
            currentJob: null,
            message: result
              ? result.message
              : requestError instanceof Error
                ? requestError.message
                : String(requestError),
            finishedAt: new Date().toISOString(),
          }));
        }
        if (!current?.running) stopPolling();
        if (mountedRef.current) setRequestActive(false);
      }
      if (requestError) throw requestError;
      if (!result) throw new Error("Judge completed without a result.");
      return result;
    },
    [pollProgress, startPolling, stopPolling],
  );

  return {
    runJudge,
    progress,
    progressError,
    running: requestActive || Boolean(progress?.running),
  };
}

export function JudgeProgressBar({
  active,
  progress,
  error,
  className = "",
}: {
  active: boolean;
  progress: JudgeRunProgress | null;
  error?: string | null;
  className?: string;
}) {
  if (!active) return null;
  const total = progress?.total ?? 0;
  const processed = progress?.processed ?? 0;
  const percentage = total
    ? Math.min(100, Math.round((processed / total) * 100))
    : null;

  return (
    <div
      className={`w-full ${className}`.trim()}
      data-testid="judge-progress"
      aria-live="polite"
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate">
          {progress?.message ?? "Preparing eligible jobs…"}
        </span>
        <span className="shrink-0 tabular-nums">
          {percentage == null
            ? "Starting…"
            : `${processed.toLocaleString()}/${total.toLocaleString()} · ${percentage}%`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        aria-label="Judge scoring progress"
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={total ? processed : undefined}
      >
        <div
          className={
            "h-full rounded-full bg-indigo-600 transition-[width] duration-300 motion-reduce:transition-none " +
            (total ? "" : "animate-pulse")
          }
          style={{
            width: total ? `${percentage}%` : "8%",
          }}
        />
      </div>
      {error && (
        <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
