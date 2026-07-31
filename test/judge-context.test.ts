import { describe, it, expect } from "vitest";
import { buildResumeContext } from "../lib/judge/judge";
import type { ProfileData } from "../lib/settings";

// Distinctive sentinels so a match can only come from the actual field, never
// from an ordinary word that happens to appear in a resume signal.
const PERSONAL = {
  firstName: "Zylphara",
  lastName: "Quibberton",
  email: "zq-private@example-secret.test",
  phone: "+1-555-0142-9987",
  location: "Timbuktu Heights, Nowhereland",
  linkedin: "https://linkedin.com/in/zylphara-quibberton-secret",
  github: "https://github.com/zq-hidden-handle",
  website: "https://zq-personal-site.test",
  portfolio: "https://zq-portfolio-hidden.test",
  gender: "GenderSentinelXQ",
  raceEthnicity: "EthnicitySentinelXQ",
  veteranStatus: "VeteranSentinelXQ",
  disabilityStatus: "DisabilitySentinelXQ",
} as const;

function fullyPopulatedProfile(): ProfileData {
  return {
    ...PERSONAL,
    workAuthorized: true,
    requiresSponsorship: true,
    // Legitimate resume-derived signals the judge *should* read.
    skills: ["TypeScript", "React", "PostgreSQL"],
    targetRoles: ["Software Engineer", "Full-stack Developer"],
    titles: ["Backend Engineer"],
    summary: "Entry-level engineer building reliable web systems.",
    qualifications: "B.S. Computer Science, 2026. Internship at a fintech startup.",
    resumeText: "Experienced with distributed systems and Node.js services.",
    coverLetterTemplate: "Dear hiring manager, ZylpharaCoverSentinel ...",
  };
}

describe("buildResumeContext — judge input", () => {
  it("includes the resume-derived signals the judge ranks on", () => {
    const ctx = buildResumeContext(fullyPopulatedProfile());
    expect(ctx.skills).toContain("TypeScript");
    expect(ctx.titles).toContain("Software Engineer");
    expect(ctx.titles).toContain("Backend Engineer");
    expect(ctx.summary).toContain("reliable web systems");
    expect(ctx.text).toContain("distributed systems");
    expect(ctx.text).toContain("B.S. Computer Science");
  });

  it("never leaks personal identity, contact, or demographic fields", () => {
    const ctx = buildResumeContext(fullyPopulatedProfile());
    const blob = JSON.stringify(ctx).toLowerCase();
    for (const [field, value] of Object.entries(PERSONAL)) {
      expect(blob, `judge input leaked ${field}`).not.toContain(value.toLowerCase());
    }
    // The cover-letter template is also personal boilerplate, not a fit signal.
    expect(blob).not.toContain("zylpharacoversentinel");
  });

  it("only exposes the four resume context keys", () => {
    const ctx = buildResumeContext(fullyPopulatedProfile());
    expect(Object.keys(ctx).sort()).toEqual(["skills", "summary", "text", "titles"]);
  });
});
