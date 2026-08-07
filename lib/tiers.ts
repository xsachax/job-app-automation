// Shared S…F ranking for companies and locations. Company tiers select the
// judge's primary score band (lib/judge/scoring.ts); location tiers use the
// modifiers below to position a job within that company band.

import { canonicalCompanyKey } from "./company-names";

export const TIERS = ["S", "A", "B", "C", "D", "E", "F"] as const;
export type Tier = (typeof TIERS)[number];
export const NEUTRAL_TIER: Tier = "E";

// Location-tier points included among the contextual signals that position a
// job within its company-tier score band.
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

// Aliases and legal-entity variants share one tier.
export function normalizeCompanyKey(company: string): string {
  return canonicalCompanyKey(company);
}

export interface StoredCompanyTier {
  company: string;
  tier: string;
  editVersion: bigint;
  updatedAt: Date;
}

export function latestCompanyTiersByKey<T extends StoredCompanyTier>(
  rows: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeCompanyKey(row.company);
    const current = latest.get(key);
    if (
      !current ||
      row.editVersion > current.editVersion ||
      (row.editVersion === current.editVersion &&
        row.updatedAt.getTime() > current.updatedAt.getTime())
    ) {
      latest.set(key, row);
    }
  }
  return latest;
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
