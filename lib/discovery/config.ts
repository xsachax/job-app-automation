// User-editable discovery configuration.
//
// The whole pipeline is driven by this one JSON blob so that, years from now,
// the roles, locations, experience ceiling, degree ceiling and enabled sources
// can all be changed from the dashboard (or a script) WITHOUT touching code.
// Nothing about "entry-level software in the US/CA" is hard-wired into the
// engine — it is merely the default value of this config.

import { prisma } from "../db";
import type { EntryLevelOptions } from "./entryLevel";
import {
  DEFAULT_GOLDEN_JOB_CONFIG,
  normalizeGoldenJobConfig,
  type GoldenJobConfig,
} from "../jobs/golden";

export interface DiscoveryConfigData {
  /** Countries to keep, each surfaced as its own list. Uses classifyCountry codes. */
  countries: string[];
  /** Max years of experience a role may REQUIRE and still qualify (<= wins). */
  maxYoE: number;
  /** Drop roles that clearly REQUIRE a Master's/PhD. */
  excludeAdvancedDegree: boolean;
  /** Keep internship / co-op postings (off = new-grad / full-time only). */
  includeInternships: boolean;
  /**
   * Extra role keywords that broaden what counts as "in scope" (added on top of
   * the built-in software vocabulary). e.g. ["security", "data scientist"].
   */
  roleKeywords: string[];
  /** Extra title keywords to exclude (added to the built-in non-software list). */
  excludeTitleKeywords: string[];
  /** Search terms handed to each scraper (empty = each source's own default). */
  queryTerms: string[];
  /** Source names (company or board) to skip on a run. Missing = enabled. */
  disabledSources: string[];
  /** Early-career signals promoted in the queue and guaranteed a Judge floor. */
  goldenJobs: GoldenJobConfig;
  /** Y Combinator directory-expansion source settings (see lib/discovery/yc.ts). */
  yc: YcConfig;
}

/** Knobs for the Y Combinator expansion source. All defaults are sane; the whole
 *  block is editable so a future run can widen the batch window, team-size floor,
 *  or per-run company cap without touching code. */
export interface YcConfig {
  /** Only keep companies whose YC batch is within this many years of "now". */
  yearsBack: number;
  /** Minimum team size (a coarse "has real traction / is successful" signal). */
  minTeamSize: number;
  /** Upper team-size guard (0 = no ceiling); keeps the list startup-shaped. */
  maxTeamSize: number;
  /** Cap on how many companies to ATS-resolve per run (keeps runs bounded). */
  maxCompanies: number;
  /** Parallelism for the website ATS-resolution crawl. */
  concurrency: number;
}

export const DEFAULT_YC_CONFIG: YcConfig = {
  yearsBack: 5,
  minTeamSize: 10,
  maxTeamSize: 2000,
  maxCompanies: 600,
  concurrency: 8,
};

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfigData = {
  countries: ["US", "CA"],
  maxYoE: 2,
  excludeAdvancedDegree: true,
  includeInternships: false,
  roleKeywords: [],
  excludeTitleKeywords: [],
  queryTerms: [],
  disabledSources: [],
  goldenJobs: DEFAULT_GOLDEN_JOB_CONFIG,
  yc: DEFAULT_YC_CONFIG,
};

export function normalizeDiscoveryConfig(
  raw: Partial<DiscoveryConfigData> | null | undefined,
): DiscoveryConfigData {
  const d = DEFAULT_DISCOVERY_CONFIG;
  const r = raw ?? {};
  const arr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : fallback;
  const num = (v: unknown, fallback: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 40 ? Math.round(n) : fallback;
  };
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  const ycNum = (v: unknown, fallback: number, max: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : fallback;
  };
  const yc = (v: unknown): YcConfig => {
    const d = DEFAULT_YC_CONFIG;
    const o = (v && typeof v === "object" ? v : {}) as Partial<YcConfig>;
    return {
      yearsBack: ycNum(o.yearsBack, d.yearsBack, 30),
      minTeamSize: ycNum(o.minTeamSize, d.minTeamSize, 100000),
      maxTeamSize: ycNum(o.maxTeamSize, d.maxTeamSize, 1000000),
      maxCompanies: ycNum(o.maxCompanies, d.maxCompanies, 6000),
      concurrency: Math.max(1, ycNum(o.concurrency, d.concurrency, 32)),
    };
  };
  return {
    countries: arr(r.countries, d.countries).map((c) => c.toUpperCase()),
    maxYoE: num(r.maxYoE, d.maxYoE),
    excludeAdvancedDegree: bool(r.excludeAdvancedDegree, d.excludeAdvancedDegree),
    includeInternships: bool(r.includeInternships, d.includeInternships),
    roleKeywords: arr(r.roleKeywords, d.roleKeywords),
    excludeTitleKeywords: arr(r.excludeTitleKeywords, d.excludeTitleKeywords),
    queryTerms: arr(r.queryTerms, d.queryTerms),
    disabledSources: arr(r.disabledSources, d.disabledSources),
    goldenJobs: normalizeGoldenJobConfig(r.goldenJobs, d.goldenJobs),
    yc: yc(r.yc),
  };
}

export async function getDiscoveryConfig(): Promise<DiscoveryConfigData> {
  const row = await prisma.discoveryConfig.findUnique({ where: { id: "default" } });
  if (!row) return normalizeDiscoveryConfig(null);
  try {
    return normalizeDiscoveryConfig(
      JSON.parse(row.data) as Partial<DiscoveryConfigData>,
    );
  } catch {
    return normalizeDiscoveryConfig(null);
  }
}

export async function saveDiscoveryConfig(
  data: Partial<DiscoveryConfigData>,
): Promise<DiscoveryConfigData> {
  const current = await getDiscoveryConfig();
  const merged = normalizeDiscoveryConfig({
    ...current,
    ...data,
    goldenJobs: { ...current.goldenJobs, ...data.goldenJobs },
    yc: { ...current.yc, ...data.yc },
  });
  await prisma.discoveryConfig.upsert({
    where: { id: "default" },
    update: { data: JSON.stringify(merged) },
    create: { id: "default", data: JSON.stringify(merged) },
  });
  return merged;
}

/** Translate the stored config into the options the classifier understands. */
export function toEntryLevelOptions(config: DiscoveryConfigData): EntryLevelOptions {
  return {
    maxYoE: config.maxYoE,
    includeInternships: config.includeInternships,
    excludeAdvancedDegree: config.excludeAdvancedDegree,
    extraRoleKeywords: config.roleKeywords,
    extraExcludeKeywords: config.excludeTitleKeywords,
  };
}
