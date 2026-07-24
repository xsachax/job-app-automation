"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../components/api";
import { FilterBar } from "../components/jobs/FilterBar";
import { JobCard } from "../components/jobs/JobCard";
import type { ApplicationStatus, Country, FilterState, Job, JobFacets, MultiFilterKey } from "../components/jobs/types";
import { DEFAULT_FILTERS } from "../components/jobs/types";
import { PageHeader } from "../components/ui";

const COUNTRIES: { value: Country; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];

function buildJobsUrl(country: Country, filters: FilterState): string {
  const params = new URLSearchParams({
    view: "discovery",
    country,
    sort: filters.sort,
    since: filters.since,
  });

  const search = filters.q.trim();
  if (search) params.set("q", search);
  if (filters.skills.length > 0) params.set("skills", filters.skills.join(","));
  if (filters.sponsorship.length > 0) params.set("sponsorship", filters.sponsorship.join(","));
  if (filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.employmentType.length > 0) params.set("employmentType", filters.employmentType.join(","));
  if (filters.source.length > 0) params.set("source", filters.source.join(","));
  if (filters.category.length > 0) params.set("category", filters.category.join(","));
  if (filters.remote) params.set("remote", "1");
  if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
  if (filters.fitMin) params.set("fitMin", String(filters.fitMin));

  return `/api/jobs?${params.toString()}`;
}

function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.sort !== DEFAULT_FILTERS.sort ||
    filters.since !== DEFAULT_FILTERS.since ||
    Boolean(filters.q.trim()) ||
    filters.skills.length > 0 ||
    filters.sponsorship.length > 0 ||
    filters.employmentType.length > 0 ||
    filters.source.length > 0 ||
    filters.category.length > 0 ||
    filters.status.length > 0 ||
    filters.remote ||
    Boolean(filters.salaryMin) ||
    Boolean(filters.fitMin)
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2" aria-label="Loading jobs">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="flex gap-1.5">
                <span className="h-6 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <span className="h-6 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <span className="h-6 w-14 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>
            <div className="h-8 w-28 animate-pulse rounded bg-indigo-100 dark:bg-indigo-950" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [facets, setFacets] = useState<JobFacets | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchDraft, setSearchDraft] = useState(DEFAULT_FILTERS.q);
  const [country, setCountry] = useState<Country>("US");
  const [loading, setLoading] = useState(true);
  const [facetsLoading, setFacetsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedSearch = useRef(DEFAULT_FILTERS.q);

  const jobsUrl = useMemo(() => buildJobsUrl(country, filters), [country, filters]);
  const filtered = hasActiveFilters(filters);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<Job[]>(jobsUrl);
        if (active) {
          setJobs(data);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setJobs([]);
          setError((caught as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobsUrl]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<JobFacets>("/api/jobs/facets");
        if (active) {
          setFacets(data);
          setFacetsError(null);
        }
      } catch (caught) {
        if (active) setFacetsError((caught as Error).message);
      } finally {
        if (active) setFacetsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function startRefresh() {
    setLoading(true);
    setError(null);
  }

  function handleCountryChange(nextCountry: Country) {
    if (nextCountry === country) return;
    startRefresh();
    setCountry(nextCountry);
  }

  function handleFiltersChange(patch: Partial<FilterState>) {
    startRefresh();
    setFilters((current) => ({ ...current, ...patch }));
  }

  function handleToggleValue(key: MultiFilterKey, value: string) {
    startRefresh();
    setFilters((current) => {
      const currentValues = current[key];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...current, [key]: nextValues };
    });
  }

  function handleSearchDraftChange(value: string) {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const nextSearch = value.trim();
      if (nextSearch !== committedSearch.current) {
        committedSearch.current = nextSearch;
        startRefresh();
        setFilters((current) => ({ ...current, q: nextSearch }));
      }
    }, 300);
  }

  function handleClearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    committedSearch.current = DEFAULT_FILTERS.q;
    setSearchDraft(DEFAULT_FILTERS.q);
    startRefresh();
    setFilters(DEFAULT_FILTERS);
  }

  async function handleStatusChange(jobId: string, nextStatus: ApplicationStatus) {
    const previous = jobs.find((job) => job.id === jobId);
    if (!previous) return;

    const optimisticAppliedAt = nextStatus === "applied" ? new Date().toISOString() : previous.appliedAt;
    setError(null);
    setUpdatingIds((current) => {
      const next = new Set(current);
      next.add(jobId);
      return next;
    });
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              applicationStatus: nextStatus,
              appliedAt: nextStatus === "none" ? null : optimisticAppliedAt,
            }
          : job,
      ),
    );

    try {
      const updated = await api<Job>(`/api/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ applicationStatus: nextStatus }),
      });
      setJobs((current) => current.map((job) => (job.id === jobId ? updated : job)));
    } catch (caught) {
      setJobs((current) => current.map((job) => (job.id === jobId ? previous : job)));
      setError(`Could not update status: ${(caught as Error).message}`);
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
    }
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Currently-open entry-level software roles (≤ 2 yrs experience), scraped from company career sites. US and Canada tracked separately."
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900">
        {COUNTRIES.map((countryOption) => (
          <button
            key={countryOption.value}
            type="button"
            onClick={() => handleCountryChange(countryOption.value)}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-indigo-400 dark:focus:ring-offset-gray-900 " +
              (country === countryOption.value
                ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-800 dark:text-indigo-300"
                : "text-gray-500 hover:bg-white hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200")
            }
          >
            {countryOption.label}
          </button>
        ))}
      </div>

      <FilterBar
        facets={facets}
        facetsLoading={facetsLoading}
        facetsError={facetsError}
        filters={filters}
        searchDraft={searchDraft}
        onFiltersChange={handleFiltersChange}
        onSearchDraftChange={handleSearchDraftChange}
        onToggleValue={handleToggleValue}
        onClear={handleClearFilters}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {!loading || jobs.length > 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {jobs.length} posting{jobs.length === 1 ? "" : "s"} in queue
            {loading ? " · refreshing…" : ""}
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">Loading queue…</p>
        )}
        {filtered && (
          <p className="text-xs text-indigo-600 dark:text-indigo-300">Filters active across {country} postings</p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <LoadingRows />
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          No {country === "US" ? "US" : "Canadian"} entry-level roles yet. Run{" "}
          <code className="rounded bg-gray-100 px-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">npm run discover</code> to fetch fresh postings.
          {filtered ? " Clear filters to widen the queue." : ""}
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} updating={updatingIds.has(job.id)} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
