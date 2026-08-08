import { describe, expect, it } from "vitest";
import { salaryFit } from "../lib/matching/salary";

describe("salaryFit", () => {
  it("is neutral when no target is set", () => {
    expect(salaryFit({ salaryMin: 90000, salaryMax: 130000 }, null)).toEqual({
      delta: 0,
      known: false,
      reason: null,
    });
    expect(salaryFit({ salaryMin: 90000 }, 0)).toEqual({ delta: 0, known: false, reason: null });
  });

  it("is fully neutral when the posting lists no salary", () => {
    const r = salaryFit({ salaryMin: null, salaryMax: null }, 110000);
    expect(r.delta).toBe(0);
    expect(r.known).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("boosts strongly when pay is well above target", () => {
    const r = salaryFit({ salaryMin: 150000, salaryMax: 170000 }, 110000);
    expect(r.delta).toBe(12);
    expect(r.known).toBe(true);
    expect(r.reason).toContain("well above");
  });

  it("boosts when the midpoint meets the target", () => {
    // midpoint 110k == target
    expect(salaryFit({ salaryMin: 100000, salaryMax: 120000 }, 110000).delta).toBe(8);
  });

  it("stays neutral when pay is near the target", () => {
    // midpoint 100k / 110k target = 0.90 -> near
    const r = salaryFit({ salaryMin: 95000, salaryMax: 105000 }, 110000);
    expect(r.delta).toBe(0);
    expect(r.reason).toContain("near");
  });

  it("penalizes below target and heavily well below", () => {
    // midpoint 85k / 110k = 0.77 -> below
    expect(salaryFit({ salaryMin: 80000, salaryMax: 90000 }, 110000).delta).toBe(-8);
    // midpoint 65k / 110k = 0.59 -> well below
    expect(salaryFit({ salaryMin: 60000, salaryMax: 70000 }, 110000).delta).toBe(-15);
  });

  it("uses whichever bound is present when the range is one-sided", () => {
    expect(salaryFit({ salaryMax: 140000 }, 110000).delta).toBe(12);
    expect(salaryFit({ salaryMin: 70000 }, 110000).delta).toBe(-15);
  });

  it("converts CAD toward USD before comparing", () => {
    // 150k CAD * 0.73 = 109.5k ~ 110k target -> meets (>= 1.0? 0.995 -> near)
    const near = salaryFit({ salaryMin: 150000, salaryMax: 150000, salaryCurrency: "CAD" }, 110000);
    expect(near.delta).toBe(0);
    // 200k CAD * 0.73 = 146k / 110k = 1.33 -> well above
    const above = salaryFit({ salaryMin: 200000, salaryMax: 200000, salaryCurrency: "CAD" }, 110000);
    expect(above.delta).toBe(12);
  });

  it("ignores non-positive or non-finite salary values", () => {
    expect(salaryFit({ salaryMin: 0, salaryMax: -5 }, 110000).known).toBe(false);
    expect(salaryFit({ salaryMin: Number.NaN }, 110000).known).toBe(false);
  });
});
