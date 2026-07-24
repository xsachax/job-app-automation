"use client";

import {
  AppliedBadge,
  CategoryBadge,
  FitBadge,
  SalaryText,
  SkillChips,
  SponsorshipBadge,
} from "../ui";
import type { ApplicationStatus, Job } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const employmentLabels: Record<string, string> = {
  fulltime: "Full-time",
  intern: "Internship",
  contract: "Contract",
};

const secondaryAction =
  "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700";

const dangerAction =
  "rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-950";

const primaryAction =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400 dark:focus:ring-indigo-400 dark:focus:ring-offset-gray-900";

const neutralPill =
  "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
}

export function timeAgo(iso: string | null): string {
  const then = parseTime(iso);
  if (!then) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function titleize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isWithinHours(iso: string | null, hours: number): boolean {
  const then = parseTime(iso);
  if (!then) return false;
  return Date.now() - then <= hours * 60 * 60 * 1000;
}

function isOlderThanDays(iso: string | null, days: number): boolean {
  const then = parseTime(iso);
  if (!then) return false;
  return Date.now() - then > days * DAY_MS;
}

function uniqueSourceNames(job: Job): string[] {
  return Array.from(new Set(job.sightings.map((sighting) => sighting.source.name).filter(Boolean)));
}

function cardTone(status: ApplicationStatus, isNew: boolean): string {
  if (status === "dismissed") {
    return "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-950";
  }
  if (status === "applied") {
    return "border-green-300 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20";
  }
  if (isNew) {
    return "border-indigo-300 bg-indigo-50/40 shadow-indigo-100/70 dark:border-indigo-800 dark:bg-indigo-950/20 dark:shadow-none";
  }
  return "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";
}

interface JobCardProps {
  job: Job;
  updating: boolean;
  onStatusChange: (jobId: string, status: ApplicationStatus) => Promise<void>;
}

export function JobCard({ job, updating, onStatusChange }: JobCardProps) {
  const status = job.applicationStatus || "none";
  const effectivePostedAt = job.postedAt ?? job.firstSeenAt;
  const isNew = isWithinHours(effectivePostedAt, 48);
  const isStale = isOlderThanDays(effectivePostedAt, 30);
  const sources = uniqueSourceNames(job);
  const sourceLabel = job.discoverySystem ?? job.atsType;
  const locationParts = [job.company, job.location, job.remote ? "remote" : null].filter(Boolean);

  return (
    <article
      className={`rounded-lg border p-3 shadow-sm transition-colors ${cardTone(status, isNew)} ${
        isStale && status !== "dismissed" ? "opacity-80" : ""
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={job.category} />
            {isNew && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                NEW
              </span>
            )}
            {isStale && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                stale
              </span>
            )}
            <AppliedBadge status={status} />
          </div>
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="job-title"
            className="mt-1 block text-sm font-semibold leading-5 text-gray-950 hover:text-indigo-600 hover:underline dark:text-gray-100 dark:hover:text-indigo-300"
          >
            {job.title}
          </a>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium text-gray-800 dark:text-gray-100">{locationParts[0]}</span>
            {locationParts.slice(1).map((part) => ` · ${part}`).join("")}
          </p>
        </div>
        <a href={job.applyUrl} target="_blank" rel="noreferrer" className={primaryAction}>
          Open posting ↗
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={neutralPill}>{titleize(sourceLabel)}</span>
        {job.minYoE != null && (
          <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {job.minYoE === 0 ? "No exp. req." : `${job.minYoE}+ yrs`}
          </span>
        )}
        <SalaryText min={job.salaryMin} max={job.salaryMax} currency={job.salaryCurrency} raw={job.salaryRaw} />
        <SponsorshipBadge value={job.sponsorship} />
        {job.employmentType && <span className={neutralPill}>{employmentLabels[job.employmentType] ?? titleize(job.employmentType)}</span>}
        <FitBadge score={job.fitScore} provider={job.fitProvider} />
      </div>

      {job.fitSummary && <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{job.fitSummary}</p>}

      <SkillChips skills={job.skills} limit={7} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span title={job.postedAt ? "Posted" : "First seen"}>
          {job.postedAt ? "Posted " : "First seen "}
          {timeAgo(effectivePostedAt)} · last seen {timeAgo(job.lastSeenAt)}
          {status === "applied" && job.appliedAt ? ` · applied ${timeAgo(job.appliedAt)}` : ""}
        </span>
        {sources.length > 0 && (
          <span className="max-w-full truncate" title={sources.join(", ")}>
            Seen on {sources.join(", ")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-gray-800">
        <button
          type="button"
          disabled={updating || status === "saved"}
          onClick={() => void onStatusChange(job.id, "saved")}
          className={secondaryAction}
        >
          Save
        </button>
        <button
          type="button"
          disabled={updating || status === "applied"}
          onClick={() => void onStatusChange(job.id, "applied")}
          className={secondaryAction}
        >
          Mark applied
        </button>
        <button
          type="button"
          disabled={updating || status === "dismissed"}
          onClick={() => void onStatusChange(job.id, "dismissed")}
          className={dangerAction}
        >
          Dismiss
        </button>
        {status !== "none" && (
          <button
            type="button"
            disabled={updating}
            onClick={() => void onStatusChange(job.id, "none")}
            className={secondaryAction}
          >
            Clear
          </button>
        )}
        {updating && <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>}
      </div>
    </article>
  );
}
