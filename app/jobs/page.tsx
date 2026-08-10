"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../components/api";
import { FilterBar } from "../components/jobs/FilterBar";
import { JobCard } from "../components/jobs/JobCard";
import { ScanButton } from "../components/ScanButton";
import type {
  ApplicationStatus,
  Country,
  FilterState,
  Job,
  JobAvailabilityView,
  JobFacets,
  MultiFilterKey,
} from "../components/jobs/types";
import { DEFAULT_FILTERS } from "../components/jobs/types";
import { PageHeader } from "../components/ui";
import {
  isGoogleChromeBrowser,
  launchAutofillApplication,
  pingAutofillExtension,
} from "@/lib/chromeExtension";
import type { ProfileData } from "@/lib/settings";
import type { DiscoveryScopeCopy } from "@/lib/discovery/scope-copy";

const COUNTRIES: { value: Country; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];

const AVAILABILITY_VIEWS: {
  value: JobAvailabilityView;
  label: string;
}[] = [
  { value: "active", label: "Open & rechecking" },
  { value: "closed", label: "Archived closed" },
];

// The queue can hold well over a thousand postings; rendering every card up front
// is slow and janky. Show a page at a time and let the user reveal more.
const PAGE_SIZE = 60;
const GENERIC_SCOPE_SUMMARY =
  "Open roles matching your saved discovery settings.";
type ExtensionConnection = "none" | "checking" | "ready" | "off" | "error";

function openExternal(url: string): boolean {
  const win = window.open(url, "_blank");
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    // Cross-origin tabs are already isolated.
  }
  return true;
}

function buildJobsUrl(
  country: Country,
  availability: JobAvailabilityView,
  filters: FilterState,
): string {
  const params = new URLSearchParams({
    view: "discovery",
    country,
    availability,
    sort: filters.sort,
    since: filters.since,
  });

  const search = filters.q.trim();
  if (search) params.set("q", search);
  if (filters.skills.length > 0) params.set("skills", filters.skills.join(","));
  if (filters.sponsorship.length > 0) params.set("sponsorship", filters.sponsorship.join(","));
  if (filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.employmentType.length > 0) params.set("employmentType", filters.employmentType.join(","));
  if (filters.platform.length > 0) params.set("platform", filters.platform.join(","));
  if (filters.source.length > 0) params.set("source", filters.source.join(","));
  if (filters.category.length > 0) params.set("category", filters.category.join(","));
  if (filters.remote) params.set("remote", "1");
  if (filters.warmIntro) params.set("connections", "1");
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
    filters.platform.length > 0 ||
    filters.source.length > 0 ||
    filters.category.length > 0 ||
    filters.status.length > 0 ||
    filters.remote ||
    filters.warmIntro ||
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
  const [availability, setAvailability] =
    useState<JobAvailabilityView>("active");
  const [loading, setLoading] = useState(true);
  const [facetsLoading, setFacetsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [extensionConnection, setExtensionConnection] =
    useState<ExtensionConnection>("none");
  const [extensionMessage, setExtensionMessage] = useState<string | null>(null);
  const [scopeSummary, setScopeSummary] = useState(GENERIC_SCOPE_SUMMARY);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedSearch = useRef(DEFAULT_FILTERS.q);

  const jobsUrl = useMemo(
    () => buildJobsUrl(country, availability, filters),
    [availability, country, filters],
  );
  const facetsUrl = `/api/jobs/facets?availability=${availability}`;
  const filtered = hasActiveFilters(filters);

  useEffect(() => {
    let active = true;
    void api<DiscoveryScopeCopy>("/api/discovery/scope")
      .then((scope) => {
        if (!active) return;
        setScopeSummary(scope.summary);
        setScopeError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setScopeError(
          `Could not load the saved discovery scope: ${
            caught instanceof Error ? caught.message : String(caught)
          }`,
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<Job[]>(jobsUrl);
        if (active) {
          setJobs(data);
          setVisibleCount(PAGE_SIZE);
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
  }, [jobsUrl, refreshVersion]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<JobFacets>(facetsUrl);
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
  }, [facetsUrl, refreshVersion]);

  useEffect(() => {
    if (!isGoogleChromeBrowser()) return;

    let active = true;
    void Promise.resolve().then(async () => {
      setExtensionConnection("checking");
      try {
        const response = await pingAutofillExtension();
        if (!active) return;
        setExtensionConnection(response.enabled ? "ready" : "off");
      } catch (caught) {
        if (!active) return;
        setExtensionConnection("error");
        setExtensionMessage(
          `Autofill extension unavailable: ${
            caught instanceof Error ? caught.message : String(caught)
          }. Job links will open normally.`,
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Only a page of postings is rendered at a time; everything selection-related
  // operates on that visible slice so "Select all" matches what's on screen.
  const shownJobs = useMemo(() => jobs.slice(0, visibleCount), [jobs, visibleCount]);

  // Selection is stored as a plain id set; we always intersect it with the jobs
  // currently loaded so a country switch or filter change can never "Open" a
  // posting that is no longer visible. Stale ids simply go unused.
  const selectedVisibleIds = useMemo(
    () => jobs.filter((job) => selectedIds.has(job.id)).map((job) => job.id),
    [jobs, selectedIds],
  );
  const selectedCount = selectedVisibleIds.length;
  const allSelected =
    shownJobs.length > 0 && shownJobs.every((job) => selectedIds.has(job.id));

  function toggleSelect(jobId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        for (const job of shownJobs) next.delete(job.id);
      } else {
        for (const job of shownJobs) next.add(job.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function openSelected() {
    const chosen = jobs.filter((job) => selectedIds.has(job.id));
    if (chosen.length === 0) return;
    let blocked = 0;
    for (const job of chosen) {
      if (!openExternal(job.applyUrl)) blocked += 1;
    }
    if (blocked > 0) {
      setError(
        `Your browser blocked ${blocked} of ${chosen.length} tab${chosen.length === 1 ? "" : "s"}. Allow pop-ups for this site to open every selected posting at once.`,
      );
    } else {
      setError(null);
    }
  }

  async function openWithExtension(job: Job) {
    setExtensionMessage(null);
    try {
      const profile = await api<ProfileData>("/api/profile");
      await launchAutofillApplication(
        {
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          url: job.applyUrl,
          country: job.country,
        },
        profile,
      );
    } catch (caught) {
      setExtensionConnection("error");
      const openedNormally = openExternal(job.applyUrl);
      setExtensionMessage(
        `Autofill extension failed: ${
          caught instanceof Error ? caught.message : String(caught)
        }. ${
          openedNormally
            ? "The posting was opened normally."
            : "Allow pop-ups for this dashboard, then open the posting again."
        }`,
      );
    }
  }

  function startRefresh() {
    setLoading(true);
    setError(null);
  }

  function handleScrapeComplete() {
    startRefresh();
    setFacetsLoading(true);
    setRefreshVersion((version) => version + 1);
  }

  function handleCountryChange(nextCountry: Country) {
    if (nextCountry === country) return;
    startRefresh();
    setCountry(nextCountry);
  }

  function handleAvailabilityChange(nextView: JobAvailabilityView) {
    if (nextView === availability) return;
    startRefresh();
    setFacetsLoading(true);
    setAvailability(nextView);
    clearSelection();
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
        subtitle={`${scopeSummary} Confirmed closures remain in Archived closed so saved and applied history is never lost.`}
      >
        <ScanButton onComplete={handleScrapeComplete} />
      </PageHeader>

      {scopeError && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {scopeError}
        </div>
      )}

      <div
        className="mb-3 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-900"
        data-testid="availability-tabs"
      >
        {AVAILABILITY_VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            onClick={() => handleAvailabilityChange(view.value)}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-indigo-400 dark:focus:ring-offset-gray-900 " +
              (availability === view.value
                ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-800 dark:text-indigo-300"
                : "text-gray-500 hover:bg-white hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200")
            }
          >
            {view.label}
          </button>
        ))}
      </div>

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

      {extensionConnection !== "none" && (
        <div
          className={
            "mb-3 rounded-lg border px-3 py-2 text-xs " +
            (extensionConnection === "ready"
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300")
          }
        >
          {extensionConnection === "checking"
            ? "Checking the Chrome autofill extension…"
            : extensionConnection === "ready"
              ? "Chrome autofill is ready. Opening a job launches the application assistant."
              : extensionConnection === "off"
                ? "The Chrome autofill extension is off. Job links will open normally."
                : "The Chrome autofill extension is not connected. Job links will open normally."}
        </div>
      )}

      {extensionMessage && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          {extensionMessage}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {!loading || jobs.length > 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {jobs.length} {availability === "closed" ? "archived " : ""}posting
            {jobs.length === 1 ? "" : "s"} {availability === "closed" ? "" : "in queue"}
            {loading ? " · refreshing…" : ""}
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">Loading queue…</p>
        )}
        {filtered && (
          <p className="text-xs text-indigo-600 dark:text-indigo-300">Filters active across {country} postings</p>
        )}
      </div>

      {availability === "active" && jobs.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all postings"
              data-testid="select-all"
              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
            />
            Select all
          </label>
          <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="selected-count">
            {selectedCount} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={openSelected}
              disabled={selectedCount === 0}
              data-testid="open-selected"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus:ring-offset-gray-900"
            >
              Open{selectedCount > 0 ? ` ${selectedCount}` : ""} selected ↗
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <LoadingRows />
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          No {country === "US" ? "US" : "Canadian"}{" "}
          {availability === "closed" ? "archived closed" : "in-scope"} roles yet.
          {availability === "active" && (
            <>
              {" "}Run{" "}
              <code className="rounded bg-gray-100 px-1 text-gray-700 dark:bg-gray-800 dark:text-gray-200">npm run discover</code> to fetch fresh postings.
            </>
          )}
          {filtered ? " Clear filters to widen the queue." : ""}
        </div>
      ) : (
        <div className="space-y-2">
          {shownJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              updating={updatingIds.has(job.id)}
              onStatusChange={handleStatusChange}
              selected={selectedIds.has(job.id)}
              onToggleSelect={
                availability === "active" ? toggleSelect : undefined
              }
              openLabel={
                availability === "closed" ? "View archived link ↗" : undefined
              }
              onOpen={
                availability === "active" && extensionConnection === "ready"
                  ? openWithExtension
                  : undefined
              }
            />
          ))}
          {visibleCount < jobs.length && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                data-testid="show-more"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Show more
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="show-more-count">
                Showing {Math.min(visibleCount, jobs.length)} of {jobs.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
