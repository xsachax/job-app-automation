import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCOVERY_CONFIG,
  normalizeDiscoveryConfig,
} from "../lib/discovery/config";
import {
  DEFAULT_GOLDEN_JOB_CONFIG,
  GOLDEN_JOB_SCORE_FLOOR,
  applyGoldenJobScoreFloor,
  historicalGoldenJobMatch,
  matchGoldenJob,
  normalizeGoldenJobConfig,
  normalizeGoldenKeyword,
  normalizeGoldenKeywords,
} from "../lib/jobs/golden";

describe("golden job configuration", () => {
  it("normalizes punctuation, case, whitespace, and duplicate keywords", () => {
    expect(normalizeGoldenKeyword("  NEW-Grad / 2027  ")).toBe(
      "new grad 2027",
    );
    expect(
      normalizeGoldenKeywords([
        " New-Grad ",
        "new grad",
        "Class_of_2027",
        "",
      ]),
    ).toEqual(["new grad", "class of 2027"]);
  });

  it("supplies typed defaults for old stored discovery configs", () => {
    const normalized = normalizeDiscoveryConfig({
      ...DEFAULT_DISCOVERY_CONFIG,
      goldenJobs: undefined,
    });

    expect(normalized.goldenJobs).toEqual(DEFAULT_GOLDEN_JOB_CONFIG);
    expect(normalized.goldenJobs.titleKeywords).toContain("2027");
    expect(normalized.goldenJobs.descriptionKeywords).not.toContain(
      "graduate",
    );
  });

  it("normalizes editable config and honors the enable switch", () => {
    const config = normalizeGoldenJobConfig({
      enabled: false,
      titleKeywords: [" NEW-GRAD ", "new grad", " Graduate "],
      descriptionKeywords: [" Class of 2027 "],
    });

    expect(config).toEqual({
      enabled: false,
      titleKeywords: ["new grad", "graduate"],
      descriptionKeywords: ["class of 2027"],
    });
    expect(
      matchGoldenJob({ title: "Software Engineer, New Grad" }, config),
    ).toBeNull();
  });
});

describe("golden job matching", () => {
  it.each([
    [{ title: "Software Engineer, New Grad" }, "title", "new grad"],
    [{ title: "Graduate Software Engineer" }, "title", "graduate"],
    [{ title: "2027 Software Engineering Program" }, "title", "2027"],
    [
      {
        title: "Software Engineer",
        description: "Designed for candidates graduating in 2027.",
      },
      "description",
      "graduating in 2027",
    ],
    [
      {
        title: "Software Engineer",
        description: "We welcome recent-graduate applicants.",
      },
      "description",
      "recent graduate",
    ],
  ])(
    "matches precise early-career signals in the configured field",
    (candidate, field, keyword) => {
      expect(matchGoldenJob(candidate, DEFAULT_GOLDEN_JOB_CONFIG)).toEqual({
        field,
        keyword,
      });
    },
  );

  it.each([
    {
      title: "Undergraduate Research Software Engineer",
      description: "An undergraduate degree in computer science is required.",
    },
    {
      title: "Under-Graduate Research Software Engineer",
      description: "An undergraduate degree in computer science is required.",
    },
    {
      title: "Post-Graduate Software Researcher",
      description: "A graduate degree is required.",
    },
    {
      title: "Non-Graduate Software Internship",
      description: "Applicants do not need a degree.",
    },
    {
      title: "Software Engineer",
      description: "A graduate degree or equivalent experience is preferred.",
    },
    {
      title: "Postgraduate Systems Engineer",
      description: "Bachelor's degree required.",
    },
    {
      title: "Software Engineer",
      description: "Copyright 2027. All rights reserved.",
    },
    {
      title: "Software Engineer",
      description: "Must have graduated from an accredited undergraduate program.",
    },
  ])("rejects ordinary education and incidental-year text", (candidate) => {
    expect(matchGoldenJob(candidate, DEFAULT_GOLDEN_JOB_CONFIG)).toBeNull();
  });

  it("uses only user-configured phrases", () => {
    const config = normalizeGoldenJobConfig({
      enabled: true,
      titleKeywords: ["campus launch"],
      descriptionKeywords: [],
    });

    expect(
      matchGoldenJob({ title: "Campus-Launch Software Engineer" }, config),
    ).toEqual({ field: "title", keyword: "campus launch" });
    expect(
      matchGoldenJob({ title: "Software Engineer, New Grad" }, config),
    ).toBeNull();
  });

  it("raises only golden matches to the fixed floor", () => {
    const match = { field: "title", keyword: "new grad" } as const;
    expect(applyGoldenJobScoreFloor(12, match)).toBe(
      GOLDEN_JOB_SCORE_FLOOR,
    );
    expect(applyGoldenJobScoreFloor(97, match)).toBe(97);
    expect(applyGoldenJobScoreFloor(12, null)).toBe(12);
  });

  it("restores archived Golden metadata only from stored Judge evidence", () => {
    expect(
      historicalGoldenJobMatch(
        JSON.stringify([
          'Fit: Golden job: title matches "New-Grad"; final Judge score floor is 95',
        ]),
      ),
    ).toEqual({ field: "title", keyword: "new grad" });
    expect(
      historicalGoldenJobMatch(
        JSON.stringify(["Fit: Strong résumé overlap"]),
      ),
    ).toBeNull();
  });
});
