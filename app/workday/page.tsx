"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { CompanyLogo } from "../components/CompanyLogo";
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
        <div className="space-y-2">
          {jobs.map((job) => {
            const sources = Array.from(new Set(job.sightings.map((s) => s.source.name)));
            const meta = [job.company, job.location, sources.length ? `from ${sources.join(", ")}` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={job.id} className={`${cls.cardTight} flex items-center gap-3`}>
                <CompanyLogo company={job.company} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <CountryFlag country={job.country} />
                    <span className="truncate text-sm font-semibold" title={job.title}>
                      {job.title}
                    </span>
                  </div>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={meta}>
                    {meta}
                  </div>
                </div>
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Open on Workday ↗
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
