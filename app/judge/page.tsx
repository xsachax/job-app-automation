"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../components/api";
import {
  JudgeProgressBar,
  useJudgeRun,
} from "../components/JudgeProgress";
import { cls, PageHeader } from "../components/ui";
import { FIT_BANDS, JUDGE_AXES } from "@/lib/judge/status";

interface JudgeStatus {
  eligible: number;
  scored: number;
  unscored: number;
  providerCounts: {
    deterministic: number;
    copilot: number;
    openai: number;
    anthropic: number;
  };
  providerStatus: {
    provider: "openai" | "anthropic";
    model: string;
    hasApiKey: boolean;
    apiKeyHint: string | null;
    copilotConnected: boolean;
    copilotHasPriority: boolean;
    effectiveProvider: "deterministic" | "copilot" | "openai" | "anthropic";
    enhancedAvailable: boolean;
    status: string;
  };
  avgScore: number | null;
  lastScoredAt: string | null;
  distribution: { strong: number; possible: number; weak: number; unscored: number };
  companyTiers: number;
  locationTiers: number;
  resume: { url: string; skills: number; titles: number; hasSummary: boolean };
  salaryTarget: number | null;
}

interface Criteria {
  titles: string[];
  locations: string[];
  keywords: string[];
  excludeKeywords: string[];
  remoteOnly: boolean;
  seniority: string[];
  salaryTarget: number | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={cls.card}>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</div>}
    </div>
  );
}

const SEGMENTS = [
  ...FIT_BANDS,
  { key: "unscored", label: "Unscored", bar: "bg-gray-100 dark:bg-gray-800", dot: "bg-gray-300 dark:bg-gray-700" },
] as const;

export default function JudgePage() {
  const [status, setStatus] = useState<JudgeStatus | null>(null);
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [salary, setSalary] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const judgeRun = useJudgeRun();
  const judgeProgress = judgeRun.progress;
  const observedRunningJudge = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      api<JudgeStatus>("/api/judge/status"),
      api<Criteria>("/api/criteria"),
    ]);
    setStatus(s);
    setCriteria(c);
    setSalary(c.salaryTarget != null ? String(c.salaryTarget) : "");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  useEffect(() => {
    const current = judgeProgress;
    if (current?.running && current.startedAt) {
      observedRunningJudge.current = current.startedAt;
      return;
    }
    if (
      current?.phase === "failed" &&
      current.startedAt === observedRunningJudge.current
    ) {
      observedRunningJudge.current = null;
      (async () => {
        try {
          setStatus(await api<JudgeStatus>("/api/judge/status"));
        } catch (e) {
          setError(`Judge failed and status refresh failed: ${(e as Error).message}`);
        }
      })();
      return;
    }
    if (
      current?.phase !== "complete" ||
      !current.startedAt ||
      current.startedAt !== observedRunningJudge.current
    ) {
      return;
    }

    observedRunningJudge.current = null;
    (async () => {
      try {
        setStatus(await api<JudgeStatus>("/api/judge/status"));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [judgeProgress]);

  async function rerun() {
    setRunning(true);
    setError(null);
    setMsg(null);
    try {
      const result = await judgeRun.runJudge();
      await load();
      setMsg(result.message);
    } catch (e) {
      const runError = (e as Error).message;
      try {
        await load();
        setError(runError);
      } catch (statusError) {
        setError(
          `${runError} Status refresh failed: ${(statusError as Error).message}`,
        );
      }
    } finally {
      setRunning(false);
    }
  }

  async function saveSalary() {
    if (!criteria) return;
    setSavingSalary(true);
    setError(null);
    setMsg(null);
    try {
      const n = parseInt(salary, 10);
      const salaryTarget = Number.isFinite(n) && n > 0 ? n : null;
      const saved = await api<Criteria>("/api/criteria", {
        method: "PUT",
        body: JSON.stringify({ ...criteria, salaryTarget }),
      });
      setCriteria(saved);
      setSalary(saved.salaryTarget != null ? String(saved.salaryTarget) : "");
      setStatus((s) => (s ? { ...s, salaryTarget: saved.salaryTarget } : s));
      setMsg("Target salary saved. Re-run the judge to apply it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingSalary(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!status) return <p className="text-sm text-red-600">{error ?? "Failed to load judge status."}</p>;

  const total = status.eligible || 1;
  const coverage = Math.round((status.scored / total) * 100);
  const enhancedCount =
    status.providerCounts.copilot +
    status.providerCounts.openai +
    status.providerCounts.anthropic;
  const activeProvider =
    status.providerStatus.effectiveProvider === "copilot"
      ? "GitHub Copilot"
      : status.providerStatus.effectiveProvider === "openai"
        ? "OpenAI"
        : status.providerStatus.effectiveProvider === "anthropic"
          ? "Anthropic"
          : "Deterministic only";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Judge"
        subtitle="Company tier sets each posting's score band; the deterministic baseline is always available and enhanced résumé evidence uses Copilot first, then your selected fallback."
      >
        <button
          className={cls.btnGreen}
          onClick={rerun}
          disabled={running || judgeRun.running}
        >
          {running ? "Re-running…" : "Re-run judge"}
        </button>
      </PageHeader>

      <JudgeProgressBar
        active={judgeRun.running}
        progress={judgeProgress}
        error={judgeRun.progressError}
        className="mb-4 ml-auto max-w-xl"
      />

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Scored" value={`${status.scored}/${status.eligible}`} hint={`${coverage}% of eligible postings`} />
        <Stat label="Average fit" value={status.avgScore ?? "—"} hint={status.scored ? "across scored postings" : "run the judge to populate"} />
        <Stat label="Strong fits" value={status.distribution.strong} hint="score ≥ 70" />
        <Stat label="Last run" value={timeAgo(status.lastScoredAt)} hint={enhancedCount ? `${enhancedCount} enhanced scores` : "deterministic baseline"} />
      </div>

      <section className={cls.card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Active Judge path</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              <strong>{activeProvider}</strong> — {status.providerStatus.status}
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Stored provenance: {status.providerCounts.copilot} Copilot,{" "}
              {status.providerCounts.openai} OpenAI,{" "}
              {status.providerCounts.anthropic} Anthropic,{" "}
              {status.providerCounts.deterministic} baseline.
            </p>
          </div>
          <Link href="/settings" className={cls.btn}>
            Configure fallback
          </Link>
        </div>
      </section>

      {/* Fit distribution */}
      <section className={cls.card}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Fit distribution</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{status.eligible} eligible</span>
        </div>
        {status.eligible === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No eligible postings yet. Run discovery to populate the queue.
          </p>
        ) : (
          <>
            <div
              className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
              role="img"
              aria-label={`${status.distribution.strong} strong, ${status.distribution.possible} possible, ${status.distribution.weak} weak, ${status.distribution.unscored} unscored`}
            >
              {SEGMENTS.map((seg) => {
                const count = status.distribution[seg.key as keyof JudgeStatus["distribution"]];
                const pct = (count / total) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={seg.key}
                    className={`${seg.bar} h-full transition-[width] duration-700 ease-out motion-reduce:transition-none`}
                    style={{ width: `${pct}%` }}
                    title={`${seg.label}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {SEGMENTS.map((seg) => {
                const count = status.distribution[seg.key as keyof JudgeStatus["distribution"]];
                return (
                  <div key={seg.key} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${seg.dot}`} aria-hidden />
                    <span className="text-gray-600 dark:text-gray-300">{seg.label}</span>
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{count}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* How scoring works */}
      <section className={cls.card + " p-0 overflow-hidden"}>
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold">How the score is built</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Company tier selects a non-overlapping score band. Résumé fit and
            the remaining signals decide where the job lands inside that band.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <tr>
              <th className="px-5 py-2 font-medium">Axis</th>
              <th className="px-5 py-2 font-medium">What it reads</th>
              <th className="px-5 py-2 text-right font-medium">Effect</th>
            </tr>
          </thead>
          <tbody>
            {JUDGE_AXES.map((axis) => (
              <tr key={axis.key} className="border-t border-gray-100 dark:border-gray-800">
                <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{axis.name}</td>
                <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{axis.reads}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                  {axis.effect}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Inputs feeding the judge */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Inputs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Résumé */}
          <div className={cls.card}>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Résumé</div>
            {status.resume.url ? (
              <a
                href={status.resume.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                title={status.resume.url}
              >
                {status.resume.url}
              </a>
            ) : (
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">No résumé link set.</p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {status.resume.skills} skills · {status.resume.titles} titles
              {status.resume.hasSummary ? " · summary on file" : " · no summary"}
            </p>
            <Link href="/profile" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Edit in Profile →
            </Link>
          </div>

          {/* Salary target */}
          <div className={cls.card}>
            <label htmlFor="judge-salary" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Target salary (USD)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="judge-salary"
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                placeholder="e.g. 110000"
                className={cls.input}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
              <button className={cls.btn} onClick={saveSalary} disabled={savingSalary}>
                {savingSalary ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Postings that meet or beat it rank higher; those well below rank lower. Missing pay stays neutral.
            </p>
          </div>

          {/* Company tiers */}
          <Link href="/tiers" className={cls.card + " block transition-colors hover:border-indigo-300 dark:hover:border-indigo-700"}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Company tiers</span>
              <span className="text-2xl font-bold tabular-nums">{status.companyTiers}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">companies rated S–F</p>
            <span className="mt-3 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">Open company tiers →</span>
          </Link>

          {/* Location tiers */}
          <Link href="/location-tiers" className={cls.card + " block transition-colors hover:border-indigo-300 dark:hover:border-indigo-700"}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Location tiers</span>
              <span className="text-2xl font-bold tabular-nums">{status.locationTiers}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">locations rated S–F</p>
            <span className="mt-3 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">Open location tiers →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
