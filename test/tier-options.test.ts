import { describe, expect, it } from "vitest";
import { limitToPopular } from "../lib/tier-options";

type Row = { location: string; count: number; tier: string | null };

const rows: Row[] = [
  { location: "San Francisco, CA", count: 300, tier: null },
  { location: "Seattle, WA", count: 150, tier: null },
  { location: "New York, NY", count: 120, tier: null },
  { location: "Austin, TX", count: 50, tier: null },
  { location: "Boise, ID", count: 1, tier: null },
  { location: "Fargo, ND", count: 1, tier: "S" },
];

describe("limitToPopular", () => {
  it("returns every row when there are fewer than the cap", () => {
    const out = limitToPopular(rows, 100, (r) => r.location);
    expect(out).toHaveLength(rows.length);
  });

  it("keeps only the most popular rows up to the cap", () => {
    const unranked = rows.filter((r) => r.tier == null);
    const out = limitToPopular(unranked, 3, (r) => r.location);
    expect(out.map((r) => r.location)).toEqual([
      "San Francisco, CA",
      "Seattle, WA",
      "New York, NY",
    ]);
  });

  it("always retains a ranked row even when it falls past the cap", () => {
    // Fargo is a 1-count city that would be cut by popularity, but it's ranked
    // S, so it must survive the cap. Boise (also 1 count, unranked) gets cut.
    const out = limitToPopular(rows, 3, (r) => r.location);
    expect(out.some((r) => r.location === "Fargo, ND")).toBe(true);
    expect(out.some((r) => r.location === "Boise, ID")).toBe(false);
    // The kept ranked row does not displace the popular top-N.
    expect(out.map((r) => r.location)).toEqual([
      "San Francisco, CA",
      "Seattle, WA",
      "New York, NY",
      "Fargo, ND",
    ]);
  });

  it("breaks count ties by name for stable ordering", () => {
    const tied: Row[] = [
      { location: "Bravo", count: 5, tier: null },
      { location: "Alpha", count: 5, tier: null },
    ];
    const out = limitToPopular(tied, 2, (r) => r.location);
    expect(out.map((r) => r.location)).toEqual(["Alpha", "Bravo"]);
  });
});
