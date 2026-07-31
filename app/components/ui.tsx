import type { ReactNode } from "react";
import { CATEGORY_LABELS, type JobCategory } from "@/lib/discovery/categories";

export const cls = {
  card:
    "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900",
  cardTight:
    "rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900",
  btnPrimary:
    "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50",
  btn:
    "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700",
  btnDanger:
    "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-gray-800 dark:hover:bg-red-950",
  btnGreen:
    "rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50",
  input:
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500",
  label: "block text-sm font-medium text-gray-700 dark:text-gray-300",
  chip:
    "inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  muted: "text-gray-500 dark:text-gray-400",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  drafted: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  submitted: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.new;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
      : score >= 40
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return (
    <span className={`inline-block w-9 rounded-md text-center text-xs font-semibold ${color} py-1`}>
      {score}
    </span>
  );
}

// Resume-fit badge from the post-scrape judge. `provider` distinguishes the
// deterministic baseline ("auto") from a Copilot agent judgement ("agent").
export function FitBadge({
  score,
  provider,
}: {
  score: number | null | undefined;
  provider?: string | null;
}) {
  if (score == null) return null;
  const color =
    score >= 70
      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      : score >= 40
        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  const tag = provider === "agent" ? "agent" : "auto";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold ${color}`}
      title={provider === "agent" ? "Scored by Copilot agent" : "Deterministic baseline score"}
    >
      fit {score}
      <span className="rounded bg-white/60 px-1 text-[10px] font-medium uppercase tracking-wide dark:bg-black/30">
        {tag}
      </span>
    </span>
  );
}

// User pipeline status for a discovered job (none | saved | applied | ...).
const APPLIED_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  saved: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  applied: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  interviewing: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  dismissed: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

export function AppliedBadge({ status }: { status: string }) {
  if (!status || status === "none") return null;
  const color = APPLIED_COLORS[status] ?? APPLIED_COLORS.none;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

// Company-category chip (Big Tech / AI Lab / Quant / Startup / Other). Each
// bucket gets a distinct hue so a card's kind is legible at a glance; colors are
// contrast-checked for both themes.
const CATEGORY_COLORS: Record<JobCategory, string> = {
  bigtech: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ai: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  quant: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  startup: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function CategoryBadge({ category }: { category: JobCategory | null | undefined }) {
  if (!category) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// "Warm intro" badge — the user has 1+ LinkedIn connections at this company
// (imported from their Connections.csv). The tooltip lists who, so they know who
// to ask for a referral. Teal is reserved for this signal so it stands out.
export function ConnectionsBadge({
  count,
  contacts,
}: {
  count: number;
  contacts: { name: string; position: string; url?: string }[];
}) {
  if (!count) return null;
  const tooltip = contacts
    .map((c) => (c.position ? `${c.name} — ${c.position}` : c.name))
    .join("\n");
  const more = count - contacts.length;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200"
      title={more > 0 ? `${tooltip}\n+${more} more` : tooltip}
    >
      <span aria-hidden>🤝</span>
      {count} {count === 1 ? "connection" : "connections"}
    </span>
  );
}

// Visa-sponsorship badge derived from enrichment. Always renders so every card
// states a sponsorship status; anything we couldn't determine (or a legacy row
// with no value) falls back to a muted "unknown" tag rather than showing nothing.
const SPONSOR_LABEL: Record<string, { text: string; color: string }> = {
  offers: {
    text: "sponsors visa",
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  none: {
    text: "no sponsorship",
    color: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
  },
  citizenship: {
    text: "citizenship req.",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  unknown: {
    text: "sponsorship unknown",
    color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
};

export function SponsorshipBadge({ value }: { value: string | null | undefined }) {
  const key = value && SPONSOR_LABEL[value] ? value : "unknown";
  const { text, color } = SPONSOR_LABEL[key];
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color}`}
      title={
        key === "unknown"
          ? "Visa sponsorship not stated in this posting"
          : `Visa sponsorship: ${text}`
      }
    >
      {text}
    </span>
  );
}

// Country flag chip (🇺🇸 / 🇨🇦) — a quick geography anchor on each card. Rendered
// as an emoji so it stays crisp at any size and matches the app's emoji accents;
// non-US/CA (or missing) countries render nothing.
const COUNTRY_FLAG: Record<string, { flag: string; label: string }> = {
  US: { flag: "🇺🇸", label: "United States" },
  CA: { flag: "🇨🇦", label: "Canada" },
};

export function CountryFlag({ country }: { country: string | null | undefined }) {
  const entry = country ? COUNTRY_FLAG[country.toUpperCase()] : undefined;
  if (!entry) return null;
  return (
    <span
      role="img"
      aria-label={entry.label}
      title={entry.label}
      className="text-sm leading-none"
    >
      {entry.flag}
    </span>
  );
}

function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

// Compact salary display: "$120k–150k" from normalized min/max, else the raw
// string the source provided.
export function SalaryText({
  min,
  max,
  currency,
  raw,
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency?: string | null;
  raw?: string | null;
}) {
  const sym = currency === "CAD" ? "C$" : "$";
  let text: string | null = null;
  if (min && max) text = `${sym}${fmtK(min)}–${fmtK(max)}`;
  else if (min) text = `${sym}${fmtK(min)}+`;
  else if (raw) text = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
  if (!text) return null;
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {text}
    </span>
  );
}

export function SkillChips({ skills, limit = 8 }: { skills: string[]; limit?: number }) {
  if (!skills?.length) return null;
  const shown = skills.slice(0, limit);
  const extra = skills.length - shown.length;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className={cls.chip}>
          {s}
        </span>
      ))}
      {extra > 0 && <span className={cls.chip}>+{extra}</span>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
