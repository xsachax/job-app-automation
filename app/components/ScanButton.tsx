"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { cls } from "./ui";

interface ScanTotals {
  sources: number;
  created: number;
  updated: number;
  workday: number;
  skipped: number;
  errors: number;
}

export function ScanButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const s = await api<{ totals: ScanTotals; durationMs: number }>("/api/scan", {
        method: "POST",
      });
      const t = s.totals;
      setMsg(
        `Scanned ${t.sources} source(s): ${t.created} new, ${t.updated} deduped, ${t.workday} Workday flagged` +
          (t.errors ? `, ${t.errors} error(s)` : "") +
          ` (${Math.round(s.durationMs / 100) / 10}s)`,
      );
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={loading} className={cls.btnPrimary}>
        {loading ? "Scanning…" : "Run scan now"}
      </button>
      {msg && <span className="text-sm text-gray-600">{msg}</span>}
    </div>
  );
}
