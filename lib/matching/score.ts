// Rule-based fit scoring of a job against the user's search criteria.
// Deterministic and dependency-free so it is trivially testable and needs no LLM.

export interface Criteria {
  titles?: string[];
  locations?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  remoteOnly?: boolean;
  seniority?: string[];
  salaryTarget?: number | null; // target annual salary (USD); feeds the judge's salary axis
}

export interface ScoreInput {
  title: string;
  description?: string | null;
  location?: string | null;
  remote?: boolean;
}

export interface ScoreResult {
  score: number; // 0..100
  reasons: string[];
  excluded: boolean;
}

function tokens(s: string): string[] {
  return (s || "").toLowerCase().match(/[a-z0-9+#.]+/g) ?? [];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreJob(job: ScoreInput, criteria: Criteria): ScoreResult {
  const reasons: string[] = [];
  const title = (job.title || "").toLowerCase();
  const hay = `${title} ${(job.description || "").toLowerCase()}`;
  const titleTokens = new Set(tokens(title));

  // Hard exclusions first.
  for (const raw of criteria.excludeKeywords ?? []) {
    const kw = raw.toLowerCase().trim();
    if (kw && hay.includes(kw)) {
      return { score: 0, reasons: [`excluded by keyword "${raw}"`], excluded: true };
    }
  }

  let score = 0;

  // Title match: full-phrase token coverage is strong, partial is weak.
  let bestTitle = 0;
  for (const t of criteria.titles ?? []) {
    const tt = tokens(t);
    if (tt.length === 0) continue;
    const hits = tt.filter((w) => titleTokens.has(w)).length;
    if (hits === tt.length) bestTitle = Math.max(bestTitle, 45);
    else if (hits > 0) bestTitle = Math.max(bestTitle, 18);
  }
  if (bestTitle > 0) {
    score += bestTitle;
    reasons.push(bestTitle >= 45 ? "title matches a target role" : "title partially matches a target role");
  }

  // Keyword hits (capped).
  const kws = criteria.keywords ?? [];
  let kwScore = 0;
  const matchedKw: string[] = [];
  for (const raw of kws) {
    const kw = raw.toLowerCase().trim();
    if (kw && hay.includes(kw)) {
      kwScore += 9;
      matchedKw.push(raw);
    }
  }
  if (kwScore > 0) {
    kwScore = Math.min(kwScore, 36);
    score += kwScore;
    reasons.push(`matched keywords: ${matchedKw.join(", ")}`);
  }

  // Location / remote handling.
  const isRemote = Boolean(job.remote) || /remote/i.test(job.location || "");
  if (criteria.remoteOnly) {
    if (isRemote) {
      score += 20;
      reasons.push("remote role (matches remote-only)");
    } else {
      score -= 30;
      reasons.push("not remote (remote-only preferred)");
    }
  }
  const locs = criteria.locations ?? [];
  if (locs.length > 0 && job.location) {
    const loc = job.location.toLowerCase();
    const hit = locs.find((l) => l.toLowerCase().trim() && loc.includes(l.toLowerCase().trim()));
    if (hit) {
      score += 15;
      reasons.push(`location matches "${hit}"`);
    }
  }

  // Seniority signal.
  for (const s of criteria.seniority ?? []) {
    const sv = s.toLowerCase().trim();
    if (sv && title.includes(sv)) {
      score += 8;
      reasons.push(`seniority matches "${s}"`);
      break;
    }
  }

  if (reasons.length === 0) reasons.push("no criteria matched");
  return { score: clamp(score), reasons, excluded: false };
}
