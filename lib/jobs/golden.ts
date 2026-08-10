export const GOLDEN_JOB_SCORE_FLOOR = 95;

export interface GoldenJobConfig {
  enabled: boolean;
  titleKeywords: string[];
  descriptionKeywords: string[];
}

export interface GoldenJobCandidate {
  title: string;
  description?: string | null;
}

export interface GoldenJobMatch {
  field: "title" | "description";
  keyword: string;
}

export const DEFAULT_GOLDEN_JOB_CONFIG: GoldenJobConfig = {
  enabled: true,
  titleKeywords: ["new grad", "new graduate", "graduate", "2027"],
  descriptionKeywords: [
    "new grad",
    "new graduate",
    "recent graduate",
    "class of 2027",
    "graduating in 2027",
    "2027 graduate",
    "2027 graduation",
  ],
};

export function normalizeGoldenKeyword(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeGoldenKeywords(
  value: unknown,
  fallback: string[] = [],
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of source) {
    const normalized = normalizeGoldenKeyword(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    keywords.push(normalized);
  }
  return keywords;
}

export function normalizeGoldenJobConfig(
  value: unknown,
  fallback: GoldenJobConfig = DEFAULT_GOLDEN_JOB_CONFIG,
): GoldenJobConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<GoldenJobConfig>)
      : {};
  return {
    enabled:
      typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    titleKeywords: normalizeGoldenKeywords(
      raw.titleKeywords,
      fallback.titleKeywords,
    ),
    descriptionKeywords: normalizeGoldenKeywords(
      raw.descriptionKeywords,
      fallback.descriptionKeywords,
    ),
  };
}

function matchField(
  value: string | null | undefined,
  keywords: string[],
): string | null {
  const normalized = normalizeGoldenKeyword(value);
  if (!normalized) return null;
  const tokens = normalized.split(" ");
  for (const keyword of keywords) {
    const keywordTokens = keyword.split(" ");
    for (
      let index = 0;
      index <= tokens.length - keywordTokens.length;
      index++
    ) {
      if (
        !keywordTokens.every(
          (token, offset) => tokens[index + offset] === token,
        )
      ) {
        continue;
      }
      if (
        keyword === "graduate" &&
        ["under", "post", "non"].includes(tokens[index - 1] ?? "")
      ) {
        continue;
      }
      return keyword;
    }
  }
  return null;
}

export function createGoldenJobMatcher(
  config: GoldenJobConfig,
): (candidate: GoldenJobCandidate) => GoldenJobMatch | null {
  const normalized = normalizeGoldenJobConfig(config);
  if (!normalized.enabled) return () => null;

  return (candidate) => {
    const titleKeyword = matchField(
      candidate.title,
      normalized.titleKeywords,
    );
    if (titleKeyword) return { field: "title", keyword: titleKeyword };

    const descriptionKeyword = matchField(
      candidate.description,
      normalized.descriptionKeywords,
    );
    return descriptionKeyword
      ? { field: "description", keyword: descriptionKeyword }
      : null;
  };
}

export function matchGoldenJob(
  candidate: GoldenJobCandidate,
  config: GoldenJobConfig,
): GoldenJobMatch | null {
  return createGoldenJobMatcher(config)(candidate);
}

export function applyGoldenJobScoreFloor(
  score: number,
  match: GoldenJobMatch | null,
): number {
  return match ? Math.max(score, GOLDEN_JOB_SCORE_FLOOR) : score;
}

export function goldenJobFloorReason(match: GoldenJobMatch): string {
  return `Golden job: ${match.field} matches "${match.keyword}"; final Judge score floor is ${GOLDEN_JOB_SCORE_FLOOR}`;
}

export function historicalGoldenJobMatch(
  value: unknown,
): GoldenJobMatch | null {
  let reasons: unknown = value;
  if (typeof value === "string") {
    try {
      reasons = JSON.parse(value) as unknown;
    } catch {
      reasons = [value];
    }
  }
  if (!Array.isArray(reasons)) return null;

  for (const reason of reasons) {
    if (typeof reason !== "string") continue;
    const match = reason.match(
      /\bGolden job: (title|description) matches "([^"]+)"; final Judge score floor is (\d+)\b/i,
    );
    if (!match || Number(match[3]) !== GOLDEN_JOB_SCORE_FLOOR) continue;
    const field = match[1].toLowerCase();
    if (field !== "title" && field !== "description") continue;
    const keyword = normalizeGoldenKeyword(match[2]);
    if (!keyword) continue;
    return { field, keyword };
  }
  return null;
}
