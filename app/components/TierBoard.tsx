"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { cls, PageHeader } from "./ui";
import { TIERS, type Tier } from "@/lib/tiers";
import {
  useTierPersistence,
  type TierItem,
  type TierSaveStatus,
} from "./useTierPersistence";

export type { TierItem } from "./useTierPersistence";

// Classic tier-list row colours (warm S → cool F), dark ink on each so the
// single-letter label clears 4.5:1 everywhere.
const TIER_ROW: Record<Tier, string> = {
  S: "bg-[#ff7f7f]",
  A: "bg-[#ffbf7f]",
  B: "bg-[#ffdf80]",
  C: "bg-[#ffff7f]",
  D: "bg-[#bfff7f]",
  E: "bg-[#7fffff]",
  F: "bg-[#7fbfff]",
};

const TIER_HINT: Record<Tier, string> = {
  S: "+25 fit",
  A: "+20 fit",
  B: "+15 fit",
  C: "+10 fit",
  D: "+5 fit",
  E: "no change",
  F: "−25 fit",
};

const POOL_LIMIT = 120;

const SAVE_STATUS_LABEL: Record<TierSaveStatus, string> = {
  idle: "Loading saved tiers…",
  pending: "Changes queued",
  saving: "Saving tiers…",
  saved: "All tiers saved",
  error: "Unsaved tier changes",
};

function saveStatusLabel(status: TierSaveStatus): string {
  return SAVE_STATUS_LABEL[status];
}

function saveStatusClass(status: TierSaveStatus): string {
  const color =
    status === "error"
      ? "text-red-600 dark:text-red-400"
      : status === "saved"
        ? "text-green-600 dark:text-green-400"
        : "text-gray-500 dark:text-gray-400";
  return `text-xs font-medium ${color}`;
}

interface TierBoardProps {
  title: string;
  subtitle: string;
  /** GET (list) + PUT (assign/clear) endpoint. */
  endpoint: string;
  /** Response array key, e.g. "companies" | "locations". */
  itemsKey: string;
  /** PUT body field + response field naming the item, e.g. "company" | "location". */
  field: string;
  /** Rendered before the label inside each chip (logo, pin, …). */
  renderIcon?: (item: TierItem) => ReactNode;
  /** Noun used in counts/empty copy, e.g. "companies" | "locations". */
  noun: string;
  emptyPool: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  countLabel: (count: number) => string;
  /** Optional note shown beside the Unranked heading (e.g. an unranked penalty). */
  poolNote?: ReactNode;
}

export function TierBoard({
  title,
  subtitle,
  endpoint,
  itemsKey,
  field,
  renderIcon,
  noun,
  emptyPool,
  searchPlaceholder,
  searchAriaLabel,
  countLabel,
  poolNote,
}: TierBoardProps) {
  const {
    items,
    loading,
    saveStatus,
    persistenceError,
    assignTier,
    retrySaves,
    saveNow,
  } = useTierPersistence({ endpoint, itemsKey, field });
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [judging, setJudging] = useState(false);
  const error = persistenceError ?? actionError;

  const byTier = useMemo(() => {
    const map = Object.fromEntries(TIERS.map((t) => [t, [] as TierItem[]])) as Record<
      Tier,
      TierItem[]
    >;
    for (const c of items) {
      if (c.tier && (TIERS as readonly string[]).includes(c.tier)) {
        map[c.tier as Tier].push(c);
      }
    }
    return map;
  }, [items]);

  const rankedCount = useMemo(() => items.filter((c) => c.tier).length, [items]);

  const unranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((c) => !c.tier)
      .filter((c) => (q ? c.key.toLowerCase().includes(q) : true));
  }, [items, search]);

  const visiblePool = unranked.slice(0, POOL_LIMIT);
  const hiddenPool = unranked.length - visiblePool.length;

  async function runJudge() {
    setJudging(true);
    setActionError(null);
    setMessage(null);
    try {
      await saveNow();
      const result = await api<{ scored: number; scanned: number }>("/api/judge/score", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        `Judge re-ran with your tiers: ${result.scored} scored of ${result.scanned} scanned.`,
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setJudging(false);
    }
  }

  function onDrop(tier: Tier | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const key = e.dataTransfer.getData("text/plain") || dragKey;
      setDropTarget(null);
      setDragKey(null);
      if (key) void assignTier(key, tier);
    };
  }

  function allowDrop(key: string) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (dropTarget !== key) setDropTarget(key);
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            data-testid="tier-save-status"
            className={saveStatusClass(saveStatus)}
          >
            {saveStatusLabel(saveStatus)}
          </span>
          {saveStatus === "error" && (
            <button
              className={cls.btn}
              onClick={() => void retrySaves()}
            >
              Retry saves
            </button>
          )}
          <button className={cls.btn} onClick={runJudge} disabled={judging}>
            {judging ? "Re-running…" : "Re-run judge"}
          </button>
        </div>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {message}
        </div>
      )}

      {loading ? (
        <p className={cls.muted}>Loading {noun}…</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            {TIERS.map((tier) => {
              const key = `tier-${tier}`;
              const active = dropTarget === key;
              return (
                <div
                  key={tier}
                  className="flex items-stretch border-b border-gray-200 last:border-b-0 dark:border-gray-800"
                >
                  <div
                    className={`flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 ${TIER_ROW[tier]} px-2 py-3 text-gray-900`}
                  >
                    <span className="text-2xl font-black leading-none">{tier}</span>
                    <span className="text-[10px] font-medium opacity-80">{TIER_HINT[tier]}</span>
                  </div>
                  <div
                    data-testid={`tier-row-${tier}`}
                    onDragOver={allowDrop(key)}
                    onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                    onDrop={onDrop(tier)}
                    className={`flex min-h-[64px] flex-1 flex-wrap content-start gap-2 p-2 transition-colors ${
                      active ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-gray-50 dark:bg-gray-900/40"
                    }`}
                  >
                    {byTier[tier].length === 0 ? (
                      <span className="self-center px-1 text-xs text-gray-400 dark:text-gray-600">
                        Drop {noun} here
                      </span>
                    ) : (
                      byTier[tier].map((c) => (
                        <TierChip
                          key={c.key}
                          item={c}
                          renderIcon={renderIcon}
                          countLabel={countLabel}
                          onTier={assignTier}
                          onDragStart={setDragKey}
                          onDragEnd={() => setDragKey(null)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Unrated
                <span className="ml-2 font-normal text-gray-400">
                  {rankedCount} rated · {unranked.length} neutral
                </span>
              </h2>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchAriaLabel}
                data-testid="tier-search"
                className={`${cls.input} max-w-xs`}
              />
            </div>
            {poolNote && (
              <p data-testid="tier-pool-note" className={cls.muted}>
                {poolNote}
              </p>
            )}
            <div
              data-testid="tier-pool"
              onDragOver={allowDrop("pool")}
              onDragLeave={() => setDropTarget((t) => (t === "pool" ? null : t))}
              onDrop={onDrop(null)}
              className={`flex flex-wrap content-start gap-2 rounded-xl border border-gray-200 p-3 transition-colors dark:border-gray-800 ${
                dropTarget === "pool" ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-white dark:bg-gray-900"
              }`}
            >
              {visiblePool.length === 0 ? (
                <span className="px-1 py-4 text-sm text-gray-400">
                  {items.length === 0 ? emptyPool : `No unrated ${noun} match your search.`}
                </span>
              ) : (
                visiblePool.map((c) => (
                  <TierChip
                    key={c.key}
                    item={c}
                    renderIcon={renderIcon}
                    countLabel={countLabel}
                    onTier={assignTier}
                    onDragStart={setDragKey}
                    onDragEnd={() => setDragKey(null)}
                  />
                ))
              )}
            </div>
            {hiddenPool > 0 && (
              <p className={cls.muted}>
                Showing {visiblePool.length} of {unranked.length}. Search to narrow the remaining{" "}
                {hiddenPool}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TierChip({
  item,
  renderIcon,
  countLabel,
  onTier,
  onDragStart,
  onDragEnd,
}: {
  item: TierItem;
  renderIcon?: (item: TierItem) => ReactNode;
  countLabel: (count: number) => string;
  onTier: (key: string, tier: Tier | null) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      data-testid="tier-chip"
      data-key={item.key}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.key);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(item.key);
      }}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1 pl-1.5 pr-1 shadow-sm active:cursor-grabbing dark:border-gray-700 dark:bg-gray-800"
      title={countLabel(item.count)}
    >
      {renderIcon?.(item)}
      <span className="max-w-[10rem] truncate text-xs font-medium text-gray-800 dark:text-gray-100">
        {item.key}
      </span>
      <span className="text-[10px] tabular-nums text-gray-400">{item.count}</span>
      <select
        value={item.tier ?? ""}
        onChange={(e) => onTier(item.key, (e.target.value || null) as Tier | null)}
        aria-label={`Tier for ${item.key}`}
        data-testid="tier-select"
        className="ml-0.5 rounded-md border border-gray-300 bg-white py-0.5 pl-1 pr-0.5 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
      >
        <option value="">—</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
