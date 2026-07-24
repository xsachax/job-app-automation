"use client";

import { cls } from "../ui";
import { CATEGORY_LABELS } from "@/lib/discovery/categories";
import type { FacetItem, FilterState, JobFacets, MultiFilterKey, SinceKey, SortKey } from "./types";

const SINCE_OPTIONS: { value: SinceKey; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "posted", label: "Newest" },
  { value: "company", label: "Company" },
  { value: "fit", label: "Best fit" },
  { value: "salary", label: "Salary" },
];

const FIT_OPTIONS = [40, 60, 70, 80, 90];

const SPONSORSHIP_LABELS: Record<string, string> = {
  offers: "Sponsors visa",
  none: "No sponsorship",
  citizenship: "Citizenship req.",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  fulltime: "Full-time",
  intern: "Internship",
  contract: "Contract",
};

const STATUS_LABELS: Record<string, string> = {
  none: "No status",
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  dismissed: "Dismissed",
};

interface FilterBarProps {
  facets: JobFacets | null;
  facetsLoading: boolean;
  facetsError: string | null;
  filters: FilterState;
  searchDraft: string;
  onFiltersChange: (patch: Partial<FilterState>) => void;
  onSearchDraftChange: (value: string) => void;
  onToggleValue: (key: MultiFilterKey, value: string) => void;
  onClear: () => void;
}

function titleize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFacetLabel(filterKey: MultiFilterKey, value: string): string {
  if (filterKey === "sponsorship") return SPONSORSHIP_LABELS[value] ?? titleize(value);
  if (filterKey === "employmentType") return EMPLOYMENT_LABELS[value] ?? titleize(value);
  if (filterKey === "status") return STATUS_LABELS[value] ?? titleize(value);
  if (filterKey === "category") return CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ?? titleize(value);
  return titleize(value);
}

function formatMoney(value: number): string {
  return `$${Math.round(value / 1000)}k+`;
}

function salaryOptions(maxSalary: number | undefined, current: number | null): number[] {
  const cap = maxSalary && maxSalary > 0 ? Math.floor(maxSalary / 10000) * 10000 : 300000;
  const base = [60000, 80000, 100000, 120000, 140000, 160000, 180000, 200000, 250000, 300000].filter(
    (value) => value <= cap,
  );
  if (current && !base.includes(current)) base.push(current);
  return Array.from(new Set(base)).sort((a, b) => a - b);
}

function activeFilterCount(filters: FilterState): number {
  return (
    (filters.sort !== "posted" ? 1 : 0) +
    (filters.since !== "all" ? 1 : 0) +
    (filters.q.trim() ? 1 : 0) +
    filters.skills.length +
    filters.sponsorship.length +
    filters.employmentType.length +
    filters.source.length +
    filters.category.length +
    filters.status.length +
    (filters.remote ? 1 : 0) +
    (filters.salaryMin ? 1 : 0) +
    (filters.fitMin ? 1 : 0)
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{children}</span>;
}

function ChipGroup({
  label,
  hint,
  items,
  selected,
  filterKey,
  onToggleValue,
  maxVisible = 12,
}: {
  label: string;
  hint?: string;
  items: FacetItem[];
  selected: string[];
  filterKey: MultiFilterKey;
  onToggleValue: (key: MultiFilterKey, value: string) => void;
  maxVisible?: number;
}) {
  if (items.length === 0 && selected.length === 0) return null;

  const selectedSet = new Set(selected);
  const selectedItems = items.filter((item) => selectedSet.has(item.value));
  const unselectedItems = items.filter((item) => !selectedSet.has(item.value));
  const visibleItems = [...selectedItems, ...unselectedItems.slice(0, Math.max(0, maxVisible - selectedItems.length))];
  const hiddenItems = unselectedItems.slice(Math.max(0, maxVisible - selectedItems.length));

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <FilterLabel>{label}</FilterLabel>
        {hint && <span className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleItems.map((item) => {
          const isSelected = selectedSet.has(item.value);
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggleValue(filterKey, item.value)}
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-indigo-400 dark:focus:ring-offset-gray-900 " +
                (isSelected
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-indigo-800 dark:hover:bg-indigo-950 dark:hover:text-indigo-200")
              }
            >
              {formatFacetLabel(filterKey, item.value)}
              <span
                className={
                  isSelected
                    ? "text-indigo-100 dark:text-indigo-100"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {item.count}
              </span>
            </button>
          );
        })}
        {hiddenItems.length > 0 && (
          <select
            className={cls.input + " h-8 w-auto min-w-32 py-1 text-xs dark:focus:border-indigo-400"}
            value=""
            onChange={(event) => {
              if (event.target.value) onToggleValue(filterKey, event.target.value);
            }}
            aria-label={`Add ${label.toLowerCase()} filter`}
          >
            <option value="">Add {label.toLowerCase()}…</option>
            {hiddenItems.map((item) => (
              <option key={item.value} value={item.value}>
                {formatFacetLabel(filterKey, item.value)} ({item.count})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export function FilterBar({
  facets,
  facetsLoading,
  facetsError,
  filters,
  searchDraft,
  onFiltersChange,
  onSearchDraftChange,
  onToggleValue,
  onClear,
}: FilterBarProps) {
  const count = activeFilterCount(filters);
  const salaryValues = salaryOptions(facets?.maxSalary, filters.salaryMin);

  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 space-y-1">
          <FilterLabel>Search title or company</FilterLabel>
          <input
            className={cls.input + " h-9 dark:focus:border-indigo-400"}
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
            placeholder="Search title or company…"
          />
        </label>

        <label className="w-40 space-y-1">
          <FilterLabel>Date posted</FilterLabel>
          <select
            className={cls.input + " h-9 dark:focus:border-indigo-400"}
            value={filters.since}
            onChange={(event) => onFiltersChange({ since: event.target.value as SinceKey })}
          >
            {SINCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="w-36 space-y-1">
          <FilterLabel>Sort</FilterLabel>
          <select
            className={cls.input + " h-9 dark:focus:border-indigo-400"}
            value={filters.sort}
            onChange={(event) => onFiltersChange({ sort: event.target.value as SortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="w-36 space-y-1">
          <FilterLabel>Min salary</FilterLabel>
          <select
            className={cls.input + " h-9 dark:focus:border-indigo-400"}
            value={filters.salaryMin ?? ""}
            onChange={(event) => onFiltersChange({ salaryMin: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Any salary</option>
            {salaryValues.map((value) => (
              <option key={value} value={value}>
                {formatMoney(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="w-32 space-y-1">
          <FilterLabel>Min fit</FilterLabel>
          <select
            className={cls.input + " h-9 dark:focus:border-indigo-400"}
            value={filters.fitMin ?? ""}
            onChange={(event) => onFiltersChange({ fitMin: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Any fit</option>
            {FIT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}+
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          aria-pressed={filters.remote}
          onClick={() => onFiltersChange({ remote: !filters.remote })}
          className={
            "h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-indigo-400 dark:focus:ring-offset-gray-900 " +
            (filters.remote
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700")
          }
        >
          Remote only
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={count === 0}
          className={cls.btn + " h-9 disabled:cursor-not-allowed"}
        >
          Clear filters{count > 0 ? ` (${count})` : ""}
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        {facetsLoading ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Loading filters">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className="h-7 w-20 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : (
          <>
            <ChipGroup
              label="Category"
              hint="company type"
              items={facets?.categories ?? []}
              selected={filters.category}
              filterKey="category"
              onToggleValue={onToggleValue}
            />
            <ChipGroup
              label="Skills"
              hint="match all"
              items={facets?.skills ?? []}
              selected={filters.skills}
              filterKey="skills"
              maxVisible={18}
              onToggleValue={onToggleValue}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <ChipGroup
                label="Sponsorship"
                items={facets?.sponsorship ?? []}
                selected={filters.sponsorship}
                filterKey="sponsorship"
                onToggleValue={onToggleValue}
              />
              <ChipGroup
                label="Employment"
                items={facets?.employmentType ?? []}
                selected={filters.employmentType}
                filterKey="employmentType"
                onToggleValue={onToggleValue}
              />
              <ChipGroup
                label="Source"
                items={facets?.sources ?? []}
                selected={filters.source}
                filterKey="source"
                maxVisible={10}
                onToggleValue={onToggleValue}
              />
              <ChipGroup
                label="Status"
                items={facets?.statuses ?? []}
                selected={filters.status}
                filterKey="status"
                onToggleValue={onToggleValue}
              />
            </div>
          </>
        )}
      </div>

      {facetsError && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Facet filters are unavailable: {facetsError}
        </p>
      )}
    </section>
  );
}
