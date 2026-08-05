import { describe, it, expect } from "vitest";
import { parseWithFallback } from "../lib/llm/fallback";

const RESUME = `Jordan Rivera
jordan.rivera@example.com
+1 415 555 0142
https://linkedin.com/in/jordanrivera
https://github.com/jordanrivera
https://jordanrivera.dev

SUMMARY
Full-stack engineer who ships product features end to end.

SKILLS
TypeScript, React, Node.js, PostgreSQL
`;

describe("parseWithFallback (deterministic resume parser)", () => {
  const parsed = parseWithFallback(RESUME);

  it("extracts the name", () => {
    expect(parsed.firstName).toBe("Jordan");
    expect(parsed.lastName).toBe("Rivera");
  });

  it("extracts email + phone", () => {
    expect(parsed.email).toBe("jordan.rivera@example.com");
    expect(parsed.phone).toContain("415");
  });

  it("classifies links", () => {
    expect(parsed.linkedin).toContain("linkedin.com");
    expect(parsed.github).toContain("github.com");
    expect(parsed.website).toContain("jordanrivera.dev");
  });

  it("extracts skills + summary", () => {
    expect(parsed.skills).toContain("TypeScript");
    expect(parsed.summary).toMatch(/full-stack/i);
  });

  it("removes category labels from grouped skill lines", () => {
    const grouped = parseWithFallback(`Sacha Arseneault

TECHNICAL SKILLS
Languages: Go, Python
Frameworks/Libraries: Next, React
Tools: Docker, Git
`);

    expect(grouped.skills).toEqual(["Go", "Python", "Next", "React", "Docker", "Git"]);
  });

  it("degrades gracefully on empty input", () => {
    expect(parseWithFallback("")).toEqual({});
  });
});
