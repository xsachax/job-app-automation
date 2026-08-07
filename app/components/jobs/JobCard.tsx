"use client";

import type { MouseEvent } from "react";
import { CompanyLogo } from "../CompanyLogo";
import {
  AppliedBadge,
  CategoryBadge,
  CountryFlag,
  SalaryText,
  SponsorshipBadge,
} from "../ui";
import { ConnectionsBadge } from "../ConnectionsBadge";
import type { ApplicationStatus, Job } from "./types";
import { splitJudgeAdvice } from "@/lib/judge/advice";
import { bucketScore, type FitBand } from "@/lib/judge/status";

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

type FitTone = {
  label: string;
  card: string;
  score: string;
  badge: string;
};

const FIT_TONES: Record<FitBand | "unscored", FitTone> = {
  strong: {
    label: "Strong fit",
    card:
      "border-emerald-300 bg-emerald-50/60 shadow-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/25 dark:shadow-none",
    score:
      "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-100",
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  },
  possible: {
    label: "Possible fit",
    card:
      "border-amber-300 bg-amber-50/50 shadow-amber-100/70 dark:border-amber-800 dark:bg-amber-950/20 dark:shadow-none",
    score:
      "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900/70 dark:text-amber-100",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  },
  weak: {
    label: "Weak fit",
    card:
      "border-rose-200 bg-rose-50/35 dark:border-rose-900 dark:bg-rose-950/15",
    score:
      "border-rose-200 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-100",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-100",
  },
  unscored: {
    label: "Not scored",
    card: "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
    score:
      "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  },
};

function fitTone(score: number | null | undefined): FitTone {
  return FIT_TONES[bucketScore(score)];
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

function cardTone(status: ApplicationStatus, isNew: boolean, tone: FitTone): string {
  if (status === "dismissed") {
    return "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-950";
  }
  const statusTone =
    status === "applied"
      ? "ring-1 ring-green-400 dark:ring-green-700"
      : isNew
        ? "shadow-md"
        : "";
  return `${tone.card} ${statusTone}`;
}

function JudgeScore({
  score,
  provider,
  tone,
}: {
  score: number | null;
  provider: Job["fitProvider"];
  tone: FitTone;
}) {
  const providerLabel =
    score == null ? "Run judge" : provider === "agent" ? "Agent" : "Baseline";
  return (
    <div
      aria-label={
        score == null ? "Judge score not available" : `Judge score ${score} out of 100`
      }
      data-testid="judge-score"
      className={`flex w-[72px] shrink-0 flex-col items-center rounded-lg border px-1.5 py-2 text-center ${tone.score}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-70">
        Judge
      </span>
      <span className="mt-0.5 leading-none">
        <span className="text-2xl font-black tabular-nums">{score ?? "--"}</span>
        {score != null && <span className="text-[10px] font-semibold opacity-65">/100</span>}
      </span>
      <span className="mt-1 text-[10px] font-bold leading-3">{tone.label}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide opacity-60">
        {providerLabel}
      </span>
    </div>
  );
}

function AdviceList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: "fit" | "gap";
}) {
  const visible = items.slice(0, 3);
  const hidden = items.slice(visible.length);
  const dot =
    tone === "fit" ? "bg-emerald-500" : "bg-rose-500";
  const item = (value: string) => (
    <li key={value} className="flex gap-1.5">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
      />
      <span>{value}</span>
    </li>
  );
  return (
    <section
      aria-label={title}
      className="rounded-md border border-white/80 bg-white/70 px-2.5 py-2 dark:border-gray-700/80 dark:bg-gray-950/35"
    >
      <h4
        className={`text-[10px] font-bold uppercase tracking-wide ${
          tone === "fit"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-700 dark:text-rose-300"
        }`}
      >
        {title}
      </h4>
      <ul className="mt-1 space-y-1 text-xs leading-4 text-gray-700 dark:text-gray-200">
        {visible.length ? (
          visible.map(item)
        ) : (
          <li className="text-gray-500 dark:text-gray-400">{empty}</li>
        )}
      </ul>
      {hidden.length > 0 && (
        <details className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
          <summary className="cursor-pointer text-[10px] font-semibold">
            Show {hidden.length} more signal{hidden.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-1 leading-4">{hidden.map(item)}</ul>
        </details>
      )}
    </section>
  );
}

function FitAdvice({ job, tone }: { job: Job; tone: FitTone }) {
  if (job.fitScore == null) return null;
  const advice = splitJudgeAdvice(job.fitReasons, job.fitSummary);
  return (
    <div
      data-testid="fit-advice"
      className="mt-2 rounded-lg border border-black/5 bg-white/45 p-2 dark:border-white/10 dark:bg-black/10"
    >
      <p className="text-xs leading-4 text-gray-700 dark:text-gray-200">
        <span
          className={`mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}
        >
          {tone.label}
        </span>
        {" "}
        {advice.summary}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <AdviceList
          title="Why it fits"
          items={advice.fits}
          empty="No strong résumé evidence identified yet."
          tone="fit"
        />
        <AdviceList
          title="Gaps"
          items={advice.gaps}
          empty="No specific gaps identified yet."
          tone="gap"
        />
      </div>
    </div>
  );
}

interface JobCardProps {
  job: Job;
  updating: boolean;
  onStatusChange: (jobId: string, status: ApplicationStatus) => Promise<void>;
  selected?: boolean;
  onToggleSelect?: (jobId: string) => void;
  /** Overrides the primary open-in-new-tab label. Defaults to Workday-aware text. */
  openLabel?: string;
  onOpen?: (job: Job) => Promise<void> | void;
}

export function JobCard({
  job,
  updating,
  onStatusChange,
  selected = false,
  onToggleSelect,
  openLabel,
  onOpen,
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
  const yoeText =
    job.minYoE == null ? null : job.minYoE === 0 ? "No exp. req." : `${job.minYoE}+ yrs`;
  const employmentText = job.employmentType
    ? employmentLabels[job.employmentType] ?? titleize(job.employmentType)
    : null;

  function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !onOpen ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    void onOpen(job);
  }

  return (
    <article
      className={`rounded-lg border px-3 py-2.5 shadow-sm transition-colors ${cardTone(status, isNew, tone)} ${
        selected ? "ring-2 ring-indigo-500 dark:ring-indigo-400" : ""
      } ${isStale && status !== "dismissed" ? "opacity-80" : ""}`}
    >
      <div className="flex flex-wrap gap-2.5">
        <JudgeScore score={job.fitScore} provider={job.fitProvider} tone={tone} />
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
        <div className="hidden sm:block">
          <CompanyLogo company={job.company} size={40} />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <CountryFlag country={job.country} />
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleOpen}
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
                  <ConnectionsBadge
                    company={job.company}
                    count={job.connections.count}
                    contacts={job.connections.contacts}
                  />
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

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 [&>*]:whitespace-nowrap">
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

        </div>

        <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-col sm:items-end">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            onClick={handleOpen}
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
        <div className="basis-full">
          <FitAdvice job={job} tone={tone} />
        </div>
      </div>
    </article>
  );
}
