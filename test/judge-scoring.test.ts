import { describe, expect, it } from "vitest";
import { TIERS } from "../lib/tiers";
import {
  COMPANY_TIER_SCORE_BANDS,
  companyTierScoreBand,
  tierFirstJudgeScore,
} from "../lib/judge/scoring";

describe("tier-first judge scoring", () => {
  it("keeps every result inside its non-overlapping company-tier band", () => {
    for (const tier of TIERS) {
      const band = COMPANY_TIER_SCORE_BANDS[tier];
      expect(tierFirstJudgeScore(0, tier, -1_000)).toBe(band.min);
      expect(tierFirstJudgeScore(100, tier, 1_000)).toBe(band.max);
    }

    for (let index = 0; index < TIERS.length - 1; index++) {
      const stronger = COMPANY_TIER_SCORE_BANDS[TIERS[index]];
      const weaker = COMPANY_TIER_SCORE_BANDS[TIERS[index + 1]];
      expect(stronger.min).toBeGreaterThan(weaker.max);
    }
  });

  it("lets company tier outrank even opposite résumé and context signals", () => {
    const weakestS = tierFirstJudgeScore(0, "S", -1_000);
    const strongestA = tierFirstJudgeScore(100, "A", 1_000);
    expect(weakestS).toBeGreaterThan(strongestA);
  });

  it("caps the strongest possible deterministic score below 100", () => {
    expect(tierFirstJudgeScore(100, "S", 1_000)).toBe(97);
  });

  it("uses the E band for unrated companies", () => {
    expect(companyTierScoreBand(null)).toEqual(
      COMPANY_TIER_SCORE_BANDS.E,
    );
    expect(tierFirstJudgeScore(75, null, 0)).toBe(
      tierFirstJudgeScore(75, "E", 0),
    );
  });
});
