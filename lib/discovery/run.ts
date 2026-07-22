import { prisma } from "../db";
import { createHash } from "node:crypto";
import { fetchCompanyPostings, type DiscoveryPosting } from "./adapters";
import { classifyEntryLevel, type EntryLevelOptions } from "./entryLevel";
import { enrich, type Enrichment } from "./enrich";
import { getDiscoveryConfig, toEntryLevelOptions, type DiscoveryConfigData } from "./config";
import { DISCOVERY_SOURCES, type ApiCompany } from "./companies";
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

// Cross-source fingerprint: the same open role often appears on both a company's
// own career site AND on an aggregator board. This coarse key (company + title +
// country, ignoring location formatting) lets us recognize that pair and keep a
// single card. It is deliberately NOT unique — one employer legitimately posts
// the same title in several cities (distinct reqs, same system), so we only ever
// dedupe on it ACROSS different discovery systems.
function fingerprintFor(p: DiscoveryPosting): string {
  return createHash("sha1")
    .update([p.company, p.title, p.country].join("|").toLowerCase().replace(/\s+/g, " ").trim())
    .digest("hex");
}

async function persist(
  p: DiscoveryPosting,
  minYoE: number | null,
  enrichment: Enrichment,
): Promise<"created" | "updated"> {
  const dedupeKey = dedupeKeyFor(p);
  const fingerprint = fingerprintFor(p);
  const applyUrl = normalizeUrl(p.applyUrl);
  const atsType = detectAts(applyUrl);

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
    fingerprint,
    // Enrichment facets (deterministic; see lib/discovery/enrich.ts).
    salaryMin: enrichment.salaryMin,
    salaryMax: enrichment.salaryMax,
    salaryCurrency: enrichment.salaryCurrency,
    salaryRaw: enrichment.salaryRaw,
    sponsorship: enrichment.sponsorship === "unknown" ? null : enrichment.sponsorship,
    skills: enrichment.skills.length ? JSON.stringify(enrichment.skills) : null,
    employmentType: enrichment.employmentType,
    lastSeenAt: new Date(),
  };

  // 1. Same posting from the same source (stable external id) → update in place.
  const existing = await prisma.job.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) {
    await prisma.job.update({ where: { id: existing.id }, data });
    return "updated";
  }

  // 2. Same role already found via a DIFFERENT source. A GitHub aggregator board
  //    re-lists roles that also live on a company's own site (and across boards).
  //    Board postings therefore dedupe against ANY existing card with the same
  //    fingerprint; native company postings only dedupe across a *different*
  //    system, so an employer's distinct same-title reqs (same system) are kept.
  //    Company sites run before boards, so the richer native card always wins.
  const isBoard = p.system === "githubboard";
  const crossSource = await prisma.job.findFirst({
    where: isBoard ? { fingerprint } : { fingerprint, discoverySystem: { not: p.system } },
    select: { id: true },
  });
  if (crossSource) {
    await prisma.job.update({ where: { id: crossSource.id }, data: { lastSeenAt: new Date() } });
    return "updated";
  }

  await prisma.job.create({ data: { dedupeKey, ...data } });
  return "created";
}

export interface IngestCounts {
  usTotal: number;
  caTotal: number;
  usEntry: number;
  caEntry: number;
  created: number;
  updated: number;
}

function zeroCounts(): IngestCounts {
  return { usTotal: 0, caTotal: 0, usEntry: 0, caEntry: 0, created: 0, updated: 0 };
}

export interface IngestOptions {
  /** Classifier knobs (from config). Omit for the historical defaults. */
  entryOptions?: EntryLevelOptions;
  /** Countries to keep. Omit to keep the default US + CA. */
  countries?: string[];
}

// Classify a batch of postings (any source) and persist the entry-level ones for
// the configured countries. Mutates and returns a running counter. Shared by the
// API runner and the Playwright browser runner.
export async function ingestPostings(
  postings: DiscoveryPosting[],
  onlyEntryLevel: boolean,
  res: IngestCounts = zeroCounts(),
  opts: IngestOptions = {},
): Promise<IngestCounts> {
  const countries = opts.countries?.length ? opts.countries : ["US", "CA"];
  for (const p of postings) {
    if (!countries.includes(p.country)) continue;
    if (!p.title || !p.applyUrl) continue;
    if (p.country === "US") res.usTotal++;
    else if (p.country === "CA") res.caTotal++;

    const verdict = classifyEntryLevel(
      { title: p.title, description: p.description },
      opts.entryOptions,
    );
    if (onlyEntryLevel && !verdict.isEntryLevel) continue;
    if (p.country === "US") res.usEntry++;
    else if (p.country === "CA") res.caEntry++;

    const enrichment = enrich({
      title: p.title,
      description: p.description,
      location: p.location,
      country: p.country,
      sponsorship: p.sponsorship,
      compensation: p.compensation,
      isInternship: verdict.isInternship,
    });

    const outcome = await persist(p, verdict.minYearsExperience, enrichment);
    if (outcome === "created") res.created++;
    else res.updated++;
  }
  return res;
}

async function runCompany(
  c: ApiCompany,
  onlyEntryLevel: boolean,
  opts: IngestOptions,
): Promise<CompanyRunResult> {
  const res: CompanyRunResult = { company: c.name, system: c.system, ...zeroCounts() };
  try {
    const postings = await fetchCompanyPostings(c);
    await ingestPostings(postings, onlyEntryLevel, res, opts);
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
  }
  return res;
}

// Run discovery across the API companies (optionally filtered by name). The
// stored DiscoveryConfig drives classification, country selection and which
// sources are enabled — pass `config` to override (e.g. tests) or omit to load
// the singleton (falling back to defaults when unset).
export async function runDiscovery(opts?: {
  companies?: string[];
  onlyEntryLevel?: boolean;
  concurrency?: number;
  config?: DiscoveryConfigData;
  onProgress?: (r: CompanyRunResult) => void;
}): Promise<DiscoveryRunResult> {
  const onlyEntryLevel = opts?.onlyEntryLevel ?? true;
  const concurrency = opts?.concurrency ?? 5;
  const config = opts?.config ?? (await getDiscoveryConfig());
  const ingestOpts: IngestOptions = {
    entryOptions: toEntryLevelOptions(config),
    countries: config.countries,
  };
  const disabled = new Set(config.disabledSources.map((s) => s.toLowerCase()));
  const wanted = opts?.companies?.map((s) => s.toLowerCase());
  const targets = DISCOVERY_SOURCES.filter((c) => {
    if (disabled.has(c.name.toLowerCase())) return false;
    if (wanted) return wanted.includes(c.name.toLowerCase());
    return true;
  });

  const results: CompanyRunResult[] = [];
  // Company sites first (concurrent batches), then aggregator boards strictly
  // sequentially. Boards re-list roles already found natively, so running them
  // last + one-at-a-time makes cross-source dedup deterministic (each board
  // sees every prior insert).
  const boards = targets.filter((c) => c.system === "githubboard");
  const companies = targets.filter((c) => c.system !== "githubboard");

  for (let i = 0; i < companies.length; i += concurrency) {
    const batch = companies.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((c) => runCompany(c, onlyEntryLevel, ingestOpts)));
    for (const r of batchResults) {
      results.push(r);
      opts?.onProgress?.(r);
    }
  }

  for (const b of boards) {
    const r = await runCompany(b, onlyEntryLevel, ingestOpts);
    results.push(r);
    opts?.onProgress?.(r);
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
