import type { Criteria } from "../matching/score";
import type { ProfileData } from "../settings";
import type { DiscoveryConfigData } from "./config";

export interface DiscoveryScopeInput {
  config: DiscoveryConfigData;
  criteria?: Criteria;
  profile?: Pick<ProfileData, "targetRoles">;
}

export interface DiscoveryScopeCopy {
  headline: string;
  summary: string;
  roleTerms: string[];
  countryNames: string[];
}

const SENTINELS = new Set([
  "*",
  "ALL",
  "ANY",
  "N/A",
  "NONE",
  "OTHER",
  "UNKNOWN",
]);

function cleanValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const text = value?.trim().replace(/\s+/g, " ");
    if (!text || SENTINELS.has(text.toUpperCase())) continue;
    const key = text.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }
  return cleaned;
}

function readableCountry(value: string): string {
  const code = value.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return value;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? value;
  } catch {
    return value;
  }
}

function formatList(values: string[], limit = 4): string {
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  const items =
    remaining > 0 ? [...visible, `${remaining} more`] : visible;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function experienceSentence(maxYoE: number): string {
  if (!Number.isFinite(maxYoE)) {
    return "Required experience follows your saved limit";
  }
  const years = Math.max(0, Math.round(maxYoE));
  if (years === 0) return "No prior experience may be required";
  return `Required experience is capped at ${years} ${years === 1 ? "year" : "years"}`;
}

export function formatDiscoveryScope({
  config,
  criteria,
  profile,
}: DiscoveryScopeInput): DiscoveryScopeCopy {
  const roleTerms = cleanValues([
    ...(profile?.targetRoles ?? []),
    ...(criteria?.titles ?? []),
    ...config.queryTerms,
    ...config.roleKeywords,
  ]);
  const countryNames = cleanValues(
    cleanValues(config.countries).map(readableCountry),
  );

  const roles =
    roleTerms.length > 0
      ? `Open roles matching ${formatList(roleTerms)}`
      : "Open roles matching your saved role preferences";
  const locations =
    countryNames.length > 0
      ? `in ${formatList(countryNames)}`
      : "across your configured locations";
  const headline = `${roles} ${locations}`;
  const degreeSentence = config.excludeAdvancedDegree
    ? "Roles that require an advanced degree are excluded"
    : "Advanced-degree requirements are allowed";
  const internshipSentence = config.includeInternships
    ? "Internships and co-ops are included"
    : "Internships and co-ops are excluded";

  return {
    headline,
    summary: `${headline}. ${experienceSentence(config.maxYoE)}. ${degreeSentence}. ${internshipSentence}.`,
    roleTerms,
    countryNames,
  };
}
