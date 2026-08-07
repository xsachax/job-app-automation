import { prisma } from "../db";
import { canonicalCompanyName } from "../company-names";
import { getAdapter } from "./registry";
import { canonicalize } from "./normalize";
import { scoreJob, type Criteria } from "../matching/score";
import { getCriteria } from "../settings";

export interface RunResult {
  sourceId: string;
  sourceName?: string;
  fetched: number; // items returned by adapter
  created: number; // new canonical jobs
  updated: number; // existing jobs seen again (deduped)
  workday: number; // flagged, not matched
  skipped: number; // excluded by criteria
  error?: string;
}

// Statuses that represent human/pipeline progress we must not overwrite on rescan.
const PROGRESSED = new Set(["drafted", "pending_approval", "submitted", "rejected"]);

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "null";
  }
}

/**
 * Fetch one source, then ingest with full dedup + scoring.
 *
 * Dedup layers:
 *  - jobs.dedupeKey UNIQUE (atsType:externalId, else company|title|location hash)
 *    => re-scans and cross-source overlaps collapse into one Job (upsert).
 *  - job_sightings UNIQUE (jobId, sourceId) => one sighting row per source.
 *
 * Errors from the adapter/network are captured on the result (not thrown) so a
 * batch scan can continue past a single failing source.
 */
export async function runSource(sourceId: string, criteria?: Criteria): Promise<RunResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`source ${sourceId} not found`);
  const adapter = getAdapter(source.kind);
  if (!adapter) throw new Error(`unknown source kind: ${source.kind}`);

  const crit = criteria ?? (await getCriteria());
  const config = safeParse(source.config);
  const result: RunResult = {
    sourceId,
    sourceName: source.name,
    fetched: 0,
    created: 0,
    updated: 0,
    workday: 0,
    skipped: 0,
  };

  try {
    const jobs = await adapter.fetch(config);
    result.fetched = jobs.length;

    for (const n of jobs) {
      if (!n.applyUrl || !n.title) continue;
      const normalized = {
        ...n,
        company: canonicalCompanyName(n.company),
      };
      const c = canonicalize(normalized);
      const isWorkday = c.atsType === "workday";

      const existing = await prisma.job.findUnique({ where: { dedupeKey: c.dedupeKey } });
      const base = {
        atsType: c.atsType,
        externalId: c.externalId,
        title: normalized.title,
        company: normalized.company,
        location: normalized.location ?? null,
        remote: Boolean(normalized.remote),
        applyUrl: c.applyUrl,
        description: normalized.description ?? null,
        postedAt: normalized.postedAt ?? null,
        isWorkday,
        fingerprint: c.fingerprint,
        lastSeenAt: new Date(),
      };

      const job = existing
        ? await prisma.job.update({ where: { id: existing.id }, data: base })
        : await prisma.job.create({
            data: { dedupeKey: c.dedupeKey, ...base, raw: safeStringify(n.raw ?? n) },
          });
      if (existing) result.updated++;
      else result.created++;

      // Record the per-source sighting (deduped by unique (jobId, sourceId)).
      await prisma.jobSighting.upsert({
        where: { jobId_sourceId: { jobId: job.id, sourceId: source.id } },
        update: { seenAt: new Date() },
        create: { jobId: job.id, sourceId: source.id },
      });

      if (isWorkday) {
        result.workday++;
        continue; // Workday: flag only, never create a match / auto-apply.
      }

      const s = scoreJob(
        { title: job.title, description: job.description, location: job.location, remote: job.remote },
        crit,
      );
      const existingMatch = await prisma.match.findUnique({ where: { jobId: job.id } });
      let status = s.excluded ? "skipped" : "new";
      if (existingMatch && PROGRESSED.has(existingMatch.status)) status = existingMatch.status;

      await prisma.match.upsert({
        where: { jobId: job.id },
        update: { score: s.score, reasons: JSON.stringify(s.reasons), status },
        create: { jobId: job.id, score: s.score, reasons: JSON.stringify(s.reasons), status },
      });
      if (s.excluded) result.skipped++;
    }

    const msg =
      `${result.created} new, ${result.updated} seen again` +
      (result.workday ? `, ${result.workday} Workday flagged` : "");
    await prisma.source.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastStatus: "ok", lastMessage: msg, lastJobCount: result.created },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    await prisma.source
      .update({
        where: { id: source.id },
        data: { lastRunAt: new Date(), lastStatus: "error", lastMessage: msg },
      })
      .catch(() => {});
  }

  return result;
}
