import { prisma } from "../db";
import { createHash } from "node:crypto";
import { fetchCompanyPostings, type DiscoveryPosting } from "./adapters";
import { classifyEntryLevel } from "./entryLevel";
import { API_COMPANIES, type ApiCompany } from "./companies";
import { detectAts, normalizeUrl } from "../sources/normalize";

// The discovery runner: fetch each API company's public endpoint, keep only
// US / Canada entry-level software roles, and upsert them into the Job table
// (deduped by system + external id). No matching / scoring / applying happens
// here — this is pure discovery.

export interface CompanyRunResult {
  company: string;
  system: string;
  usTotal: number;
  caTotal: number;
  usEntry: number;
  caEntry: number;
  created: number;
  updated: number;
  error?: string;
}

export interface DiscoveryRunResult {
  companies: CompanyRunResult[];
  created: number;
  updated: number;
  usEntry: number;
  caEntry: number;
  errors: number;
}

function dedupeKeyFor(p: DiscoveryPosting): string {
  if (p.externalId) return `${p.system}:${p.externalId}`;
  const h = createHash("sha1")
    .update([p.company, p.title, p.location].join("|").toLowerCase())
    .digest("hex");
  return `fp:${h}`;
}

async function persist(
  p: DiscoveryPosting,
  minYoE: number | null,
): Promise<"created" | "updated"> {
  const dedupeKey = dedupeKeyFor(p);
  const applyUrl = normalizeUrl(p.applyUrl);
  const atsType = detectAts(applyUrl);
  const existing = await prisma.job.findUnique({ where: { dedupeKey }, select: { id: true } });

  const data = {
    atsType,
    externalId: p.externalId || null,
    title: p.title,
    company: p.company,
    location: p.location || null,
    remote: /remote/i.test(p.location),
    applyUrl,
    description: p.description || null,
    postedAt: p.postedAt,
    isWorkday: false, // discovery jobs surface in the main US/CA lists
    country: p.country,
    isEntryLevel: true,
    minYoE,
    discoverySystem: p.system,
    lastSeenAt: new Date(),
  };

  if (existing) {
    await prisma.job.update({ where: { id: existing.id }, data });
    return "updated";
  }
  await prisma.job.create({
    data: { dedupeKey, fingerprint: dedupeKey.startsWith("fp:") ? dedupeKey : null, ...data },
  });
  return "created";
}

async function runCompany(c: ApiCompany, onlyEntryLevel: boolean): Promise<CompanyRunResult> {
  const res: CompanyRunResult = {
    company: c.name,
    system: c.system,
    usTotal: 0,
    caTotal: 0,
    usEntry: 0,
    caEntry: 0,
    created: 0,
    updated: 0,
  };
  try {
    const postings = await fetchCompanyPostings(c);
    for (const p of postings) {
      if (p.country === "OTHER") continue;
      if (!p.title || !p.applyUrl) continue;
      if (p.country === "US") res.usTotal++;
      else res.caTotal++;

      const verdict = classifyEntryLevel({ title: p.title, description: p.description });
      if (onlyEntryLevel && !verdict.isEntryLevel) continue;
      if (p.country === "US") res.usEntry++;
      else res.caEntry++;

      const outcome = await persist(p, verdict.minYearsExperience);
      if (outcome === "created") res.created++;
      else res.updated++;
    }
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
  }
  return res;
}

// Run discovery across the API companies (optionally filtered by name).
export async function runDiscovery(opts?: {
  companies?: string[];
  onlyEntryLevel?: boolean;
  concurrency?: number;
  onProgress?: (r: CompanyRunResult) => void;
}): Promise<DiscoveryRunResult> {
  const onlyEntryLevel = opts?.onlyEntryLevel ?? true;
  const concurrency = opts?.concurrency ?? 5;
  const wanted = opts?.companies?.map((s) => s.toLowerCase());
  const targets = wanted
    ? API_COMPANIES.filter((c) => wanted.includes(c.name.toLowerCase()))
    : API_COMPANIES;

  const results: CompanyRunResult[] = [];
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((c) => runCompany(c, onlyEntryLevel)));
    for (const r of batchResults) {
      results.push(r);
      opts?.onProgress?.(r);
    }
  }

  return {
    companies: results,
    created: results.reduce((a, r) => a + r.created, 0),
    updated: results.reduce((a, r) => a + r.updated, 0),
    usEntry: results.reduce((a, r) => a + r.usEntry, 0),
    caEntry: results.reduce((a, r) => a + r.caEntry, 0),
    errors: results.filter((r) => r.error).length,
  };
}
