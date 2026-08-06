import { describe, it, expect } from "vitest";
import {
  classifyCountry,
  classifyEntryLevel,
  isSoftwareRole,
} from "../lib/discovery/entryLevel";

describe("classifyCountry", () => {
  it("recognizes US formats (cities, states, abbrevs, bare US)", () => {
    expect(classifyCountry("San Francisco, CA, United States")).toBe("US");
    expect(classifyCountry("New York, NY")).toBe("US");
    expect(classifyCountry("Austin, Texas")).toBe("US");
    expect(classifyCountry("Remote - US: Select locations")).toBe("US");
    expect(classifyCountry("Seattle, Washington, United States of America")).toBe("US");
    // Bare ", CA" is California (a board's most common US format), not Canada.
    expect(classifyCountry("Berkeley, CA")).toBe("US");
    expect(classifyCountry("San Jose, CA")).toBe("US");
  });

  it("recognizes Canadian formats", () => {
    expect(classifyCountry("Toronto, ON, Canada")).toBe("CA");
    expect(classifyCountry("Vancouver, British Columbia")).toBe("CA");
    expect(classifyCountry("Remote - Canada: Select locations")).toBe("CA");
    expect(classifyCountry("Montréal, QC")).toBe("CA");
  });

  it("returns OTHER for non-US/CA and empty", () => {
    expect(classifyCountry("London, United Kingdom")).toBe("OTHER");
    expect(classifyCountry("Remote - Poland")).toBe("OTHER");
    expect(classifyCountry("")).toBe("OTHER");
    expect(classifyCountry(null)).toBe("OTHER");
  });
});

describe("isSoftwareRole", () => {
  it("accepts software titles", () => {
    expect(isSoftwareRole("Software Engineer")).toBe(true);
    expect(isSoftwareRole("Backend Developer")).toBe(true);
    expect(isSoftwareRole("Machine Learning Engineer")).toBe(true);
    expect(isSoftwareRole("Site Reliability Engineer")).toBe(true);
    expect(isSoftwareRole("DevOps Engineer")).toBe(true);
    expect(isSoftwareRole("Search Relevance Engineers")).toBe(true);
  });

  it("rejects non-software roles", () => {
    expect(isSoftwareRole("Account Manager")).toBe(false);
    expect(isSoftwareRole("Sales Engineer")).toBe(false);
    expect(isSoftwareRole("Mechanical Engineer")).toBe(false);
    expect(isSoftwareRole("Product Designer")).toBe(false);
  });
});

describe("classifyEntryLevel", () => {
  it("accepts explicit entry-level software roles", () => {
    expect(classifyEntryLevel({ title: "Software Engineer I" }).isEntryLevel).toBe(true);
    expect(classifyEntryLevel({ title: "New Grad Software Engineer" }).isEntryLevel).toBe(true);
    expect(classifyEntryLevel({ title: "Junior Backend Developer" }).isEntryLevel).toBe(true);
    expect(classifyEntryLevel({ title: "University Graduate, Software Engineer" }).isEntryLevel).toBe(true);
  });

  it("accepts plain software roles with no YoE specified", () => {
    expect(classifyEntryLevel({ title: "Software Engineer", description: "Build things." }).isEntryLevel).toBe(true);
  });

  it("rejects senior / mid roles including numeric levels", () => {
    expect(classifyEntryLevel({ title: "Senior Software Engineer" }).isEntryLevel).toBe(false);
    expect(classifyEntryLevel({ title: "Staff Software Engineer" }).isEntryLevel).toBe(false);
    expect(classifyEntryLevel({ title: "Software Engineer II" }).isEntryLevel).toBe(false);
    expect(classifyEntryLevel({ title: "Full Stack Software Engineer 5 - Partner" }).isEntryLevel).toBe(false);
    expect(classifyEntryLevel({ title: "Engineering Manager" }).isEntryLevel).toBe(false);
  });

  it("rejects roles requiring high years of experience", () => {
    const v = classifyEntryLevel({
      title: "Software Engineer",
      description: "Requires 8+ years of experience building distributed systems.",
    });
    expect(v.isEntryLevel).toBe(false);
  });

  it("keeps roles that mention low YoE (0-2 years)", () => {
    const v = classifyEntryLevel({
      title: "Software Engineer",
      description: "0-2 years of experience. Bachelor's degree in CS or equivalent.",
    });
    expect(v.isEntryLevel).toBe(true);
  });

  it("allows up to 2 years of experience but rejects 3+", () => {
    expect(
      classifyEntryLevel({ title: "Software Engineer", description: "2 years of experience required." }).isEntryLevel,
    ).toBe(true);
    expect(
      classifyEntryLevel({ title: "Software Engineer", description: "Up to 2 years of experience." }).isEntryLevel,
    ).toBe(true);
    expect(
      classifyEntryLevel({ title: "Software Engineer", description: "2+ years of experience." }).isEntryLevel,
    ).toBe(true);
    expect(
      classifyEntryLevel({ title: "Software Engineer", description: "3 years of experience required." }).isEntryLevel,
    ).toBe(false);
    expect(
      classifyEntryLevel({ title: "Software Engineer", description: "Minimum of 4 years of experience." }).isEntryLevel,
    ).toBe(false);
  });

  it("ignores benefit-tenure dates that are not experience requirements", () => {
    const verdict = classifyEntryLevel({
      title: "Software Engineer",
      description:
        "Early-career role building web products. Benefits include a paid sabbatical after 5 years of service.",
    });

    expect(verdict.minYearsExperience).toBeNull();
    expect(verdict.isEntryLevel).toBe(true);

    expect(
      classifyEntryLevel({
        title: "Software Engineer",
        description:
          "No previous experience required. 401(k) vesting occurs over 3 years.",
      }).minYearsExperience,
    ).toBeNull();
    expect(
      classifyEntryLevel({
        title: "Software Engineer",
        description: "Equity awards vest over 3-4 years.",
      }).minYearsExperience,
    ).toBeNull();
  });

  it("recognizes experience under plural qualification headings", () => {
    const verdict = classifyEntryLevel({
      title: "Software Engineer",
      description: "Qualifications:\n3 years of software development.",
    });

    expect(verdict.minYearsExperience).toBe(3);
    expect(verdict.isEntryLevel).toBe(false);

    const lowerBound = classifyEntryLevel({
      title: "Software Engineer",
      description: "At least 5 years working with React.",
    });
    expect(lowerBound.minYearsExperience).toBe(5);
    expect(lowerBound.isEntryLevel).toBe(false);
  });

  it("rejects roles requiring an advanced degree", () => {
    const v = classifyEntryLevel({
      title: "Machine Learning Engineer",
      description: "A PhD is required in machine learning or a related field.",
    });
    expect(v.isEntryLevel).toBe(false);
    expect(v.requiresAdvancedDegree).toBe(true);
  });

  it("keeps roles where a Master's is only preferred / bachelor's accepted", () => {
    const v = classifyEntryLevel({
      title: "Software Engineer",
      description: "Bachelor's degree required; Master's degree or equivalent experience preferred.",
    });
    expect(v.isEntryLevel).toBe(true);
  });
});
