import { describe, it, expect } from "vitest";
import { classifyEntryLevel, isSoftwareRole } from "../lib/discovery/entryLevel";
import { DEFAULT_DISCOVERY_CONFIG, toEntryLevelOptions } from "../lib/discovery/config";

describe("config-driven classifier", () => {
  it("defaults reproduce the historical entry-level behavior", () => {
    const opts = toEntryLevelOptions(DEFAULT_DISCOVERY_CONFIG);
    expect(classifyEntryLevel({ title: "Software Engineer I" }, opts).isEntryLevel).toBe(true);
    expect(classifyEntryLevel({ title: "Senior Software Engineer" }, opts).isEntryLevel).toBe(false);
    expect(
      classifyEntryLevel(
        { title: "Software Engineer", description: "3 years of experience required." },
        opts,
      ).isEntryLevel,
    ).toBe(false);
  });

  it("excludes internships by default and includes them when configured", () => {
    const title = "Software Engineering Intern";
    expect(classifyEntryLevel({ title }).isInternship).toBe(true);
    expect(classifyEntryLevel({ title }).isEntryLevel).toBe(false);

    const opts = toEntryLevelOptions({ ...DEFAULT_DISCOVERY_CONFIG, includeInternships: true });
    expect(classifyEntryLevel({ title }, opts).isEntryLevel).toBe(true);
  });

  it("honors a structured internship level supplied by an ATS", () => {
    const input = {
      title: "Software Developer",
      description: "Experience level: Internship.",
    };
    expect(classifyEntryLevel(input).isEntryLevel).toBe(false);
    expect(
      classifyEntryLevel(input, { includeInternships: true }).isEntryLevel,
    ).toBe(true);
  });

  it("rejects a structured mid-senior level supplied by an ATS", () => {
    const verdict = classifyEntryLevel({
      title: "Software Developer",
      description: "Experience level: Mid-Senior level.",
    });
    expect(verdict.hasSeniorTitle).toBe(true);
    expect(verdict.isEntryLevel).toBe(false);
  });

  it("raises the YoE ceiling when configured", () => {
    const desc = "5 years of experience required.";
    expect(classifyEntryLevel({ title: "Software Engineer", description: desc }).isEntryLevel).toBe(false);
    const opts = toEntryLevelOptions({ ...DEFAULT_DISCOVERY_CONFIG, maxYoE: 6 });
    expect(classifyEntryLevel({ title: "Software Engineer", description: desc }, opts).isEntryLevel).toBe(true);
  });

  it("stops excluding advanced degrees when configured off", () => {
    const desc = "Master's degree or PhD required.";
    expect(classifyEntryLevel({ title: "Software Engineer", description: desc }).isEntryLevel).toBe(false);
    const opts = toEntryLevelOptions({ ...DEFAULT_DISCOVERY_CONFIG, excludeAdvancedDegree: false });
    expect(classifyEntryLevel({ title: "Software Engineer", description: desc }, opts).isEntryLevel).toBe(true);
  });

  it("broadens scope with extra role keywords", () => {
    // "Data Scientist" isn't in the built-in software vocabulary.
    expect(isSoftwareRole("Data Scientist")).toBe(false);
    const opts = toEntryLevelOptions({ ...DEFAULT_DISCOVERY_CONFIG, roleKeywords: ["data scientist"] });
    expect(isSoftwareRole("Data Scientist", opts)).toBe(true);
    expect(classifyEntryLevel({ title: "Data Scientist" }, opts).isEntryLevel).toBe(true);
  });

  it("narrows scope with extra exclude keywords", () => {
    expect(isSoftwareRole("Software Engineer")).toBe(true);
    const opts = toEntryLevelOptions({ ...DEFAULT_DISCOVERY_CONFIG, excludeTitleKeywords: ["software engineer"] });
    expect(isSoftwareRole("Software Engineer", opts)).toBe(false);
  });
});
