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
  pronouns: "PronounsSentinelXQ",
  pronounsOther: "PronounsOtherSentinelXQ",
  gender: "GenderSentinelXQ",
  genderOther: "GenderOtherSentinelXQ",
  raceEthnicity: "EthnicitySentinelXQ",
  raceEthnicityOther: "EthnicityOtherSentinelXQ",
  veteranStatus: "VeteranSentinelXQ",
  disabilityStatus: "DisabilitySentinelXQ",
  undergraduateGpa: "GpaSentinelXQ",
  graduateGpa: "GraduateGpaSentinelXQ",
  doctorateGpa: "DoctorateGpaSentinelXQ",
  satScore: "SatSentinelXQ",
  actScore: "ActSentinelXQ",
  greScore: "GreSentinelXQ",
  heardAboutJob: "SourceSentinelXQ",
  heardAboutJobOther: "SourceOtherSentinelXQ",
  usCitizenshipStatus: "CitizenshipSentinelXQ",
  usCitizenshipStatusOther: "CitizenshipOtherSentinelXQ",
  caCitizenshipStatus: "CanadaCitizenshipSentinelXQ",
  caCitizenshipStatusOther: "CanadaCitizenshipOtherSentinelXQ",
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
    securityClearances: ["ClearanceSentinelXQ"],
    canPerformEssentialFunctions: true,
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
    expect(blob).not.toContain("clearancesentinelxq");
  });

  it("uses a self-described degree as a qualification signal", () => {
    const ctx = buildResumeContext({
      degree: "Other",
      degreeOther: "Diploma in Software Engineering",
      fieldOfStudy: "Distributed Systems",
    });

    expect(ctx.text).toContain(
      "Education: Diploma in Software Engineering in Distributed Systems",
    );
    expect(ctx.text).not.toContain("Education: Other");
  });

  it("reads shared qualifications and credential names, not autofill-only details", () => {
    const credential = {
      name: "Cloud Developer Certificate",
      issuer: "",
      credentialId: "",
      issueDate: "",
      expirationDate: "",
      doesNotExpire: null,
    };
    const shared: ProfileData = {
      school: "Example University",
      degree: "Bachelor's degree",
      fieldOfStudy: "Computer Science",
      graduationDate: "2026-05",
      relevantExperienceYears: 1.5,
      certifications: [credential],
    };
    const ctx = buildResumeContext(shared);
    expect(ctx.text).toContain("School: Example University");
    expect(ctx.text).toContain("Education: Bachelor's degree in Computer Science");
    expect(ctx.text).toContain("Graduation date: 2026-05");
    expect(ctx.text).toContain("Relevant experience: 1.5 years");
    expect(ctx.text).toContain("Certifications: Cloud Developer Certificate");

    const withAutofillAnswers: ProfileData = {
      ...shared,
      ...PERSONAL,
      educationStartDate: "2022-09",
      graduationDateExact: "2026-05-31",
      softwareIndustryExperienceYears: 40,
      exceptionalWork: "Autofill-only exceptional work",
      currentOrLastEmployer: "Autofill-only employer",
      previousEmployers: ["Autofill-only former employer"],
      compensationExpectation: "$900,000 USD",
      compensationCurrency: "USD",
      compensationFrequency: "Annual",
      homeAddressLine1: "Private home address",
      usLocation: "Private US location",
      caLocation: "Private Canadian location",
      usWorkAuthorized: false,
      usRequiresSponsorship: true,
      caWorkAuthorized: true,
      caRequiresSponsorship: false,
      willingToRelocate: false,
      workExperiences: [
        {
          company: "Autofill-only company",
          title: "Autofill-only title",
          location: "Private office location",
          startDate: "2024-01",
          endDate: "",
          currentRole: true,
          description: "Autofill-only work description",
        },
      ],
      additionalEducation: [
        {
          school: "Autofill-only additional school",
          degree: "Master's degree",
          degreeOther: "",
          fieldOfStudy: "Autofill-only field of study",
          startDate: "2026-09",
          graduationDate: "2028-05",
          gpa: "4.0",
        },
      ],
      languages: [
        {
          language: "Autofill-only language",
          overallProficiency: "Native",
          speakingProficiency: "",
          readingProficiency: "",
          writingProficiency: "",
        },
      ],
      certifications: [
        {
          ...credential,
          issuer: "Autofill-only issuer",
          credentialId: "PRIVATE-123",
          issueDate: "2024-01",
          expirationDate: "2028-01",
          doesNotExpire: false,
        },
      ],
    };
    expect(buildResumeContext(withAutofillAnswers)).toEqual(ctx);
  });

  it("only exposes the four resume context keys", () => {
    const ctx = buildResumeContext(fullyPopulatedProfile());
    expect(Object.keys(ctx).sort()).toEqual(["skills", "summary", "text", "titles"]);
  });
});
