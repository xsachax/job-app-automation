import { describe, expect, it } from "vitest";
import { freshnessFit } from "../lib/judge/freshness";

const NOW = new Date("2026-08-05T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("freshnessFit", () => {
  it("gives the largest boost to jobs posted within 24 hours", () => {
    const result = freshnessFit(
      { postedAt: new Date(NOW.getTime() - 12 * 60 * 60 * 1000) },
      NOW,
    );
    expect(result.delta).toBe(12);
    expect(result.reason).toMatch(/posted within 24 hours/i);
    expect(result.source).toBe("posted");
  });

  it("uses first-seen time when the posting date is unavailable", () => {
    const result = freshnessFit(
      { firstSeenAt: new Date(NOW.getTime() - 5 * DAY_MS) },
      NOW,
    );
    expect(result.delta).toBe(6);
    expect(result.reason).toMatch(/first seen within 7 days/i);
    expect(result.source).toBe("first-seen");
  });

  it("slightly penalizes postings older than 30 days", () => {
    const result = freshnessFit(
      { postedAt: new Date(NOW.getTime() - 45 * DAY_MS) },
      NOW,
    );
    expect(result.delta).toBe(-4);
    expect(result.reason).toMatch(/more than 30 days ago/i);
  });

  it("stays neutral when no usable date exists", () => {
    expect(freshnessFit({}, NOW)).toEqual({
      delta: 0,
      ageDays: null,
      reason: null,
      source: null,
    });
  });
});
