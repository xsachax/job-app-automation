import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  commonQuestionCorpus,
  guardedQuestionCorpus,
} from "./fixtures/chrome-extension-common-questions";

interface MatchDefinition {
  definition: { key: string; label: string };
  score: number;
}

interface Matcher {
  normalizeText(value: string): string;
  choiceSearchQueries(savedValue: string, fieldKey?: string): string[];
  contextualLocationChoice(
    savedValue: string,
    country: string,
  ): string | null;
  scoreChoice(
    savedValue: string,
    optionValue: string,
    optionLabel: string,
    fieldKey?: string,
  ): number;
  scoreSafeFallback(
    fieldKey: string,
    optionValue: string,
    optionLabel: string,
  ): number;
  findBestDefinition(
    context: {
      autocomplete?: string;
      signals: { text: string; weight: number; source?: string }[];
      controlKind: string;
      optionTexts?: string[];
    },
    definitions: unknown[],
  ): MatchDefinition | null;
  analyzeDefinition(
    context: {
      autocomplete?: string;
      signals: { text: string; weight: number; source?: string }[];
      controlKind: string;
      optionTexts?: string[];
    },
    definitions: unknown[],
  ): {
    status: "none" | "uncertain" | "confident";
    match: MatchDefinition | null;
    confidence: number;
    candidates: MatchDefinition[];
    reason: string;
  };
  equivalentCandidateMatch(
    analysis: {
      status: "none" | "uncertain" | "confident";
      candidates: MatchDefinition[];
    },
    profile: Record<string, string>,
  ): MatchDefinition | null;
  resolveEligibilityAnswer(
    definitionKey: string,
    signals: { text: string; weight: number; source?: string }[],
    profile: Record<string, string>,
  ): string;
  resolvePreviousEmployerAnswer(
    signals: { text: string; weight: number; source?: string }[],
    savedEmployers: string,
    currentCompany?: string,
  ): string;
}

interface ProfileSchema {
  fields: unknown[];
  buildEffectiveProfile(
    profile: Record<string, string>,
    context?: {
      company?: string;
      jobTitle?: string;
      title?: string;
      country?: string;
    },
  ): Record<string, string>;
  formatControlValue(value: string, controlKind: string): string;
  sanitizeStoredProfile(profile: unknown): Record<string, string>;
}

const require = createRequire(import.meta.url);
const matcher = require("../apps/chrome-extension/lib/field-matcher.js") as Matcher;
const profileSchema = require(
  "../apps/chrome-extension/lib/profile-schema.js",
) as ProfileSchema;

describe("Chrome extension profile storage", () => {
  it("keeps only known, bounded profile fields", () => {
    const profile = profileSchema.sanitizeStoredProfile({
      firstName: " Jane ",
      workAuthorization: "maybe",
      requiresSponsorship: "no",
      country: "United States",
      school: "University of Ottawa",
      degree: "Bachelor's degree",
      undergraduateGpa: "3.85",
      satScore: "9999",
      actScore: "36",
      graduationDate: "2025-05",
      canPerformEssentialFunctions: "yes",
      pronouns: "They/them",
      pronounsOther: "Ze/hir",
      gender: "Non-binary",
      raceEthnicity: "Middle Eastern or North African",
      disabilityStatus: "no",
      veteranStatus: "Not a protected veteran",
      heardAboutJob: "LinkedIn",
      softwareIndustryExperienceYears: "2.5",
      previousEmployers: `Cisco\n${"x".repeat(5_100)}`,
      compensationExpectation: "$150,000 USD",
      preferredOfficeLocations: "New York, NY\nToronto, ON",
      hispanicLatino: "no",
      transgenderStatus: "Prefer not to answer",
      usLocation: "New York, NY",
      usWorkAuthorization: "yes",
      caLocation: "Toronto, ON",
      caWorkAuthorization: "no",
      spacexEmploymentHistory: "Never employed",
      coverLetter: ` ${"x".repeat(20_100)} `,
      unexpectedSecret: "drop me",
    });

    expect(profile.firstName).toBe("Jane");
    expect(profile.workAuthorization).toBe("");
    expect(profile.requiresSponsorship).toBe("no");
    expect(profile.country).toBe("United States");
    expect(profile.school).toBe("University of Ottawa");
    expect(profile.degree).toBe("Bachelor's degree");
    expect(profile.undergraduateGpa).toBe("3.85");
    expect(profile.satScore).toBe("");
    expect(profile.actScore).toBe("36");
    expect(profile.graduationDate).toBe("2025-05");
    expect(profile.canPerformEssentialFunctions).toBe("yes");
    expect(profile.pronouns).toBe("They/them");
    expect(profile.pronounsOther).toBe("Ze/hir");
    expect(profile.gender).toBe("Non-binary");
    expect(profile.raceEthnicity).toBe("Middle Eastern or North African");
    expect(profile.disabilityStatus).toBe("no");
    expect(profile.veteranStatus).toBe("Not a protected veteran");
    expect(profile.heardAboutJob).toBe("LinkedIn");
    expect(profile.softwareIndustryExperienceYears).toBe("2.5");
    expect(profile.previousEmployers).toHaveLength(5_000);
    expect(profile.compensationExpectation).toBe("$150,000 USD");
    expect(profile.preferredOfficeLocations).toBe("New York, NY\nToronto, ON");
    expect(profile.hispanicLatino).toBe("no");
    expect(profile.transgenderStatus).toBe("Prefer not to answer");
    expect(profile.usLocation).toBe("New York, NY");
    expect(profile.usWorkAuthorization).toBe("yes");
    expect(profile.caLocation).toBe("Toronto, ON");
    expect(profile.caWorkAuthorization).toBe("no");
    expect(profile.coverLetter).toHaveLength(20_000);
    expect(profile).not.toHaveProperty("unexpectedSecret");
    expect(profile).not.toHaveProperty("spacexEmploymentHistory");
    expect(() => profileSchema.sanitizeStoredProfile(null)).toThrow(
      "The autofill profile is invalid.",
    );
  });

  it("renders supported cover-letter placeholders for the active job", () => {
    expect(
      profileSchema.buildEffectiveProfile(
        {
          firstName: "Jane",
          lastName: "Doe",
          coverLetter:
            "Dear {{ company }} team,\nI am applying for {{title}}.\n{{firstName}} {{lastName}}",
        },
        { company: "Acme", jobTitle: "Software Engineer" },
      ).coverLetter,
    ).toBe(
      "Dear Acme team,\nI am applying for Software Engineer.\nJane Doe",
    );

    expect(
      profileSchema.buildEffectiveProfile(
        {
          firstName: "Jane",
          coverLetter: "Dear {{company}} team,\n{{firstName}}",
        },
        { jobTitle: "Software Engineer" },
      ).coverLetter,
    ).toBe("");
  });

  it("derives the application country without storing an address", () => {
    expect(
      profileSchema.buildEffectiveProfile({}, { country: "CA" }).country,
    ).toBe("Canada");
    expect(
      profileSchema.buildEffectiveProfile({}, { country: "US" }).country,
    ).toBe("United States");
    expect(profileSchema.buildEffectiveProfile({ country: "Canada" }).country).toBe(
      "Canada",
    );
    expect(profileSchema.sanitizeStoredProfile({ addressLine1: "secret" })).not
      .toHaveProperty("addressLine1");
  });

  it("derives split location and phone values used by ATS forms", () => {
    expect(
      profileSchema.buildEffectiveProfile(
        {
          location: "Toronto, ON, Canada",
          phone: "+1 (416) 555-0199",
        },
        { country: "CA" },
      ),
    ).toMatchObject({
      city: "Toronto",
      region: "ON",
      country: "Canada",
      phoneCountryCode: "+1",
      phoneNational: "(416) 555-0199",
    });

    expect(
      profileSchema.buildEffectiveProfile({
        phone: "+14165550199",
      }),
    ).toMatchObject({
      phoneCountryCode: "+1",
      phoneNational: "4165550199",
    });
    expect(
      profileSchema.buildEffectiveProfile(
        { phone: "+44 20 7946 0958" },
        { country: "US" },
      ),
    ).toMatchObject({
      phoneCountryCode: "+44",
      phoneNational: "20 7946 0958",
    });
    expect(
      profileSchema.buildEffectiveProfile({ graduationDate: "2025-05" }),
    ).toMatchObject({
      graduationDate: "May 2025",
      graduationDateInput: "2025-05",
      graduationMonth: "May",
      graduationYear: "2025",
    });
  });

  it("selects the active country's stored autofill answers", () => {
    const stored = {
      usLocation: "New York, NY",
      usWorkAuthorization: "yes",
      usRequiresSponsorship: "no",
      usCitizenshipStatus: "U.S. citizen",
      caLocation: "Toronto, ON",
      caWorkAuthorization: "no",
      caRequiresSponsorship: "yes",
      caCitizenshipStatus: "Permanent resident",
    };

    expect(
      profileSchema.buildEffectiveProfile(stored, { country: "US" }),
    ).toMatchObject({
      location: "New York, NY",
      city: "New York",
      workAuthorization: "yes",
      requiresSponsorship: "no",
      citizenshipStatus: "U.S. citizen",
    });
    expect(
      profileSchema.buildEffectiveProfile(stored, { country: "CA" }),
    ).toMatchObject({
      location: "Toronto, ON",
      city: "Toronto",
      workAuthorization: "no",
      requiresSponsorship: "yes",
      citizenshipStatus: "Permanent resident",
    });
    expect(
      profileSchema.buildEffectiveProfile(
        {
          usCitizenshipStatus: "U.S. citizen",
          usCitizenshipStatusOther: "Stale detail",
          citizenshipStatusOther: "Stale fallback",
          caCitizenshipStatus: "Permanent resident",
          caCitizenshipStatusOther: "Stale Canada detail",
        },
        { country: "US" },
      ),
    ).toMatchObject({
      citizenshipStatusOther: "",
      usCitizenshipStatusOther: "",
      caCitizenshipStatusOther: "",
    });
  });
});

describe("Chrome extension field matching", () => {
  it("matches autocomplete metadata and common labels", () => {
    const email = matcher.findBestDefinition(
      {
        autocomplete: "email",
        signals: [{ text: "Contact", weight: 1 }],
        controlKind: "text",
      },
      profileSchema.fields,
    );
    const linkedIn = matcher.findBestDefinition(
      {
        signals: [{ text: "LinkedIn profile URL", weight: 1 }],
        controlKind: "text",
      },
      profileSchema.fields,
    );
    const github = matcher.findBestDefinition(
      {
        signals: [{ text: "GitHub profile URL", weight: 1 }],
        controlKind: "text",
      },
      profileSchema.fields,
    );

    expect(email?.definition.key).toBe("email");
    expect(email?.score).toBe(132);
    expect(linkedIn?.definition.key).toBe("linkedinUrl");
    expect(github?.definition.key).toBe("githubUrl");
  });

  it("resolves composite and paraphrased applicant fields without exact labels", () => {
    const fields = [
      [
        "LinkedIn URL Please provide your LinkedIn URL",
        "text",
        "linkedinUrl",
      ],
      [
        "Country Please select your country or region",
        "select",
        "country",
      ],
      ["Given name Enter your given name", "text", "firstName"],
      ["Electronic mail address (required)", "text", "email"],
      ["Code hosting profile for your source code", "text", "githubUrl"],
      ["Work portfolio Please provide your work samples URL", "text", "portfolioUrl"],
      ["School Please provide your school", "text", "school"],
    ];

    for (const [label, controlKind, expectedKey] of fields) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: label, weight: 1, source: "label" }],
            controlKind,
          },
          profileSchema.fields,
        )?.definition.key,
        label,
      ).toBe(expectedKey);
    }
  });

  it("aggregates descriptive and ATS metadata while retaining contradiction guards", () => {
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "Professional profile", weight: 1, source: "label" },
            {
              text: "Please provide the public profile used for recruiting",
              weight: 0.74,
              source: "description",
            },
            {
              text: "candidate_linkedin_profile_url",
              weight: 0.92,
              source: "platform",
            },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("linkedinUrl");

    expect(
      matcher.findBestDefinition(
        {
          signals: [
            {
              text: "Referrer's LinkedIn URL Please provide their LinkedIn URL",
              weight: 1,
              source: "label",
            },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      ),
    ).toBeNull();
  });

  it("uses radio option shape without reversing negated saved choices", () => {
    const positive = matcher.findBestDefinition(
      {
        signals: [
          {
            text: "Are you open to travel for this role?",
            weight: 1,
            source: "prompt",
          },
        ],
        controlKind: "choice",
        optionTexts: ["Yes", "No"],
      },
      profileSchema.fields,
    );
    const negated = matcher.findBestDefinition(
      {
        signals: [
          {
            text: "Are you not willing to relocate?",
            weight: 1,
            source: "prompt",
          },
        ],
        controlKind: "choice",
        optionTexts: ["Yes", "No"],
      },
      profileSchema.fields,
    );

    expect(positive?.definition.key).toBe("willingToTravel");
    expect(negated).toBeNull();
  });

  it("keeps negated consequential identity choices manual", () => {
    const positive = matcher.findBestDefinition(
      {
        signals: [
          {
            text: "Do you identify as transgender?",
            weight: 1,
            source: "prompt",
          },
        ],
        controlKind: "choice",
        optionTexts: ["Yes", "No"],
      },
      profileSchema.fields,
    );

    expect(positive?.definition.key).toBe("transgenderStatus");
    for (const prompt of [
      "Do you not identify as transgender?",
      "Do you not have a disability?",
      "Are you not a protected veteran?",
      "Do you not identify as Hispanic or Latino?",
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: prompt, weight: 1, source: "prompt" }],
            controlKind: "choice",
            optionTexts: ["Yes", "No"],
          },
          profileSchema.fields,
        ),
        prompt,
      ).toBeNull();
    }
  });

  it("resolves at least 95 percent of the common safe-question corpus", () => {
    const outcomes = commonQuestionCorpus.map((question) => {
      const context = {
        autocomplete: question.autocomplete,
        signals: question.signals,
        controlKind: question.controlKind,
        optionTexts: question.optionTexts,
      };
      const first = matcher.findBestDefinition(context, profileSchema.fields);
      const second = matcher.findBestDefinition(context, profileSchema.fields);
      return {
        category: question.category,
        prompt: question.signals[0].text,
        expected: question.expectedKey,
        actual: first?.definition.key || "",
        deterministic:
          first?.definition.key === second?.definition.key &&
          first?.score === second?.score,
      };
    });
    const incorrect = outcomes.filter(
      (outcome) => outcome.actual && outcome.actual !== outcome.expected,
    );
    const unresolved = outcomes.filter((outcome) => !outcome.actual);
    const matched = outcomes.filter(
      (outcome) => outcome.actual === outcome.expected,
    );
    const matchRate = matched.length / outcomes.length;

    expect(
      outcomes.every((outcome) => outcome.deterministic),
      JSON.stringify(outcomes.filter((outcome) => !outcome.deterministic), null, 2),
    ).toBe(true);
    expect(incorrect, JSON.stringify(incorrect, null, 2)).toEqual([]);
    expect(
      matchRate,
      `${matched.length}/${outcomes.length} matched; unresolved:\n${JSON.stringify(
        unresolved,
        null,
        2,
      )}`,
    ).toBeGreaterThanOrEqual(0.95);
  });

  it("keeps the common ambiguity and consequential guard corpus manual", () => {
    const unsafeMatches = guardedQuestionCorpus
      .map((question) => ({
        prompt: question.signals[0].text,
        actual:
          matcher.findBestDefinition(
            {
              signals: question.signals,
              controlKind: question.controlKind,
              optionTexts: question.optionTexts,
            },
            profileSchema.fields,
          )?.definition.key || "",
      }))
      .filter((outcome) => outcome.actual);

    expect(unsafeMatches, JSON.stringify(unsafeMatches, null, 2)).toEqual([]);
  });

  it("recognizes the reported education and application fields", () => {
    const reportedFields = [
      ["Country* Required", "select", "country"],
      ["Location (City)", "select", "city"],
      ["School* Required", "text", "school"],
      ["Degree* Required", "select", "degree"],
      ["How did you hear about this job?", "select", "heardAboutJob"],
      ["GPA (Undergraduate)", "text", "undergraduateGpa"],
      ["GPA (Graduate)", "text", "graduateGpa"],
      ["GPA (Doctorate)", "text", "doctorateGpa"],
      ["SAT Score", "text", "satScore"],
      ["ACT Score", "text", "actScore"],
      ["GRE Score", "text", "greScore"],
      ["Active Security Clearance(s)", "select", "securityClearances"],
      [
        "Can you perform all of the essential functions of this role with or without reasonable accommodations?",
        "choice",
        "canPerformEssentialFunctions",
      ],
      [
        "Are you legally authorized to work in the United States? Required",
        "choice",
        "workAuthorization",
      ],
      ["Citizenship Status* Required", "select", "citizenshipStatus"],
      ["Discipline", "text", "fieldOfStudy"],
      ["Pronouns (optional)", "select", "pronouns"],
      ["Gender identity* Required", "choice", "gender"],
      ["Race / Ethnicity (Optional)", "select", "raceEthnicity"],
      ["Disability status Required", "choice", "disabilityStatus"],
      ["Protected veteran status Optional", "select", "veteranStatus"],
      [
        "How many years of software engineering industry experience do you have (excluding internships)?",
        "text",
        "softwareIndustryExperienceYears",
      ],
      [
        "What are your target total annual compensation expectations?",
        "text",
        "compensationExpectation",
      ],
      ["Have you previously worked for Cisco?", "select", "previousEmployers"],
      [
        "This role is open to candidates who can work from the following office locations.",
        "check-many",
        "preferredOfficeLocations",
      ],
      ["Are you Hispanic or Latino?", "choice", "hispanicLatino"],
      ["Do you identify as transgender?", "select", "transgenderStatus"],
    ];

    for (const [label, controlKind, key] of reportedFields) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: label, weight: 1, source: "label" }],
            controlKind,
          },
          profileSchema.fields,
        )?.definition.key,
        label,
      ).toBe(key);
    }

    for (const [label, controlKind] of [
      ["Attach", "file"],
      ["Please specify", "text"],
      ["Preferred office location", "select"],
      ["Preferred location", "select"],
      ["Desired location", "select"],
      ["Which office location do you prefer?", "combobox"],
      ["SpaceX & SpaceXAI Employment History", "select"],
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: label, weight: 1, source: "label" }],
            controlKind,
          },
          profileSchema.fields,
        ),
        label,
      ).toBeNull();
    }
  });

  it("recognizes current-location and consequential identity wording without matching EEO prose", () => {
    const recognizedFields = [
      ["Location", "combobox", "location"],
      ["Current location", "combobox", "location"],
      ["Location (City)", "combobox", "city"],
      ["Current City", "combobox", "city"],
      ["City / Town", "select", "city"],
      [
        "Voluntary Self-Identification: Race / Ethnic Identity (Pre-Offer)",
        "select",
        "raceEthnicity",
      ],
      [
        "Voluntary Self-Identification of Protected-Veteran Classification / Status (Post-Offer)",
        "choice",
        "veteranStatus",
      ],
    ];

    for (const [label, controlKind, expectedKey] of recognizedFields) {
      const analysis = matcher.analyzeDefinition(
        {
          signals: [{ text: label, weight: 1, source: "label" }],
          controlKind,
        },
        profileSchema.fields,
      );
      const match =
        analysis.match ??
        matcher.equivalentCandidateMatch(analysis, {
          location: "New York, NY",
          city: "New York",
          homeCity: "New York",
        });
      expect(match?.definition.key, label).toBe(expectedKey);
    }

    for (const prose of [
      "We are an equal opportunity employer and do not discriminate based on race, ethnicity, or veteran status.",
      "Our voluntary equal employment opportunity disclosure explains protected veteran rights.",
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: prose, weight: 1, source: "description" }],
            controlKind: "select",
          },
          profileSchema.fields,
        ),
        prose,
      ).toBeNull();
    }

    for (const [label, description, expectedKey] of [
      [
        "Race / ethnicity",
        "We are an equal opportunity employer and do not discriminate based on race.",
        "raceEthnicity",
      ],
      [
        "Protected veteran status",
        "Our equal employment opportunity notice describes protected veteran rights.",
        "veteranStatus",
      ],
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [
              { text: label, weight: 1, source: "label" },
              { text: description, weight: 0.74, source: "description" },
            ],
            controlKind: "select",
          },
          profileSchema.fields,
        )?.definition.key,
        label,
      ).toBe(expectedKey);
    }

    for (const [label, description, expectedKey] of [
      ["Phone", "Phone extension", "phoneExtension"],
      ["Degree", "Degree field", "fieldOfStudy"],
      ["Country", "Country calling code", "phoneCountryCode"],
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [
              { text: label, weight: 1, source: "label" },
              { text: description, weight: 0.74, source: "description" },
            ],
            controlKind: "text",
          },
          profileSchema.fields,
        )?.definition.key,
        `${label}: ${description}`,
      ).toBe(expectedKey);
    }
  });

  it("maps common structured profile values to ATS options", () => {
    expect(
      matcher.scoreChoice(
        "Bachelor's degree",
        "Bachelor of Science",
        "Bachelor of Science",
        "degree",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "White",
        "opaque-race",
        "White (Not Hispanic or Latino)",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Hispanic or Latino",
        "opaque-race",
        "White (Not Hispanic or Latino)",
        "raceEthnicity",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Hispanic or Latino",
        "opaque-race",
        "Hispanic or Latino (all races)",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Other",
        "opaque-other",
        "Other (please specify)",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "White",
        "opaque-race",
        "I choose to self-identify as White",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Prefer not to answer",
        "opaque-race",
        "I prefer to identify as White",
        "raceEthnicity",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "White",
        "opaque-race",
        "Non-white",
        "raceEthnicity",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Two or more races",
        "opaque-race",
        "Multiracial / Two-or-More Races (Not Hispanic or Latino)",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Prefer not to answer",
        "opaque-decline",
        "I decline to self-identify my race / ethnic identity",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "New York, NY",
        "opaque-city",
        "New York City, New York, United States",
        "city",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Toronto, ON",
        "opaque-city",
        "Toronto (Ontario), Canada",
        "location",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Toronto, ON",
        "toronto-ca",
        "Toronto, Ontario, Canada",
        "location",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Toronto, ON",
        "toronto-ca",
        "Toronto, Canada",
        "location",
      ),
    ).toBe(94);
    expect(
      matcher.scoreChoice(
        "Portland, OR",
        "opaque-city",
        "Portland, Maine",
        "city",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "opaque-protected",
        "Yes — I identify as one or more classifications of a protected veteran",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "opaque-not-protected",
        "I am a veteran, but I am not a protected veteran",
        "veteranStatus",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "opaque-protected",
        "I choose to self-identify as a protected veteran",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Prefer not to answer",
        "opaque-protected",
        "I choose to self-identify as a protected veteran",
        "veteranStatus",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "opaque-uncertain",
        "Not sure whether I am a protected veteran",
        "veteranStatus",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Veteran but not protected",
        "opaque-not-protected",
        "I am a veteran, but I am not a protected veteran",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Not a veteran",
        "opaque-not-veteran",
        "No — I am not a veteran",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Prefer not to answer",
        "opaque-decline",
        "I decline to disclose my protected-veteran status",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "New York, NY",
        "opaque-location",
        "New York, New York, United States",
        "preferredOfficeLocations",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Toronto, ON",
        "opaque-location",
        "Toronto, Ontario, Canada",
        "preferredOfficeLocations",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Company career site",
        "company_website",
        "Company Website",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Permanent resident",
        "green_card",
        "Green Card Holder",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "She/her",
        "she_her",
        "She / Her / Hers",
        "pronouns",
      ),
    ).toBe(100);
    expect(matcher.scoreChoice("Woman", "female", "Female", "gender")).toBe(100);
    expect(
      matcher.scoreChoice(
        "Black or African American",
        "opaque-1",
        "Black / African American",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Native Hawaiian or Other Pacific Islander",
        "opaque-2",
        "Native Hawaiian or Pacific Islander",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "American Indian or Alaska Native",
        "opaque-3",
        "American Indian / Alaskan Native",
        "raceEthnicity",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "protected",
        "I identify as one or more classifications of a protected veteran",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "protected",
        "I identify as one or more of the classifications of protected veteran listed above",
        "veteranStatus",
      ),
    ).toBe(100);
    expect(
      matcher.scoreChoice(
        "Protected veteran",
        "not-protected",
        "I am not a protected veteran",
        "veteranStatus",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Not a protected veteran",
        "protected",
        "I am a protected veteran",
        "veteranStatus",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Prefer not to answer",
        "decline",
        "I do not wish to answer",
        "disabilityStatus",
      ),
    ).toBe(100);
  });

  it("ranks only unique safe location, race, and veteran options", () => {
    const rank = (
      savedValue: string,
      fieldKey: string,
      options: { value: string; label: string }[],
    ) =>
      options
        .map((option) => ({
          ...option,
          score: matcher.scoreChoice(
            savedValue,
            option.value,
            option.label,
            fieldKey,
          ),
        }))
        .sort((left, right) => right.score - left.score);

    const locations = rank(
      "Portland, OR, United States",
      "location",
      [
        {
          value: "opaque-correct",
          label: "Portland (Oregon), United States",
        },
        {
          value: "opaque-wrong-region",
          label: "Portland, Maine, United States",
        },
        {
          value: "opaque-wrong-country",
          label: "Portland, Oregon, Canada",
        },
        { value: "portland-remote", label: "Remote — United States" },
        { value: "opaque-fuzzy", label: "Portsmouth, New Hampshire" },
      ],
    );
    expect(locations[0]).toMatchObject({
      value: "opaque-correct",
      score: 100,
    });
    expect(locations.slice(1).every((option) => option.score === 0)).toBe(true);
    expect(
      matcher.scoreChoice(
        "London, ON, Canada",
        "opaque-foreign",
        "London, United Kingdom",
        "location",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "London, Canada",
        "London",
        "London, United Kingdom",
        "location",
      ),
    ).toBe(0);
    expect(
      matcher.scoreChoice(
        "Portland, OR, United States",
        "opaque-bare",
        "Portland",
        "location",
      ),
    ).toBe(94);
    expect(
      matcher.scoreChoice(
        "Mexico City, Mexico",
        "opaque-wrong-country",
        "Mexico, Maine, United States",
        "location",
      ),
    ).toBe(0);

    const ambiguousRace = rank("White", "raceEthnicity", [
      { value: "opaque-white", label: "White (Not Hispanic or Latino)" },
      { value: "opaque-caucasian", label: "Caucasian" },
    ]);
    expect(ambiguousRace[0].score).toBe(ambiguousRace[1].score);

    const veteranChoices = rank("Not a protected veteran", "veteranStatus", [
      {
        value: "opaque-protected",
        label: "I identify as one or more classifications of a protected veteran",
      },
      {
        value: "opaque-not-protected",
        label: "I am not a protected veteran",
      },
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "other", label: "Other" },
    ]);
    expect(veteranChoices[0]).toMatchObject({
      value: "opaque-not-protected",
      score: 100,
    });
    expect(
      veteranChoices
        .filter((option) => ["yes", "no", "other"].includes(option.value))
        .every((option) => option.score === 0),
    ).toBe(true);

    for (const fieldKey of ["raceEthnicity", "veteranStatus"]) {
      expect(matcher.scoreChoice("", "first", "First option", fieldKey)).toBe(0);
      expect(matcher.scoreChoice("", "other", "Other", fieldKey)).toBe(0);
    }
  });

  it("derives deterministic full and city-only location search queries", () => {
    expect(
      matcher.choiceSearchQueries("New York, NY", "location"),
    ).toEqual(["New York, NY", "New York"]);
    expect(
      matcher.choiceSearchQueries(
        "Toronto (Ontario), Canada",
        "city",
      ),
    ).toEqual(["Toronto (Ontario), Canada", "Toronto"]);
    expect(
      matcher.choiceSearchQueries("LinkedIn", "heardAboutJob"),
    ).toEqual(["LinkedIn"]);
    expect(matcher.choiceSearchQueries("", "location")).toEqual([]);
    expect(
      matcher.contextualLocationChoice("New York, NY", "United States"),
    ).toBe("New York, NY");
    expect(
      matcher.contextualLocationChoice("New York", "United States"),
    ).toBe("New York, United States");
    expect(
      matcher.contextualLocationChoice("Toronto, ON", "Canada"),
    ).toBe("Toronto, ON");
    expect(
      matcher.contextualLocationChoice("Mexico City", "Mexico"),
    ).toBe("Mexico City, Mexico");
    expect(
      matcher.contextualLocationChoice("Mexico City, Mexico", "United States"),
    ).toBeNull();
  });

  it("allows conservative Other fallbacks only for benign fields", () => {
    expect(
      matcher.scoreSafeFallback(
        "heardAboutJob",
        "not-listed",
        "Not listed above",
      ),
    ).toBe(100);
    expect(matcher.scoreSafeFallback("degree", "other", "Other")).toBeGreaterThan(
      68,
    );

    for (const fieldKey of [
      "workAuthorization",
      "requiresSponsorship",
      "citizenshipStatus",
      "gender",
      "raceEthnicity",
      "disabilityStatus",
      "veteranStatus",
    ]) {
      expect(
        matcher.scoreSafeFallback(fieldKey, "other", "Other"),
        fieldKey,
      ).toBe(0);
    }
  });

  it("keeps degree abbreviations from colliding with region options", () => {
    expect(matcher.scoreChoice("MA", "MA", "Massachusetts", "region")).toBe(100);
    expect(matcher.scoreChoice("MA", "MS", "Mississippi", "region")).toBeLessThan(
      90,
    );
    expect(
      matcher.scoreChoice("Master's degree", "MS", "Master of Science", "degree"),
    ).toBe(100);
  });

  it("does not let state metadata override an explicit city label", () => {
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "City only", weight: 1, source: "label" },
            { text: "state", weight: 0.76, source: "name" },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("city");
  });

  it("coalesces only equivalent saved current-location candidates", () => {
    const analysis = matcher.analyzeDefinition(
      {
        signals: [
          {
            text: "Current city / location",
            weight: 1,
            source: "label",
          },
        ],
        controlKind: "select",
        optionTexts: ["New York, NY", "Toronto, ON"],
      },
      profileSchema.fields,
    );

    expect(analysis.status).toBe("uncertain");
    expect([
      "location",
      "city",
    ]).toContain(
      matcher.equivalentCandidateMatch(analysis, {
        location: "New York, NY",
        city: "New York",
        homeCity: "New York",
      })?.definition.key,
    );
    expect(
      matcher.equivalentCandidateMatch(analysis, {
        location: "Toronto, ON",
        city: "New York",
        homeCity: "New York",
      }),
    ).toBeNull();
  });

  it("leaves generic follow-ups and reversed accommodation questions unanswered", () => {
    for (const label of [
      "Please specify",
      "Please specify (optional)",
      "Please specify if applicable",
      "If you selected Other above, please specify",
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [
              { text: label, weight: 1, source: "label" },
              { text: "application_source", weight: 0.76, source: "name" },
            ],
            controlKind: "text",
          },
          profileSchema.fields,
        ),
        label,
      ).toBeNull();
    }
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "Please specify (optional)", weight: 0.92, source: "nearby" },
            { text: "application_source", weight: 0.76, source: "name" },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      ),
    ).toBeNull();
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "School", weight: 1, source: "label" },
            { text: "Please specify", weight: 0.84, source: "placeholder" },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("school");

    for (const label of [
      "Are you unable to perform the essential functions of this role?",
      "Can you not perform the essential functions of this role?",
      "Do you require a reasonable accommodation to perform the essential functions?",
      "Can you perform the essential functions without reasonable accommodation?",
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: label, weight: 1, source: "label" }],
            controlKind: "choice",
          },
          profileSchema.fields,
        ),
        label,
      ).toBeNull();
    }
  });

  it("matches generic Other details only with identifying question context", () => {
    const contextualFields = [
      ["Degree", "degreeOther"],
      ["How did you hear about this opportunity?", "heardAboutJobOther"],
      ["Citizenship status", "citizenshipStatusOther"],
      ["Pronouns", "pronounsOther"],
      ["Gender identity", "genderOther"],
      ["Race and ethnicity", "raceEthnicityOther"],
    ];

    for (const [prompt, key] of contextualFields) {
      const analysis = matcher.analyzeDefinition(
        {
          signals: [
            { text: "Please specify", weight: 1, source: "label" },
            { text: prompt, weight: 0.92, source: "prompt" },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      );
      expect(analysis.status, prompt).toBe("confident");
      expect(analysis.match?.definition.key, prompt).toBe(key);
    }

    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "Please specify", weight: 1, source: "label" },
            {
              text: "Voluntary self-identification",
              weight: 0.92,
              source: "section",
            },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      ),
    ).toBeNull();

    for (const context of [
      "This organization does not discriminate on the basis of gender, race, or other protected characteristics",
      "A degree may be required for some positions at this company",
      "Citizenship background checks are completed after an offer",
      "You may add pronouns to your email signature after joining",
      "Voluntary self-identification includes gender identity and sexual orientation",
    ]) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [
              { text: "Please specify", weight: 1, source: "label" },
              { text: context, weight: 0.92, source: "nearby" },
            ],
            controlKind: "text",
          },
          profileSchema.fields,
        ),
        context,
      ).toBeNull();
    }
  });

  it("does not mistake excluded labels for profile fields", () => {
    const companyWebsite = matcher.findBestDefinition(
      {
        signals: [{ text: "Company website", weight: 1 }],
        controlKind: "text",
      },
      profileSchema.fields,
    );
    const riskyLabels = [
      ["Reference name", "text", ""],
      ["Name of current employer", "text", ""],
      ["Reference email", "text", "email"],
      ["Employer website", "text", ""],
      ["Supervisor city", "text", ""],
      ["Please state your desired salary", "text", ""],
    ];

    expect(companyWebsite).toBeNull();
    for (const [label, controlKind, autocomplete] of riskyLabels) {
      expect(
        matcher.findBestDefinition(
          {
            autocomplete,
            signals: [{ text: label, weight: 1 }],
            controlKind,
          },
          profileSchema.fields,
        ),
        label,
      ).toBeNull();
    }

    const legitimateLabels = [
      ["Middle name", "middleName"],
      ["Phone number", "phone"],
      ["Phone extension", "phoneExtension"],
      ["Referrer full name", "referrerName"],
      ["Referral email address", "referrerEmail"],
      ["Who referred you? Email address", "referrerEmail"],
      ["Country calling code", "phoneCountryCode"],
      ["Country of residence", "country"],
    ];
    for (const [label, key] of legitimateLabels) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: label, weight: 1 }],
            controlKind: "text",
          },
          profileSchema.fields,
        )?.definition.key,
        label,
      ).toBe(key);
    }

    expect(
      matcher.findBestDefinition(
        {
          signals: [
            { text: "Email address", weight: 1 },
            { text: "Employee referral", weight: 0.92 },
          ],
          controlKind: "text",
        },
        profileSchema.fields,
      ),
    ).toBeNull();

    for (const section of ["References", "Referrals"]) {
      expect(
        matcher.findBestDefinition(
          {
            autocomplete: "email",
            signals: [
              { text: "Email address", weight: 1 },
              { text: section, weight: 0.92 },
            ],
            controlKind: "text",
          },
          profileSchema.fields,
        ),
        section,
      ).toBeNull();
    }
  });

  it("derives preferred and full names without overwriting explicit values", () => {
    expect(
      profileSchema.buildEffectiveProfile({
        firstName: "Sacha",
        lastName: "Chen",
      }),
    ).toMatchObject({
      preferredName: "Sacha",
      fullName: "Sacha Chen",
    });
    expect(
      profileSchema.buildEffectiveProfile({
        firstName: "Sacha",
        preferredName: "Sach",
        lastName: "Chen",
      }).preferredName,
    ).toBe("Sach");
  });

  it("transforms standard compound and negated eligibility questions", () => {
    const profile = {
      workAuthorization: "yes",
      requiresSponsorship: "no",
    };
    const transformedQuestions = [
      {
        prompt: "Are you legally authorized to work in the US?",
        key: "workAuthorization",
        answer: "yes",
      },
      {
        prompt: "Will you now require immigration sponsorship?",
        key: "requiresSponsorship",
        answer: "no",
      },
      {
        prompt: "Will you in the future require immigration sponsorship?",
        key: "requiresSponsorship",
        answer: "no",
      },
      {
        prompt:
          "If working in the US, will you now, or in the future, require sponsorship for employment visa status (e.g., H-1B visa) to legally work in the US?",
        key: "requiresSponsorship",
        answer: "no",
      },
      {
        prompt:
          "Are you legally authorized to work in the United States without sponsorship?",
        key: "workAuthorization",
        answer: "yes",
      },
      {
        prompt: "Can you work without requiring sponsorship?",
        key: "workAuthorization",
        answer: "yes",
      },
      {
        prompt: "Do you not require visa sponsorship?",
        key: "requiresSponsorship",
        answer: "yes",
      },
      {
        prompt:
          "Can you work in the United States without the need for visa sponsorship?",
        key: "workAuthorization",
        answer: "yes",
      },
      {
        prompt: "Don't you require sponsorship?",
        key: "requiresSponsorship",
        answer: "yes",
      },
    ];
    for (const { prompt, key, answer } of transformedQuestions) {
      const signals = [{ text: prompt, weight: 1, source: "prompt" }];
      const match = matcher.findBestDefinition(
        { signals, controlKind: "choice" },
        profileSchema.fields,
      );
      expect(match?.definition.key, prompt).toBe(key);
      expect(
        matcher.resolveEligibilityAnswer(key, signals, profile),
        prompt,
      ).toBe(answer);
    }
  });

  it("answers employer-history questions from the complete saved company list", () => {
    const employers = "Cisco\nRivian";
    const signals = (text: string) => [
      { text, weight: 1, source: "prompt" },
    ];

    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you previously worked for Cisco?"),
        employers,
        "Cisco",
      ),
    ).toBe("yes");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Are you a former employee of Cisco?"),
        employers,
        "Cisco",
      ),
    ).toBe("yes");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you ever worked at Datadog?"),
        employers,
        "Datadog",
      ),
    ).toBe("no");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you worked for us before?"),
        employers,
        "Rivian",
      ),
    ).toBe("yes");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you worked for us before?"),
        employers,
        "Acme",
      ),
    ).toBe("no");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you previously worked for Cisco?"),
        "",
      ),
    ).toBe("");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you worked for more than two years as a software engineer?"),
        employers,
      ),
    ).toBe("");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        [
          ...signals("Have you ever worked at Datadog?"),
          { text: "Cisco careers", weight: 0.55, source: "section" },
        ],
        employers,
        "Datadog",
      ),
    ).toBe("no");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you worked on projects for Cisco?"),
        employers,
      ),
    ).toBe("");
    const unsafeQuestions = [
      ["Have you worked at scale?", "Acme"],
      ["Have you never worked for Cisco?", "Cisco"],
      ["Are you related to a former employee?", "Cisco"],
      ["Have you been referred by someone who worked at Cisco?", "Cisco"],
      ["Have you worked for Cisco in the last 12 months?", "Cisco"],
      ["Are you a former employee or is your parent a current employee?", "Cisco"],
      ["Are you a former employee eligible for rehire?", "Cisco"],
    ] as const;
    for (const [question, currentCompany] of unsafeQuestions) {
      expect(
        matcher.resolvePreviousEmployerAnswer(
          signals(question),
          employers,
          currentCompany,
        ),
        question,
      ).toBe("");
    }
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you ever worked at Ford?"),
        "Ford Foundation",
        "Ford",
      ),
    ).toBe("no");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Are you a former employee of Ford Foundation?"),
        "Ford",
        "Ford",
      ),
    ).toBe("");
    expect(
      matcher.resolvePreviousEmployerAnswer(
        signals("Have you ever worked at Artera?"),
        "Artera Technologies",
        "Artera",
      ),
    ).toBe("no");
  });

  it("leaves unmodeled or unsafe eligibility questions for manual review", () => {
    const unsafeQuestions = [
      "Are you not legally authorized to work?",
      "Can you obtain visa sponsorship?",
      "Do you already have visa sponsorship?",
      "What is your visa sponsorship status?",
      "Do you need work authorization?",
      "What days can you work?",
      "How many hours per week can you work?",
      "Are you able to work overtime?",
      "Can you work weekends or night shifts?",
    ];

    for (const question of unsafeQuestions) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [{ text: question, weight: 1 }],
            controlKind: "choice",
          },
          profileSchema.fields,
        ),
        question,
      ).toBeNull();
    }

    const unsafeWithMachineMetadata = [
      {
        prompt: "Do you need work authorization?",
        machineValue: "work_authorization",
      },
      {
        prompt: "Can you obtain visa sponsorship?",
        machineValue: "requires_sponsorship",
      },
    ];
    for (const { prompt, machineValue } of unsafeWithMachineMetadata) {
      expect(
        matcher.findBestDefinition(
          {
            signals: [
              { text: prompt, weight: 1, source: "prompt" },
              { text: machineValue, weight: 0.76, source: "name" },
            ],
            controlKind: "choice",
          },
          profileSchema.fields,
        ),
        prompt,
      ).toBeNull();
    }

    expect(
      matcher.findBestDefinition(
        {
          signals: [{ text: "Are you legally authorized to work?", weight: 1 }],
          controlKind: "choice",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("workAuthorization");
    expect(
      matcher.findBestDefinition(
        {
          signals: [{ text: "Will you require visa sponsorship?", weight: 1 }],
          controlKind: "choice",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("requiresSponsorship");
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            {
              text: "Will you now or in the future need employer sponsorship?",
              weight: 1,
            },
          ],
          controlKind: "choice",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("requiresSponsorship");
    expect(
      matcher.findBestDefinition(
        {
          signals: [
            {
              text: "Are you legally authorized to work? Yes / No",
              weight: 1,
            },
          ],
          controlKind: "choice",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("workAuthorization");
  });

  it("recognizes only resume-specific file uploads", () => {
    expect(
      matcher.findBestDefinition(
        {
          signals: [{ text: "Upload resume or CV", weight: 1 }],
          controlKind: "file",
        },
        profileSchema.fields,
      )?.definition.key,
    ).toBe("resumeFile");
    expect(
      matcher.findBestDefinition(
        {
          signals: [{ text: "Upload cover letter", weight: 1 }],
          controlKind: "file",
        },
        profileSchema.fields,
      ),
    ).toBeNull();
    expect(matcher.scoreChoice("no", "none", "None")).toBe(0);
  });

  it("preserves textarea paragraphs while normalizing single-line controls", () => {
    const coverLetter = "First paragraph.\n\nSecond paragraph.";
    expect(profileSchema.formatControlValue(coverLetter, "textarea")).toBe(
      coverLetter,
    );
    expect(profileSchema.formatControlValue("  Sacha\nChen  ", "text")).toBe(
      "Sacha Chen",
    );
  });
});
