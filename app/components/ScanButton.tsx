"use client";

import { useEffect, useRef, useState } from "react";
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
  phase: "idle" | "starting" | "api" | "browser" | "scoring" | "complete" | "failed";
  completedSteps: number;
  totalSteps: number;
  completedSources: number;
  totalSources: number;
  currentSource: string | null;
  message: string;
  errors: number;
}

export function ScanButton({ onComplete }: { onComplete?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  function stopPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }

  useEffect(() => stopPolling, []);

  async function pollProgress() {
    try {
      setProgress(await api<DiscoveryProgress>("/api/discovery/run"));
      setProgressError(null);
    } catch (error) {
      setProgressError(`Progress unavailable: ${(error as Error).message}`);
    }
  }

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

  return (
    <div className="flex max-w-2xl flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className={cls.btnPrimary}
        aria-busy={loading}
      >
        {loading ? "Scraping… this may take a few minutes" : "Run scrape"}
      </button>
      {loading && progress && (
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
          {progressError && (
            <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">
              {progressError}
            </p>
          )}
        </div>
      )}
      {notice && (
        <p className={`text-right text-sm ${noticeClass}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}
    </div>
  );
}
