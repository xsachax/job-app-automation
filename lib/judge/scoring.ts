import {
  isTier,
  NEUTRAL_TIER,
  type Tier,
} from "../tiers";

export interface CompanyTierScoreBand {
  min: number;
  max: number;
}

export const COMPANY_TIER_SCORE_BANDS: Record<
  Tier,
  CompanyTierScoreBand
> = {
  S: { min: 84, max: 97 },
  A: { min: 70, max: 83 },
  B: { min: 56, max: 69 },
  C: { min: 42, max: 55 },
  D: { min: 28, max: 41 },
  E: { min: 14, max: 27 },
  F: { min: 0, max: 13 },
};

export const COMPANY_TIER_SCORE_HINTS: Record<Tier, string> = {
  S: "84–97 fit",
  A: "70–83 fit",
  B: "56–69 fit",
  C: "42–55 fit",
  D: "28–41 fit",
  E: "14–27 fit",
  F: "0–13 fit",
};

const CONTEXT_SIGNAL_WEIGHT = 0.15;

export function effectiveCompanyTier(
  tier: Tier | null | undefined,
): Tier {
  return isTier(tier) ? tier : NEUTRAL_TIER;
}

export function companyTierScoreBand(
  tier: Tier | null | undefined,
): CompanyTierScoreBand {
  return COMPANY_TIER_SCORE_BANDS[effectiveCompanyTier(tier)];
}

export function tierFirstJudgeScore(
  resumeScore: number,
  companyTier: Tier | null | undefined,
  contextDelta = 0,
): number {
  const band = companyTierScoreBand(companyTier);
  const boundedResumeScore = Number.isFinite(resumeScore)
    ? Math.max(0, Math.min(100, resumeScore))
    : 0;
  const boundedContextDelta = Number.isFinite(contextDelta)
    ? contextDelta
    : 0;
  const withinBand =
    band.min +
    (boundedResumeScore / 100) * (band.max - band.min) +
    boundedContextDelta * CONTEXT_SIGNAL_WEIGHT;
  return Math.max(band.min, Math.min(band.max, Math.round(withinBand)));
}
