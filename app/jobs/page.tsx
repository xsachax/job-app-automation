"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";

interface Sighting {
  source: { id: string; name: string; kind: string };
}
interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applyUrl: string;
  atsType: string;
  remote: boolean;
  country: string | null;
  minYoE: number | null;
  discoverySystem: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sightings: Sighting[];
}

const COUNTRIES: { value: "US" | "CA"; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];
const SINCE_FILTERS: { value: string; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [sort, setSort] = useState("posted");
  const [since, setSince] = useState("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ view: "discovery", country, sort, since });
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
  }, [country, sort, since, q]);

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Currently-open entry-level software roles (≤ 2 yrs experience), scraped from company career sites. US and Canada tracked separately."
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {COUNTRIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCountry(c.value)}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (country === c.value ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          className={cls.input + " max-w-40"}
          value={since}
          onChange={(e) => setSince(e.target.value)}
          title="Filter by when the job was posted"
        >
          {SINCE_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={cls.input + " max-w-44"}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          title="Queue ordering"
        >
          <option value="posted">Newest first</option>
          <option value="company">By company</option>
        </select>
        <input
          className={cls.input + " max-w-xs"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or company…"
        />
      </div>

      {!loading && jobs.length > 0 && (
        <p className="mb-3 text-xs text-gray-400">
          {jobs.length} posting{jobs.length === 1 ? "" : "s"} in queue
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500">
          No {country === "US" ? "US" : "Canadian"} entry-level roles yet. Run{" "}
          <code className="rounded bg-gray-100 px-1">npm run discover</code> to fetch fresh postings.
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const sources = Array.from(new Set(job.sightings.map((s) => s.source.name)));
            return (
              <div key={job.id} className={cls.card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold hover:text-indigo-600 hover:underline"
                    >
                      {job.title}
                    </a>
                    <div className="mt-0.5 text-sm text-gray-600">
                      <span className="font-medium text-gray-700">{job.company}</span>
                      {job.location ? ` · ${job.location}` : ""}
                      {job.remote ? " · remote" : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                        {job.discoverySystem ?? job.atsType}
                      </span>
                      {job.minYoE != null && (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">
                          {job.minYoE === 0 ? "no experience req." : `${job.minYoE}+ yrs`}
                        </span>
                      )}
                      <span title={job.postedAt ? "Posted" : "First seen"}>
                        {job.postedAt ? "posted " : "seen "}
                        {timeAgo(job.postedAt ?? job.firstSeenAt)}
                      </span>
                      {sources.length > 0 && <span>· from {sources.join(", ")}</span>}
                    </div>
                  </div>
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cls.btnPrimary + " shrink-0"}
                  >
                    View & apply ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
