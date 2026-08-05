import { describe, expect, it } from "vitest";
import {
  TIERS,
  TIER_MODIFIER,
  applyTierModifier,
  clampScore,
  isTier,
  NEUTRAL_TIER,
  normalizeCompanyKey,
  tierModifier,
} from "../lib/tiers";

describe("tiers", () => {
  it("exposes exactly S through F with E as neutral", () => {
    expect(TIERS).toEqual(["S", "A", "B", "C", "D", "E", "F"]);
    expect(NEUTRAL_TIER).toBe("E");
  });

  it("recognizes valid tiers and rejects everything else", () => {
    for (const t of TIERS) expect(isTier(t)).toBe(true);
    expect(isTier("s")).toBe(false);
    expect(isTier("S+")).toBe(false);
    expect(isTier("S++")).toBe(false);
    expect(isTier("G")).toBe(false);
    expect(isTier("S+++")).toBe(false);
    expect(isTier("")).toBe(false);
    expect(isTier(null)).toBe(false);
    expect(isTier(undefined)).toBe(false);
    expect(isTier(1)).toBe(false);
  });

  it("normalizes company keys case-insensitively and trims", () => {
    expect(normalizeCompanyKey("  OpenAI ")).toBe("openai");
    expect(normalizeCompanyKey("Acme")).toBe(normalizeCompanyKey("acme"));
  });

  it("clamps scores into 0-100 and rounds", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(120)).toBe(100);
    expect(clampScore(42.4)).toBe(42);
    expect(clampScore(42.6)).toBe(43);
  });

  it("applies each tier modifier and clamps the result", () => {
    expect(applyTierModifier(50, "S")).toBe(75);
    expect(applyTierModifier(50, "A")).toBe(70);
    expect(applyTierModifier(50, "B")).toBe(65);
    expect(applyTierModifier(50, "C")).toBe(60);
    expect(applyTierModifier(50, "D")).toBe(55);
    expect(applyTierModifier(50, "E")).toBe(50);
    expect(applyTierModifier(50, "F")).toBe(25);
  });

  it("clamps boosted and penalized scores at the boundaries", () => {
    expect(applyTierModifier(95, "S")).toBe(100);
    expect(applyTierModifier(90, "S")).toBe(100);
    expect(applyTierModifier(10, "F")).toBe(0);
  });

  it("treats a missing tier exactly like neutral E", () => {
    expect(tierModifier(null)).toBe(TIER_MODIFIER.E);
    expect(tierModifier(undefined)).toBe(TIER_MODIFIER.E);
    expect(applyTierModifier(73, null)).toBe(73);
    expect(applyTierModifier(73, undefined)).toBe(73);
    expect(applyTierModifier(120, null)).toBe(100);
  });

  it("keeps modifier map keys in sync with TIERS", () => {
    expect(Object.keys(TIER_MODIFIER).sort()).toEqual([...TIERS].sort());
  });
});
