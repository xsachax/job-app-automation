import { describe, expect, it } from "vitest";
import {
  bucketScore,
  FIT_BANDS,
  JUDGE_AXES,
  STRONG_MIN,
  POSSIBLE_MIN,
} from "../lib/judge/status";

describe("bucketScore", () => {
  it("buckets scores by the strong/possible thresholds", () => {
    expect(bucketScore(100)).toBe("strong");
    expect(bucketScore(70)).toBe("strong");
    expect(bucketScore(69)).toBe("possible");
    expect(bucketScore(40)).toBe("possible");
    expect(bucketScore(39)).toBe("weak");
    expect(bucketScore(0)).toBe("weak");
  });

  it("treats a missing score as unscored, distinct from weak", () => {
    expect(bucketScore(null)).toBe("unscored");
    expect(bucketScore(undefined)).toBe("unscored");
  });
});

describe("judge status vocabulary", () => {
  it("keeps thresholds and bands in sync", () => {
    expect(STRONG_MIN).toBe(70);
    expect(POSSIBLE_MIN).toBe(40);
    expect(FIT_BANDS.map((b) => b.key)).toEqual(["strong", "possible", "weak"]);
    expect(FIT_BANDS.find((b) => b.key === "strong")?.min).toBe(STRONG_MIN);
    expect(FIT_BANDS.find((b) => b.key === "possible")?.min).toBe(POSSIBLE_MIN);
  });

  it("documents every scoring axis", () => {
    expect(JUDGE_AXES).toHaveLength(5);
    expect(JUDGE_AXES.map((a) => a.key)).toEqual([
      "resume",
      "freshness",
      "company",
      "location",
      "salary",
    ]);
    for (const axis of JUDGE_AXES) {
      expect(axis.name.length).toBeGreaterThan(0);
      expect(axis.reads.length).toBeGreaterThan(0);
      expect(axis.effect.length).toBeGreaterThan(0);
    }
  });
});
