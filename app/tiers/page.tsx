"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";
import { CompanyLogo } from "../components/CompanyLogo";
import { TIERS, type Tier } from "@/lib/tiers";

interface TierCompany {
  company: string;
  count: number;
  tier: string | null;
}

// Classic tier-list row colours (warm S → cool F), dark ink on each so the
// single-letter label clears 4.5:1 everywhere.
const TIER_ROW: Record<Tier, string> = {
  S: "bg-[#ff7f7f]",
  A: "bg-[#ffbf7f]",
  B: "bg-[#ffdf80]",
  C: "bg-[#ffff7f]",
  D: "bg-[#bfff7f]",
  F: "bg-[#7fbfff]",
};

const TIER_HINT: Record<Tier, string> = {
  S: "+15 fit",
  A: "+10 fit",
  B: "+5 fit",
  C: "no change",
  D: "−10 fit",
  F: "−25 fit",
};

const POOL_LIMIT = 120;

export default function TiersPage() {
  const [companies, setCompanies] = useState<TierCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragCompany, setDragCompany] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [judging, setJudging] = useState(false);
  const pendingRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ companies: TierCompany[] }>("/api/tiers");
        if (!cancelled) setCompanies(data.companies);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignTier = useCallback(
    async (company: string, tier: Tier | null) => {
      const prev = companies;
      setCompanies((cs) =>
        cs.map((c) => (c.company === company ? { ...c, tier } : c)),
      );
      setError(null);
      pendingRef.current += 1;
      try {
        await api("/api/tiers", {
          method: "PUT",
          body: JSON.stringify({ company, tier }),
        });
      } catch (e) {
        setCompanies(prev);
        setError(`Could not update ${company}: ${(e as Error).message}`);
      } finally {
        pendingRef.current -= 1;
      }
    },
    [companies],
  );

  const byTier = useMemo(() => {
    const map: Record<Tier, TierCompany[]> = { S: [], A: [], B: [], C: [], D: [], F: [] };
    for (const c of companies) {
      if (c.tier && (TIERS as readonly string[]).includes(c.tier)) {
        map[c.tier as Tier].push(c);
      }
    }
    return map;
  }, [companies]);

  const rankedCount = useMemo(
    () => companies.filter((c) => c.tier).length,
    [companies],
  );

  const unranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies
      .filter((c) => !c.tier)
      .filter((c) => (q ? c.company.toLowerCase().includes(q) : true));
  }, [companies, search]);

  const visiblePool = unranked.slice(0, POOL_LIMIT);
  const hiddenPool = unranked.length - visiblePool.length;

  async function runJudge() {
    setJudging(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ scored: number; scanned: number }>(
        "/api/judge/score",
        { method: "POST", body: JSON.stringify({}) },
      );
      setMessage(
        `Judge re-ran with your tiers: ${result.scored} scored of ${result.scanned} scanned.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJudging(false);
    }
  }

  function onDrop(tier: Tier | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const company = e.dataTransfer.getData("text/plain") || dragCompany;
      setDropTarget(null);
      setDragCompany(null);
      if (company) void assignTier(company, tier);
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
      <PageHeader
        title="Company tiers"
        subtitle="Rank employers S→F. Tiers nudge each company's fit score so preferred names float to the top of your queue."
      >
        <button className={cls.btn} onClick={runJudge} disabled={judging}>
          {judging ? "Re-running…" : "Re-run judge"}
        </button>
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
        <p className={cls.muted}>Loading companies…</p>
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
                    <span className="text-[10px] font-medium opacity-80">
                      {TIER_HINT[tier]}
                    </span>
                  </div>
                  <div
                    data-testid={`tier-row-${tier}`}
                    onDragOver={allowDrop(key)}
                    onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                    onDrop={onDrop(tier)}
                    className={`flex min-h-[64px] flex-1 flex-wrap content-start gap-2 p-2 transition-colors ${
                      active
                        ? "bg-indigo-50 dark:bg-indigo-950/40"
                        : "bg-gray-50 dark:bg-gray-900/40"
                    }`}
                  >
                    {byTier[tier].length === 0 ? (
                      <span className="self-center px-1 text-xs text-gray-400 dark:text-gray-600">
                        Drop companies here
                      </span>
                    ) : (
                      byTier[tier].map((c) => (
                        <CompanyChip
                          key={c.company}
                          company={c}
                          onTier={assignTier}
                          onDragStart={setDragCompany}
                          onDragEnd={() => setDragCompany(null)}
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
                Unranked
                <span className="ml-2 font-normal text-gray-400">
                  {rankedCount} ranked · {unranked.length} unranked
                </span>
              </h2>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                aria-label="Search unranked companies"
                data-testid="tier-search"
                className={`${cls.input} max-w-xs`}
              />
            </div>
            <div
              data-testid="tier-pool"
              onDragOver={allowDrop("pool")}
              onDragLeave={() => setDropTarget((t) => (t === "pool" ? null : t))}
              onDrop={onDrop(null)}
              className={`flex flex-wrap content-start gap-2 rounded-xl border border-gray-200 p-3 transition-colors dark:border-gray-800 ${
                dropTarget === "pool"
                  ? "bg-indigo-50 dark:bg-indigo-950/40"
                  : "bg-white dark:bg-gray-900"
              }`}
            >
              {visiblePool.length === 0 ? (
                <span className="px-1 py-4 text-sm text-gray-400">
                  {companies.length === 0
                    ? "No companies discovered yet."
                    : "No unranked companies match your search."}
                </span>
              ) : (
                visiblePool.map((c) => (
                  <CompanyChip
                    key={c.company}
                    company={c}
                    onTier={assignTier}
                    onDragStart={setDragCompany}
                    onDragEnd={() => setDragCompany(null)}
                  />
                ))
              )}
            </div>
            {hiddenPool > 0 && (
              <p className={cls.muted}>
                Showing {visiblePool.length} of {unranked.length}. Search to narrow the
                remaining {hiddenPool}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CompanyChip({
  company,
  onTier,
  onDragStart,
  onDragEnd,
}: {
  company: TierCompany;
  onTier: (company: string, tier: Tier | null) => void;
  onDragStart: (company: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      data-testid="tier-chip"
      data-company={company.company}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", company.company);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(company.company);
      }}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1 pl-1.5 pr-1 shadow-sm active:cursor-grabbing dark:border-gray-700 dark:bg-gray-800"
      title={`${company.company} · ${company.count} open role${company.count === 1 ? "" : "s"}`}
    >
      <CompanyLogo company={company.company} size={20} />
      <span className="max-w-[9rem] truncate text-xs font-medium text-gray-800 dark:text-gray-100">
        {company.company}
      </span>
      <span className="text-[10px] tabular-nums text-gray-400">{company.count}</span>
      <select
        value={company.tier ?? ""}
        onChange={(e) => onTier(company.company, (e.target.value || null) as Tier | null)}
        aria-label={`Tier for ${company.company}`}
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
