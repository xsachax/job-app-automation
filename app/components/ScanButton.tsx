"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { cls } from "./ui";

type DiscoverySourceOutcome = "complete" | "degraded" | "limited" | "failed";
type DiscoverySourceOutcomeCounts = Record<DiscoverySourceOutcome, number>;

interface ScanTotals {
  sources: number;
  created: number;
  updated: number;
  usEntry: number;
  caEntry: number;
  outcomes: DiscoverySourceOutcomeCounts;
  suspect: number;
  closed: number;
}

interface SourceResult {
  company: string;
  observedCount: number;
  outcome: DiscoverySourceOutcome;
  reason: string;
}

interface DiscoveryRefresh {
  totals: ScanTotals;
  durationMs: number;
  api: {
    companies: SourceResult[];
  };
  browser: SourceResult[];
  judge: {
    scored: number;
  };
}

interface NoticeGroup {
  outcome: Exclude<DiscoverySourceOutcome, "complete">;
  label: string;
  sources: SourceResult[];
  omitted: number;
}

interface Notice {
  tone: "success" | "warning" | "error";
  text: string;
  details?: NoticeGroup[];
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
  outcomes: DiscoverySourceOutcomeCounts;
  nextAllowedAt: string | null;
}

const EMPTY_OUTCOMES: DiscoverySourceOutcomeCounts = {
  complete: 0,
  degraded: 0,
  limited: 0,
  failed: 0,
};
const OUTCOME_KEYS = [
  "complete",
  "degraded",
  "limited",
  "failed",
] as const;
const MAX_SUMMARY_NAMES = 6;
const MAX_DETAIL_SOURCES = 20;
const MAX_DISPLAY_REASON_LENGTH = 300;

function formatSourceNames(sources: SourceResult[]): string {
  const shown = sources
    .slice(0, MAX_SUMMARY_NAMES)
    .map((source) => source.company)
    .join(", ");
  const omitted = sources.length - MAX_SUMMARY_NAMES;
  return omitted > 0 ? `${shown}, +${omitted} more` : shown;
}

function displayReason(reason: string): string {
  const normalized = reason
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > MAX_DISPLAY_REASON_LENGTH
    ? `${normalized.slice(0, MAX_DISPLAY_REASON_LENGTH - 3)}...`
    : normalized;
}

function groupSourceOutcomes(sources: SourceResult[]): NoticeGroup[] {
  const definitions = [
    { outcome: "failed", label: "Failed" },
    { outcome: "degraded", label: "Degraded" },
    { outcome: "limited", label: "Limited by design" },
  ] as const;
  return definitions.flatMap(({ outcome, label }) => {
    const matching = sources.filter((source) => source.outcome === outcome);
    return matching.length
      ? [
          {
            outcome,
            label,
            sources: matching.slice(0, MAX_DETAIL_SOURCES),
            omitted: Math.max(0, matching.length - MAX_DETAIL_SOURCES),
          },
        ]
      : [];
  });
}

function validateOutcomeTotals(
  sources: SourceResult[],
  totals: ScanTotals,
): void {
  const actual: DiscoverySourceOutcomeCounts = { ...EMPTY_OUTCOMES };
  for (const source of sources) actual[source.outcome]++;
  const mismatch =
    sources.length !== totals.sources ||
    OUTCOME_KEYS.some(
      (outcome) => actual[outcome] !== totals.outcomes[outcome],
    );
  if (mismatch) {
    throw new Error("Scrape returned inconsistent source outcome totals.");
  }
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
      outcomes: { ...EMPTY_OUTCOMES },
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
      const sources = [...result.api.companies, ...result.browser];
      validateOutcomeTotals(sources, totals);
      const failedSources = sources.filter(
        (source) => source.outcome === "failed",
      );
      const degradedSources = sources.filter(
        (source) => source.outcome === "degraded",
      );
      const limitedSources = sources.filter(
        (source) => source.outcome === "limited",
      );
      const outcomeSummary = [
        `${totals.outcomes.complete} complete`,
        failedSources.length
          ? `failed ${failedSources.length}: ${formatSourceNames(failedSources)}`
          : "",
        degradedSources.length
          ? `degraded ${degradedSources.length}: ${formatSourceNames(degradedSources)}`
          : "",
        limitedSources.length
          ? `limited ${limitedSources.length}: ${formatSourceNames(limitedSources)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const details = groupSourceOutcomes(sources);
      setNotice({
        tone:
          totals.outcomes.failed || totals.outcomes.degraded
            ? "warning"
            : "success",
        text:
          `Scraped ${totals.sources} sources: ${totals.created} new, ${totals.updated} refreshed, ` +
          `${totals.closed} archived, ${totals.suspect} rechecking, ` +
          `${result.judge.scored} newly scored in ${duration}s` +
          (outcomeSummary ? ` · ${outcomeSummary}` : ""),
        ...(details.length ? { details } : {}),
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
            <span className="truncate">
              {progress.message}
              {progress.outcomes.complete > 0
                ? ` · ${progress.outcomes.complete} complete`
                : ""}
              {progress.outcomes.failed > 0
                ? ` · ${progress.outcomes.failed} failed`
                : ""}
              {progress.outcomes.degraded > 0
                ? ` · ${progress.outcomes.degraded} degraded`
                : ""}
              {progress.outcomes.limited > 0
                ? ` · ${progress.outcomes.limited} limited`
                : ""}
            </span>
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
        <div className={`text-right text-sm ${noticeClass}`}>
          <p role="status" aria-live="polite">
            {notice.text}
          </p>
          {notice.details && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer">Source outcome details</summary>
              <div className="mt-2 space-y-2">
                {notice.details.map((group) => (
                  <section key={group.outcome}>
                    <p className="font-medium">
                      {group.label} ({group.sources.length + group.omitted})
                    </p>
                    <ul className="mt-1 space-y-1">
                      {group.sources.map((source) => (
                        <li key={`${group.outcome}:${source.company}`}>
                          {source.company} ({source.observedCount} observed):{" "}
                          {displayReason(source.reason)}
                        </li>
                      ))}
                      {group.omitted > 0 && (
                        <li>+{group.omitted} additional sources</li>
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
