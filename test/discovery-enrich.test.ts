import { describe, it, expect } from "vitest";
import {
  extractSkills,
  extractSalary,
  classifySponsorship,
  classifyEmploymentType,
  enrich,
} from "../lib/discovery/enrich";

describe("extractSkills", () => {
  it("finds languages and frameworks in title + description", () => {
    const skills = extractSkills({
      title: "Software Engineer, Backend",
      description: "You will work with Python, Go and PostgreSQL on Kubernetes.",
    });
    expect(skills).toContain("python");
    expect(skills).toContain("go");
    expect(skills).toContain("postgres"); // canonicalized from postgresql
    expect(skills).toContain("kubernetes");
  });

  it("does not match substrings of unrelated words", () => {
    // "rust" must not match inside "trust", "go" not inside "good".
    const skills = extractSkills({ title: "Engineer", description: "We value trust and good work." });
    expect(skills).not.toContain("rust");
    expect(skills).not.toContain("go");
  });

  it("matches multi-word skills", () => {
    const skills = extractSkills({
      title: "ML Engineer",
      description: "Experience with machine learning and computer vision required.",
    });
    expect(skills).toContain("machine learning");
    expect(skills).toContain("computer vision");
  });
});

describe("extractSalary", () => {
  it("parses a plain dollar range", () => {
    const s = extractSalary({ description: "The base pay range is $120,000 - $150,000 per year." });
    expect(s.min).toBe(120000);
    expect(s.max).toBe(150000);
    expect(s.currency).toBe("USD");
  });

  it("parses a k-suffixed range", () => {
    const s = extractSalary({ compensation: "$130k–$160k" });
    expect(s.min).toBe(130000);
    expect(s.max).toBe(160000);
  });

  it("detects CAD", () => {
    const s = extractSalary({ description: "Compensation: CAD $95,000 - $120,000", country: "CA" });
    expect(s.currency).toBe("CAD");
    expect(s.min).toBe(95000);
  });

  it("defaults currency by country when unmarked", () => {
    const s = extractSalary({ description: "$100,000 - $110,000", country: "CA" });
    expect(s.currency).toBe("CAD");
  });

  it("ignores implausible / hourly figures", () => {
    const s = extractSalary({ description: "Pay is $35/hour depending on experience." });
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
  });
});

describe("classifySponsorship", () => {
  it("honors a first-class board value", () => {
    expect(classifySponsorship({ sponsorship: "Offers Sponsorship" })).toBe("offers");
    expect(classifySponsorship({ sponsorship: "Does Not Offer Sponsorship" })).toBe("none");
    expect(classifySponsorship({ sponsorship: "U.S. Citizenship is Required" })).toBe("citizenship");
    expect(classifySponsorship({ sponsorship: "Other" })).toBe("unknown");
  });

  it("parses citizenship / clearance from the description", () => {
    expect(
      classifySponsorship({ description: "This role requires an active security clearance." }),
    ).toBe("citizenship");
    expect(
      classifySponsorship({ description: "Must be a U.S. citizen to be considered." }),
    ).toBe("citizenship");
  });

  it("parses a no-sponsorship statement", () => {
    expect(
      classifySponsorship({ description: "We are unable to provide visa sponsorship for this role." }),
    ).toBe("none");
  });

  it("parses an offers statement", () => {
    expect(
      classifySponsorship({ description: "Visa sponsorship is available for this position." }),
    ).toBe("offers");
  });

  it("returns unknown when silent", () => {
    expect(classifySponsorship({ description: "Great role on a great team." })).toBe("unknown");
  });
});

describe("classifyEmploymentType", () => {
  it("detects intern via flag or title", () => {
    expect(classifyEmploymentType({ title: "Software Engineer", isInternship: true })).toBe("intern");
    expect(classifyEmploymentType({ title: "Software Engineering Intern" })).toBe("intern");
  });

  it("detects contract", () => {
    expect(classifyEmploymentType({ title: "Software Engineer (Contract)" })).toBe("contract");
  });

  it("defaults to fulltime", () => {
    expect(classifyEmploymentType({ title: "Software Engineer" })).toBe("fulltime");
  });
});

describe("enrich (combined)", () => {
  it("produces a full enrichment record", () => {
    const e = enrich({
      title: "Junior Backend Engineer",
      description: "Work with TypeScript and AWS. Base salary $110,000 - $130,000. Visa sponsorship available.",
      country: "US",
    });
    expect(e.skills).toContain("typescript");
    expect(e.skills).toContain("aws");
    expect(e.salaryMin).toBe(110000);
    expect(e.salaryMax).toBe(130000);
    expect(e.sponsorship).toBe("offers");
    expect(e.employmentType).toBe("fulltime");
  });
});
