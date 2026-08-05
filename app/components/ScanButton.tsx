"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { cls } from "./ui";

interface ScanTotals {
  sources: number;
  created: number;
  updated: number;
  usEntry: number;
  caEntry: number;
  errors: number;
}

interface DiscoveryRefresh {
  totals: ScanTotals;
  durationMs: number;
  api: {
    companies: Array<{ company: string; error?: string }>;
  };
  browser: Array<{ company: string; error?: string }>;
  judge: {
    scored: number;
  };
}

interface Notice {
  tone: "success" | "warning" | "error";
  text: string;
}

export function ScanButton() {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setNotice(null);
    try {
      const result = await api<DiscoveryRefresh>("/api/discovery/run", {
        method: "POST",
      });
      const totals = result.totals;
      const duration = Math.round(result.durationMs / 1000);
      const failedSources = [...result.api.companies, ...result.browser]
        .filter((source) => source.error)
        .map((source) => source.company);
      const failureSummary = failedSources.length
        ? ` · failed: ${failedSources.join(", ")}`
        : "";
      setNotice({
        tone: totals.errors ? "warning" : "success",
        text:
          `Scraped ${totals.sources} sources: ${totals.created} new, ${totals.updated} refreshed, ` +
          `${result.judge.scored} newly scored in ${duration}s` +
          failureSummary,
      });
      router.refresh();
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const noticeClass =
    notice?.tone === "error"
      ? "text-red-600 dark:text-red-400"
      : notice?.tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : "text-green-700 dark:text-green-300";

  return (
    <div className="flex max-w-2xl flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className={cls.btnPrimary}
        aria-busy={loading}
      >
        {loading ? "Scraping… this may take a few minutes" : "Run scrape"}
      </button>
      {notice && (
        <p className={`text-right text-sm ${noticeClass}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}
    </div>
  );
}
