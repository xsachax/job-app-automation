import { describe, it, expect } from "vitest";
import {
  detectAts,
  normalizeUrl,
  extractExternalId,
  canonicalize,
} from "../lib/sources/normalize";
import type { NormalizedJob } from "../lib/sources/types";

describe("detectAts", () => {
  it("identifies known ATS hosts", () => {
    expect(detectAts("https://boards.greenhouse.io/figma/jobs/123")).toBe("greenhouse");
    expect(detectAts("https://jobs.lever.co/palantir/abc")).toBe("lever");
    expect(detectAts("https://jobs.ashbyhq.com/ramp/xyz")).toBe("ashby");
    expect(detectAts("https://acme.wd1.myworkdayjobs.com/careers/job/1")).toBe("workday");
    expect(detectAts("https://careers-acme.icims.com/jobs/1")).toBe("icims");
    expect(detectAts("https://apply.workable.com/j/ABC123")).toBe("workable");
    expect(detectAts("https://vention.na.teamtailor.com/jobs/123")).toBe("teamtailor");
    expect(detectAts("https://example.com/careers/1")).toBe("unknown");
    expect(detectAts("not a url")).toBe("unknown");
  });
});

describe("normalizeUrl", () => {
  it("strips query + fragment + trailing slash", () => {
    expect(normalizeUrl("https://x.com/jobs/9/?utm_source=foo#apply")).toBe(
      "https://x.com/jobs/9",
    );
  });
  it.each([
    [
      "https://careers.withwaymo.com/jobs?gh_jid=8049315&utm_source=greenhouse#apply",
      "https://careers.withwaymo.com/jobs?gh_jid=8049315",
    ],
    [
      "https://www.hudsonrivertrading.com/careers/job/?gh_jid=7972593&gh_src=abc",
      "https://www.hudsonrivertrading.com/careers/job/?gh_jid=7972593",
    ],
  ])("preserves Greenhouse job identifiers in %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
  it("returns input unchanged when not a URL", () => {
    expect(normalizeUrl("  garbage ")).toBe("garbage");
  });
});

describe("extractExternalId", () => {
  it("pulls greenhouse numeric ids", () => {
    expect(
      extractExternalId("greenhouse", "https://boards.greenhouse.io/figma/jobs/456"),
    ).toBe("456");
  });
  it("pulls lever/ashby uuids", () => {
    const uuid = "12345678-1234-1234-1234-1234567890ab";
    expect(extractExternalId("lever", `https://jobs.lever.co/x/${uuid}`)).toBe(uuid);
  });
  it("prefers a provided id", () => {
    expect(extractExternalId("greenhouse", "https://x/jobs/1", "explicit")).toBe("explicit");
  });
  it("uses the canonical URL job id for iCIMS instead of an aggregator id", () => {
    expect(
      extractExternalId(
        "icims",
        "https://careers-rivian.icims.com/jobs/32343/software-engineer/job",
        "feed-row-uuid",
      ),
    ).toBe("32343");
  });
});

function job(over: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    title: "Software Engineer",
    company: "Acme",
    location: "Remote",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1001",
    atsType: "greenhouse",
    externalId: "1001",
    ...over,
  };
}

describe("canonicalize (dedup identity)", () => {
  it("uses atsType:externalId as the dedupe key when available", () => {
    const c = canonicalize(job());
    expect(c.dedupeKey).toBe("greenhouse:1001");
    expect(c.fingerprint).toMatch(/^fp:[0-9a-f]{40}$/);
  });

  it("collapses the same posting seen via different URLs / sources", () => {
    const a = canonicalize(job({ applyUrl: "https://boards.greenhouse.io/acme/jobs/1001?utm=x" }));
    const b = canonicalize(
      job({ applyUrl: "https://job-boards.greenhouse.io/acme/jobs/1001", externalId: null }),
    );
    expect(a.dedupeKey).toBe(b.dedupeKey); // cross-source dedup
  });

  it("collapses iCIMS listings that use different source-local ids", () => {
    const first = canonicalize(
      job({
        applyUrl: "https://careers-rivian.icims.com/jobs/32343/software-engineer/job",
        atsType: "icims",
        externalId: "aggregator-a",
      }),
    );
    const second = canonicalize(
      job({
        applyUrl: "https://careers-rivian.icims.com/jobs/32343/software-engineer/job?mobile=false",
        atsType: "icims",
        externalId: "aggregator-b",
      }),
    );
    expect(first.dedupeKey).toBe("icims:32343");
    expect(second.dedupeKey).toBe(first.dedupeKey);
  });

  it("falls back to a fingerprint key for unknown ATS", () => {
    const c = canonicalize(
      job({ applyUrl: "https://careers.acme.com/1", atsType: undefined, externalId: null }),
    );
    expect(c.dedupeKey.startsWith("fp:")).toBe(true);
  });

  it("gives reposts (new id, same role) the same fingerprint", () => {
    const first = canonicalize(job({ externalId: "1001" }));
    const repost = canonicalize(
      job({ externalId: "2002", applyUrl: "https://boards.greenhouse.io/acme/jobs/2002" }),
    );
    expect(first.fingerprint).toBe(repost.fingerprint);
    expect(first.dedupeKey).not.toBe(repost.dedupeKey);
  });

  it("ignores seniority markers in the fingerprint so 'Senior X' == 'X'", () => {
    const base = canonicalize(job({ title: "Software Engineer" }));
    const senior = canonicalize(job({ title: "Senior Software Engineer" }));
    expect(base.fingerprint).toBe(senior.fingerprint);
  });
});
