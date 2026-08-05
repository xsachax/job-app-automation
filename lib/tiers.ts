// Shared S…F ranking for companies and locations. The tier
// nudges a job's deterministic fit score so preferred companies and locations
// float to the top of the queue and avoided ones sink. Shared by both tier-board
// UIs, their API routes, and the judge so labels and score math never drift.

export const TIERS = ["S", "A", "B", "C", "D", "E", "F"] as const;
export type Tier = (typeof TIERS)[number];
export const NEUTRAL_TIER: Tier = "E";

// Points added to (or subtracted from) a job's deterministic fit score. The
// judge clamps the adjusted score back into 0-100.
export const TIER_MODIFIER: Record<Tier, number> = {
  S: 25,
  A: 20,
  B: 15,
  C: 10,
  D: 5,
  E: 0,
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

export function tierModifier(tier: Tier | null | undefined): number {
  return isTier(tier) ? TIER_MODIFIER[tier] : TIER_MODIFIER[NEUTRAL_TIER];
}

// Adjust a base fit score by the selected tier. Missing tiers are neutral,
// exactly like E.
export function applyTierModifier(score: number, tier: Tier | null | undefined): number {
  return clampScore(score + tierModifier(tier));
}
