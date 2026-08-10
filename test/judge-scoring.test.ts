import { describe, expect, it } from "vitest";
import { TIERS } from "../lib/tiers";
import {
  COMPANY_TIER_SCORE_BANDS,
  companyTierScoreBand,
  tierFirstJudgeScore,
} from "../lib/judge/scoring";
import {
  GOLDEN_JOB_SCORE_FLOOR,
  applyGoldenJobScoreFloor,
} from "../lib/jobs/golden";

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

  it("applies the golden floor after every company tier without changing the maximum", () => {
    const match = { field: "title", keyword: "new grad" } as const;
    for (const tier of TIERS) {
      const tierScore = tierFirstJudgeScore(0, tier, -1_000);
      const finalScore = applyGoldenJobScoreFloor(tierScore, match);
      expect(finalScore).toBeGreaterThanOrEqual(GOLDEN_JOB_SCORE_FLOOR);
      expect(finalScore).toBeLessThanOrEqual(97);
    }

    expect(
      applyGoldenJobScoreFloor(
        tierFirstJudgeScore(100, "S", 1_000),
        match,
      ),
    ).toBe(97);
    expect(
      applyGoldenJobScoreFloor(
        tierFirstJudgeScore(100, "F", 1_000),
        null,
      ),
    ).toBe(COMPANY_TIER_SCORE_BANDS.F.max);
  });
});
