import { describe, it, expect } from "vitest";
import { scoreJob, type Criteria } from "../lib/matching/score";

const criteria: Criteria = {
  titles: ["Software Engineer"],
  keywords: ["typescript", "react"],
  excludeKeywords: ["clearance"],
  locations: ["Remote"],
  remoteOnly: false,
  seniority: ["senior"],
};

describe("scoreJob", () => {
  it("excludes on a banned keyword", () => {
    const r = scoreJob({ title: "Software Engineer", description: "US clearance required" }, criteria);
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("scores a strong full-title + keyword + location match highly", () => {
    const r = scoreJob(
      {
        title: "Senior Software Engineer",
        description: "We use TypeScript and React.",
        location: "Remote",
        remote: true,
      },
      criteria,
    );
    expect(r.excluded).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.reasons.join(" ")).toMatch(/title matches/i);
  });

  it("scores an unrelated role low", () => {
    const r = scoreJob({ title: "Warehouse Associate", description: "forklift" }, criteria);
    expect(r.excluded).toBe(false);
    expect(r.score).toBeLessThan(20);
  });

  it("penalizes non-remote roles when remoteOnly is set", () => {
    const remoteOnly: Criteria = { ...criteria, remoteOnly: true };
    const onsite = scoreJob({ title: "Software Engineer", location: "New York", remote: false }, remoteOnly);
    const remote = scoreJob({ title: "Software Engineer", location: "Remote", remote: true }, remoteOnly);
    expect(remote.score).toBeGreaterThan(onsite.score);
  });

  it("clamps scores into 0..100", () => {
    const r = scoreJob(
      { title: "Senior Software Engineer", description: "typescript react", location: "Remote", remote: true },
      criteria,
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
