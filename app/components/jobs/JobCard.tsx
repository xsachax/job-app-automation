"use client";

import { useState } from "react";

import { CompanyLogo } from "../CompanyLogo";
import {
  AppliedBadge,
  CategoryBadge,
  cls,
  ConnectionsBadge,
  CountryFlag,
  FitBadge,
  SalaryText,
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

type FitTone = { label: string; banner: string };

// Fit tier → banner styling. Thresholds mirror the judge + FitBadge (>=70 / >=40).
function fitTone(score: number | null | undefined): FitTone | null {
  if (score == null) return null;
  if (score >= 70)
    return {
      label: "Strong fit",
      banner: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    };
  if (score >= 40)
    return {
      label: "Possible fit",
      banner: "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    };
  return {
    label: "Weak fit",
    banner: "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  };
}

// The color + label now carry the tier, so drop a redundant "Strong/Possible/Weak fit:" lead-in.
function fitReasonText(summary: string | null): string {
  if (!summary) return "";
  return summary
    .replace(/^\s*(strong|possible|good|great|moderate|partial|weak|poor|low)\s+fit\s*[:.\-–—]?\s*/i, "")
    .trim();
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
  selected?: boolean;
  onToggleSelect?: (jobId: string) => void;
  /** Overrides the primary open-in-new-tab label. Defaults to Workday-aware text. */
  openLabel?: string;
}

export function JobCard({
  job,
  updating,
  onStatusChange,
  selected = false,
  onToggleSelect,
  openLabel,
}: JobCardProps) {
  const status = job.applicationStatus || "none";
  const resolvedOpenLabel = openLabel ?? (job.isWorkday ? "Open on Workday ↗" : "Open ↗");
  const effectivePostedAt = job.postedAt ?? job.firstSeenAt;
  const isNew = isWithinHours(effectivePostedAt, 48);
  const isStale = isOlderThanDays(effectivePostedAt, 30);
  const sources = uniqueSourceNames(job);
  const sourceLabel = job.discoverySystem ?? job.atsType;
  const metaParts = [job.location, job.remote ? "remote" : null, titleize(sourceLabel)].filter(
    Boolean,
  ) as string[];
  const timingText = `${job.postedAt ? "Posted" : "First seen"} ${timeAgo(effectivePostedAt)} · last seen ${timeAgo(job.lastSeenAt)}${
    status === "applied" && job.appliedAt ? ` · applied ${timeAgo(job.appliedAt)}` : ""
  }`;
  const seenOn = sources.length > 0 ? `seen on ${sources.join(", ")}` : "";
  const subtitleFull = [job.company, ...metaParts, timingText, seenOn].filter(Boolean).join(" · ");
  const tone = fitTone(job.fitScore);
  const fitReason = fitReasonText(job.fitSummary);
  const yoeText =
    job.minYoE == null ? null : job.minYoE === 0 ? "No exp. req." : `${job.minYoE}+ yrs`;
  const employmentText = job.employmentType
    ? employmentLabels[job.employmentType] ?? titleize(job.employmentType)
    : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`rounded-lg border px-3 py-2.5 shadow-sm transition-colors ${cardTone(status, isNew)} ${
        selected ? "ring-2 ring-indigo-500 dark:ring-indigo-400" : ""
      } ${isStale && status !== "dismissed" ? "opacity-80" : ""}`}
    >
      <div className="flex gap-2.5">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(job.id)}
            aria-label={`Select ${job.title}`}
            data-testid="job-select"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
          />
        )}
        <CompanyLogo company={job.company} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <CountryFlag country={job.country} />
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="job-title"
                  className="text-sm font-semibold leading-5 text-gray-950 hover:text-indigo-600 hover:underline dark:text-gray-100 dark:hover:text-indigo-300"
                >
                  {job.title}
                </a>
                <CategoryBadge category={job.category} />
                {job.isWorkday && (
                  <span
                    data-testid="workday-badge"
                    title="Workday posting — apply manually. The pipeline never auto-applies to these."
                    className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  >
                    Workday
                  </span>
                )}
                {job.connections && job.connections.count > 0 && (
                  <ConnectionsBadge count={job.connections.count} contacts={job.connections.contacts} />
                )}
                {isNew && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                    NEW
                  </span>
                )}
                {isStale && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    stale
                  </span>
                )}
                <AppliedBadge status={status} />
                <FitBadge score={job.fitScore} provider={job.fitProvider} />
              </div>
              <p
                className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300"
                title={subtitleFull}
              >
                <span className="font-medium text-gray-800 dark:text-gray-100">{job.company}</span>
                {metaParts.map((part) => ` · ${part}`).join("")}
                <span className="text-gray-400 dark:text-gray-500">
                  {` · ${timingText}`}
                  {seenOn ? ` · ${seenOn}` : ""}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-2 items-center justify-items-start gap-x-3 gap-y-1 lg:grid-cols-4 [&>*]:whitespace-nowrap">
            <SalaryText
              min={job.salaryMin}
              max={job.salaryMax}
              currency={job.salaryCurrency}
              raw={job.salaryRaw}
              fallback="Salary unknown"
            />
            <SponsorshipBadge value={job.sponsorship} />
            {employmentText ? (
              <span className={neutralPill}>{employmentText}</span>
            ) : (
              <span className="inline-block px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-500">
                Type unknown
              </span>
            )}
            {yoeText ? (
              <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {yoeText}
              </span>
            ) : (
              <span className="inline-block px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-500">
                Exp. unknown
              </span>
            )}
          </div>

          {tone && (
            <p
              className={`mt-1.5 flex items-center gap-1 rounded-md px-2 py-1 text-xs ${tone.banner}`}
              title={job.fitSummary ?? undefined}
            >
              <span className="shrink-0 font-semibold">{tone.label}</span>
              {fitReason && (
                <span className="min-w-0 truncate font-normal">— {fitReason}</span>
              )}
            </p>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            data-testid="job-expand"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
            {expanded ? "Less" : "Details"}
          </button>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            className={primaryAction}
          >
            {resolvedOpenLabel}
          </a>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
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
          </div>
          {updating && <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>}
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-2.5 text-xs dark:border-gray-800 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Skills</div>
            {job.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {job.skills.map((s) => (
                  <span key={s} className={cls.chip}>
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">None listed</span>
            )}
          </div>

          {job.fitReasons?.length > 0 && (
            <div className="min-w-0">
              <div className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Why this fit</div>
              <ul className="list-disc space-y-0.5 pl-4 text-gray-600 dark:text-gray-300">
                {job.fitReasons.slice(0, 4).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="min-w-0">
            <div className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Posting</div>
            <dl className="space-y-0.5 text-gray-600 dark:text-gray-300">
              {job.location && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-gray-400 dark:text-gray-500">Location</dt>
                  <dd className="min-w-0 truncate">{job.location}</dd>
                </div>
              )}
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-gray-400 dark:text-gray-500">Platform</dt>
                <dd className="min-w-0 truncate">{titleize(job.discoverySystem ?? job.atsType)}</dd>
              </div>
              {sources.length > 0 && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-gray-400 dark:text-gray-500">Seen on</dt>
                  <dd className="min-w-0 truncate">{sources.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </article>
  );
}
