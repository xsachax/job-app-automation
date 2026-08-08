"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { cls } from "./ui";

interface ScanTotals {
  sources: number;
  created: number;
  updated: number;
  usEntry: number;
  caEntry: number;
  errors: number;
  suspect: number;
  closed: number;
}

interface DiscoveryRefresh {
  totals: ScanTotals;
  durationMs: number;
  api: {
    companies: Array<{ company: string; error?: string }>;
  };
  browser: Array<{ company: string; error?: string }>;
  judge: {
    scored: number;
  };
}

interface Notice {
  tone: "success" | "warning" | "error";
  text: string;
}

interface DiscoveryProgress {
  running: boolean;
  phase:
    | "idle"
    | "starting"
    | "api"
    | "browser"
    | "reconciling"
    | "scoring"
    | "complete"
    | "failed";
  completedSteps: number;
  totalSteps: number;
  completedSources: number;
  totalSources: number;
  currentSource: string | null;
  message: string;
  errors: number;
  nextAllowedAt: string | null;
}

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function ScanButton({ onComplete }: { onComplete?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      setProgress(await api<DiscoveryProgress>("/api/discovery/run"));
      setProgressError(null);
    } catch (error) {
      setProgressError(`Progress unavailable: ${(error as Error).message}`);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialPollTimer = setTimeout(() => {
      void pollProgress().finally(() => {
        if (mounted) setCheckingStatus(false);
      });
    }, 0);
    const countdownTimer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      mounted = false;
      clearTimeout(initialPollTimer);
      clearInterval(countdownTimer);
      stopPolling();
    };
  }, [pollProgress, stopPolling]);

  useEffect(() => {
    if (!progress?.running || loading || pollTimer.current) return;
    pollTimer.current = setInterval(() => void pollProgress(), 1_000);
    return stopPolling;
  }, [loading, pollProgress, progress?.running, stopPolling]);

  async function run() {
    setLoading(true);
    setNotice(null);
    setProgressError(null);
    setProgress({
      running: true,
      phase: "starting",
      completedSteps: 0,
      totalSteps: 0,
      completedSources: 0,
      totalSources: 0,
      currentSource: null,
      message: "Preparing discovery sources…",
      errors: 0,
      nextAllowedAt: progress?.nextAllowedAt ?? null,
    });
    const request = api<DiscoveryRefresh>("/api/discovery/run", {
      method: "POST",
    });
    pollTimer.current = setInterval(() => void pollProgress(), 1_000);
    try {
      const result = await request;
      await pollProgress();
      const totals = result.totals;
      const duration = Math.round(result.durationMs / 1000);
      const failedSources = [...result.api.companies, ...result.browser]
        .filter((source) => source.error)
        .map((source) => source.company);
      const failureSummary = failedSources.length
        ? ` · failed: ${failedSources.join(", ")}`
        : "";
      setNotice({
        tone: totals.errors ? "warning" : "success",
        text:
          `Scraped ${totals.sources} sources: ${totals.created} new, ${totals.updated} refreshed, ` +
          `${totals.closed} archived, ${totals.suspect} rechecking, ` +
          `${result.judge.scored} newly scored in ${duration}s` +
          failureSummary,
      });
      router.refresh();
      onComplete?.();
    } catch (e) {
      await pollProgress();
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      stopPolling();
      setLoading(false);
    }
  }

  const noticeClass =
    notice?.tone === "error"
      ? "text-red-600 dark:text-red-400"
      : notice?.tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : "text-green-700 dark:text-green-300";
  const nextAllowedMs = progress?.nextAllowedAt
    ? Date.parse(progress.nextAllowedAt)
    : Number.NaN;
  const cooldownRemainingMs = Number.isFinite(nextAllowedMs)
    ? Math.max(0, nextAllowedMs - now)
    : 0;
  const isRunning = loading || Boolean(progress?.running);
  const isCoolingDown = !isRunning && cooldownRemainingMs > 0;
  const remainingTime = formatRemainingTime(cooldownRemainingMs);
  const buttonText = checkingStatus
    ? "Checking scrape status…"
    : isRunning
      ? "Scraping… this may take a few minutes"
      : isCoolingDown
        ? `Run scrape in ${remainingTime}`
        : "Run scrape";

  return (
    <div className="flex max-w-2xl flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={checkingStatus || isRunning || isCoolingDown}
        className={cls.btnPrimary}
        aria-busy={isRunning}
      >
        {buttonText}
      </button>
      {isCoolingDown && (
        <p
          className="text-right text-xs text-gray-500 dark:text-gray-400"
          role="status"
          aria-live="polite"
        >
          2-hour scrape cooldown · unlocks automatically.
        </p>
      )}
      {isRunning && progress && (
        <div className="w-full min-w-64 sm:w-[32rem]">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{progress.message}</span>
            <span className="shrink-0 tabular-nums">
              {progress.totalSteps
                ? `${Math.round((progress.completedSteps / progress.totalSteps) * 100)}%`
                : "Starting…"}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
            role="progressbar"
            aria-label="Discovery scrape progress"
            aria-valuemin={0}
            aria-valuemax={progress.totalSteps || undefined}
            aria-valuenow={progress.totalSteps ? progress.completedSteps : undefined}
          >
            <div
              className={
                "h-full rounded-full bg-indigo-600 transition-[width] duration-500 " +
                (progress.totalSteps ? "" : "animate-pulse")
              }
              style={{
                width: progress.totalSteps
                  ? `${Math.min(100, (progress.completedSteps / progress.totalSteps) * 100)}%`
                  : "8%",
              }}
            />
          </div>
        </div>
      )}
      {progressError && (
        <p className="text-right text-xs text-red-600 dark:text-red-400">
          {progressError}
        </p>
      )}
      {notice && (
        <p className={`text-right text-sm ${noticeClass}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}
    </div>
  );
}
