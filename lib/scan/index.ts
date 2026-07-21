import { prisma } from "../db";
import { runSource, type RunResult } from "../sources/run";
import { getCriteria } from "../settings";
import { rescoreResumeFit } from "../matching/agent";

export interface ScanSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: RunResult[];
  totals: {
    sources: number;
    fetched: number;
    created: number;
    updated: number;
    workday: number;
    skipped: number;
    errors: number;
    resumeScored: number;
  };
}

// Run every enabled source through the dedup + scoring pipeline.
export async function runScan(): Promise<ScanSummary> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const criteria = await getCriteria();
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const results: RunResult[] = [];
  for (const s of sources) {
    results.push(await runSource(s.id, criteria));
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.fetched += r.fetched;
      acc.created += r.created;
      acc.updated += r.updated;
      acc.workday += r.workday;
      acc.skipped += r.skipped;
      if (r.error) acc.errors += 1;
      return acc;
    },
    { sources: results.length, fetched: 0, created: 0, updated: 0, workday: 0, skipped: 0, errors: 0, resumeScored: 0 },
  );

  // Tier-2 baseline: give every active match a resume-aware fit score. Agent
  // scores at the current resume version are preserved by this pass.
  try {
    const rescore = await rescoreResumeFit();
    totals.resumeScored = rescore.scored;
  } catch {
    // resume scoring is best-effort; never fail a scan over it
  }

  const finished = Date.now();
  return {
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - start,
    sources: results,
    totals,
  };
}
