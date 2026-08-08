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

  it("canonicalizes punctuation and common technology aliases", () => {
    const skills = extractSkills({
      title: "Full-stack Engineer",
      description:
        "Build React.JS and Node JS services on Amazon Web Services with C Sharp, CI-CD, and Postgre SQL.",
    });

    expect(skills).toEqual(
      expect.arrayContaining([
        "react",
        "node.js",
        "aws",
        "c#",
        "ci/cd",
        "postgres",
      ]),
    );
  });

  it("does not treat lowercase prose as ambiguous short skill aliases", () => {
    const prose = extractSkills({
      title: "Engineer",
      description: "You will go to the next planning session and rest after.",
    });
    const technologies = extractSkills({
      title: "Engineer",
      description: "Experience with Go, Next, and REST APIs.",
    });

    expect(prose).not.toEqual(
      expect.arrayContaining(["go", "next.js", "rest"]),
    );
    expect(technologies).toEqual(
      expect.arrayContaining(["go", "next.js", "rest"]),
    );
  });

  it("matches lowercase abbreviations only as whole tokens", () => {
    const abbreviations = extractSkills({
      title: "Engineer",
      description: "Built services with ts, js, and ml tooling.",
    });
    const html = extractSkills({
      title: "Frontend Engineer",
      description: "Build accessible HTML and CSS.",
    });
    const compoundNames = extractSkills({
      title: "Frontend Engineer",
      description: "Build with Node.js, Node JS, and React.JS.",
    });

    expect(abbreviations).toEqual(
      expect.arrayContaining(["typescript", "javascript", "machine learning"]),
    );
    expect(html).not.toContain("machine learning");
    expect(compoundNames).not.toContain("javascript");
  });

  it("normalizes separators without turning ordinary prose into skills", () => {
    const variants = extractSkills({
      title: "Platform Engineer",
      description:
        "Machine-learning with Objective C, scikit_learn, CI–CD, Amazon-Web-Services, and dot net.",
    });
    const prose = extractSkills({
      title: "Generalist",
      description:
        "Next steps: candidates react quickly, express interest, and graduate in Spring 2026 with TS/SCI clearance.",
    });
    const explicit = extractSkills({
      title: "Engineer",
      description: "Experience with go, rust, react, and angular.",
    });

    expect(variants).toEqual(
      expect.arrayContaining([
        "machine learning",
        "objective-c",
        "scikit-learn",
        "ci/cd",
        "aws",
        ".net",
      ]),
    );
    expect(prose).not.toEqual(
      expect.arrayContaining([
        "react",
        "express",
        "spring",
        "typescript",
      ]),
    );
    expect(explicit).toEqual(
      expect.arrayContaining(["go", "rust", "react", "angular"]),
    );
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
