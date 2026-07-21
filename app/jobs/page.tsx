"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader, ScoreBadge, FitBadge, StatusBadge } from "../components/ui";

interface Sighting {
  source: { id: string; name: string; kind: string };
}
interface Application {
  status: string;
  fields: string | null;
  result: string | null;
  submittedAt: string | null;
}
interface Match {
  score: number;
  reasons: string | null;
  status: string;
  resumeScore: number | null;
  resumeReasons: string | null;
  resumeSummary: string | null;
  matchProvider: string | null;
}
interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applyUrl: string;
  atsType: string;
  remote: boolean;
  postedAt: string | null;
  lastSeenAt: string;
  match: Match | null;
  application: Application | null;
  sightings: Sighting[];
}

const REQUIRED = ["firstName", "lastName", "email", "resume"];
const STATUS_FILTERS = ["all", "new", "pending_approval", "submitted", "rejected", "skipped"];

function parse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ view: "matches" });
        if (status !== "all") params.set("status", status);
        if (q.trim()) params.set("q", q.trim());
        const data = await api<Job[]>(`/api/jobs?${params.toString()}`);
        if (active) setJobs(data);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [status, q, refreshKey]);

  async function act(jobId: string, action: "draft" | "approve" | "reject") {
    setBusyId(jobId);
    setError(null);
    try {
      await api(`/api/matches/${jobId}/${action}`, { method: "POST" });
      if (action === "draft") setExpanded(jobId);
      if (action !== "draft") setExpanded(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function rescoreFit() {
    setRescoring(true);
    setError(null);
    try {
      await api("/api/match/rescore", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRescoring(false);
    }
  }

  return (
    <div>
      <PageHeader title="Jobs" subtitle="Matched postings, scored against your criteria. Apply behind the human gate." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select className={cls.input + " max-w-44"} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          className={cls.input + " max-w-xs"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or company…"
        />
        <button onClick={rescoreFit} disabled={rescoring} className={cls.btn} title="Recompute resume-fit baseline for all jobs">
          {rescoring ? "Re-scoring…" : "Re-score fit"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500">
          No matching jobs yet. Add sources and run a scan, then adjust your criteria.
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const app = job.application;
            const reasons = parse<string[]>(job.match?.reasons ?? null, []);
            const resumeReasons = parse<string[]>(job.match?.resumeReasons ?? null, []);
            const fields = parse<Record<string, unknown>>(app?.fields ?? null, {});
            const missing = REQUIRED.filter((k) => {
              const v = fields[k];
              return v == null || String(v).trim() === "";
            });
            const sources = Array.from(new Set(job.sightings.map((s) => s.source.name)));
            const isOpen = expanded === job.id;
            const result = parse<{ mode?: string; message?: string }>(app?.result ?? null, {});

            return (
              <div key={job.id} className={cls.card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <ScoreBadge score={job.match?.score ?? 0} />
                    <div>
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:text-indigo-600 hover:underline"
                      >
                        {job.title}
                      </a>
                      <div className="text-sm text-gray-600">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                        {job.remote ? " · remote" : ""}
                        <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          {job.atsType}
                        </span>
                        <span className="ml-2 align-middle">
                          <FitBadge score={job.match?.resumeScore} provider={job.match?.matchProvider} />
                        </span>
                      </div>
                      {job.match?.resumeSummary && (
                        <div className="mt-1 text-xs font-medium text-indigo-700">
                          {job.match.resumeSummary}
                        </div>
                      )}
                      {resumeReasons.length > 0 && (
                        <div className="mt-1 text-xs text-indigo-500/80">
                          fit: {resumeReasons.join(" · ")}
                        </div>
                      )}
                      {reasons.length > 0 && (
                        <div className="mt-1 text-xs text-gray-400">{reasons.join(" · ")}</div>
                      )}
                      <div className="mt-1 text-xs text-gray-400">
                        from {sources.join(", ") || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={app?.status ?? job.match?.status ?? "new"} />
                    <div className="flex flex-wrap justify-end gap-2">
                      {(!app || app.status === "failed") && job.match?.status !== "skipped" && (
                        <button onClick={() => act(job.id, "draft")} disabled={busyId === job.id} className={cls.btnPrimary}>
                          {busyId === job.id ? "…" : "Draft application"}
                        </button>
                      )}
                      {app?.status === "pending_approval" && (
                        <button onClick={() => setExpanded(isOpen ? null : job.id)} className={cls.btn}>
                          {isOpen ? "Hide review" : "Review & send"}
                        </button>
                      )}
                      {app?.status !== "submitted" && job.match?.status !== "rejected" && (
                        <button onClick={() => act(job.id, "reject")} disabled={busyId === job.id} className={cls.btnDanger}>
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {app?.status === "submitted" && (
                  <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                    Submitted {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : ""}
                    {result.mode ? ` · ${result.mode}` : ""}
                    {result.message ? ` — ${result.message}` : ""}
                  </div>
                )}

                {isOpen && app?.status === "pending_approval" && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-2 text-sm font-semibold text-amber-900">
                      Review before sending — this is exactly what will be submitted
                    </div>
                    <div className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
                      {Object.entries(fields).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-amber-100 py-1">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-right font-medium text-gray-800">
                            {v == null || v === "" ? <span className="text-gray-300">—</span> : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {missing.length > 0 && (
                      <div className="mt-3 text-xs text-red-600">
                        Missing required: {missing.join(", ")}. Fill these on the Profile page first.
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => act(job.id, "approve")}
                        disabled={busyId === job.id || missing.length > 0}
                        className={cls.btnGreen}
                      >
                        {busyId === job.id ? "Sending…" : "Confirm & send"}
                      </button>
                      <button onClick={() => setExpanded(null)} className={cls.btn}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
