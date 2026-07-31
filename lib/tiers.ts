// Company tier list — a user-defined S/A/B/C/D/F ranking of employers. The tier
// nudges a company's deterministic fit score so preferred employers float to the
// top of the queue and avoided ones sink. Shared by the /tiers UI, the /api/tiers
// route, and the judge so the ordering, labels, and score math never drift.

export const TIERS = ["S", "A", "B", "C", "D", "F"] as const;
export type Tier = (typeof TIERS)[number];

// Points added to (or subtracted from) a company's deterministic fit score. The
// judge clamps the adjusted score back into 0-100.
export const TIER_MODIFIER: Record<Tier, number> = {
  S: 15,
  A: 10,
  B: 5,
  C: 0,
  D: -10,
  F: -25,
};

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

// Companies are matched case-insensitively on their trimmed display name.
export function normalizeCompanyKey(company: string): string {
  return company.trim().toLowerCase();
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Adjust a base fit score by the company's tier. A missing/invalid tier leaves
// the score unchanged (aside from clamping).
export function applyTierModifier(score: number, tier: Tier | null | undefined): number {
  if (!isTier(tier)) return clampScore(score);
  return clampScore(score + TIER_MODIFIER[tier]);
}
