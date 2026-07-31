"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, CountryFlag, PageHeader } from "../components/ui";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  applyUrl: string;
  postedAt: string | null;
  lastSeenAt: string;
  sightings: { source: { name: string } }[];
}

export default function WorkdayPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setJobs(await api<Job[]>("/api/jobs?view=workday"));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Workday (flagged)"
        subtitle="Detected Workday postings. The pipeline never auto-applies to these — apply manually if you want."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500">No Workday jobs flagged yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const sources = Array.from(new Set(job.sightings.map((s) => s.source.name)));
            return (
              <div key={job.id} className={cls.card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CountryFlag country={job.country} />
                      {job.title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {job.company}
                      {job.location ? ` · ${job.location}` : ""}
                    </div>
                    {sources.length > 0 && (
                      <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">from {sources.join(", ")}</div>
                    )}
                  </div>
                  <a href={job.applyUrl} target="_blank" rel="noreferrer" className={cls.btn}>
                    Open on Workday ↗
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
