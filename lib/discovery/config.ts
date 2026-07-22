// User-editable discovery configuration.
//
// The whole pipeline is driven by this one JSON blob so that, years from now,
// the roles, locations, experience ceiling, degree ceiling and enabled sources
// can all be changed from the dashboard (or a script) WITHOUT touching code.
// Nothing about "entry-level software in the US/CA" is hard-wired into the
// engine — it is merely the default value of this config.

import { prisma } from "../db";
import type { EntryLevelOptions } from "./entryLevel";

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
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfigData = {
  countries: ["US", "CA"],
  maxYoE: 2,
  excludeAdvancedDegree: true,
  includeInternships: false,
  roleKeywords: [],
  excludeTitleKeywords: [],
  queryTerms: [],
  disabledSources: [],
};

function coerce(raw: Partial<DiscoveryConfigData> | null | undefined): DiscoveryConfigData {
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
  return {
    countries: arr(r.countries, d.countries).map((c) => c.toUpperCase()),
    maxYoE: num(r.maxYoE, d.maxYoE),
    excludeAdvancedDegree: bool(r.excludeAdvancedDegree, d.excludeAdvancedDegree),
    includeInternships: bool(r.includeInternships, d.includeInternships),
    roleKeywords: arr(r.roleKeywords, d.roleKeywords),
    excludeTitleKeywords: arr(r.excludeTitleKeywords, d.excludeTitleKeywords),
    queryTerms: arr(r.queryTerms, d.queryTerms),
    disabledSources: arr(r.disabledSources, d.disabledSources),
  };
}

export async function getDiscoveryConfig(): Promise<DiscoveryConfigData> {
  const row = await prisma.discoveryConfig.findUnique({ where: { id: "default" } });
  if (!row) return { ...DEFAULT_DISCOVERY_CONFIG };
  try {
    return coerce(JSON.parse(row.data) as Partial<DiscoveryConfigData>);
  } catch {
    return { ...DEFAULT_DISCOVERY_CONFIG };
  }
}

export async function saveDiscoveryConfig(
  data: Partial<DiscoveryConfigData>,
): Promise<DiscoveryConfigData> {
  const merged = coerce({ ...(await getDiscoveryConfig()), ...data });
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
