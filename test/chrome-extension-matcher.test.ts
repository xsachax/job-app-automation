import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface MatchDefinition {
  definition: { key: string; label: string };
  score: number;
}

interface Matcher {
  normalizeText(value: string): string;
  scoreChoice(
    savedValue: string,
    optionValue: string,
    optionLabel: string,
    fieldKey?: string,
  ): number;
  findBestDefinition(
    context: {
      autocomplete?: string;
      signals: { text: string; weight: number; source?: string }[];
      controlKind: string;
    },
    definitions: unknown[],
  ): MatchDefinition | null;
  analyzeDefinition(
    context: {
      autocomplete?: string;
      signals: { text: string; weight: number; source?: string }[];
      controlKind: string;
    },
    definitions: unknown[],
  ): {
    status: "none" | "uncertain" | "confident";
    match: MatchDefinition | null;
    confidence: number;
    candidates: MatchDefinition[];
    reason: string;
  };
  resolveEligibilityAnswer(
    definitionKey: string,
    signals: { text: string; weight: number; source?: string }[],
    profile: Record<string, string>,
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
    expect(profile.coverLetter).toHaveLength(20_000);
    expect(profile).not.toHaveProperty("unexpectedSecret");
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
    expect(email?.score).toBe(120);
    expect(linkedIn?.definition.key).toBe("linkedinUrl");
    expect(github?.definition.key).toBe("githubUrl");
  });

  it("recognizes the reported education and application fields", () => {
    const reportedFields = [
      ["Country", "select", "country"],
      ["Location (City)", "text", "city"],
      ["School", "text", "school"],
      ["Degree", "select", "degree"],
      ["How did you hear about this job?", "select", "heardAboutJob"],
      ["GPA (Undergraduate)", "text", "undergraduateGpa"],
      ["GPA (Graduate)", "text", "graduateGpa"],
      ["GPA (Doctorate)", "text", "doctorateGpa"],
      ["SAT Score", "text", "satScore"],
      ["ACT Score", "text", "actScore"],
      ["GRE Score", "text", "greScore"],
      ["Active Security Clearance(s)", "select", "securityClearances"],
      [
        "SpaceX & SpaceXAI Employment History",
        "select",
        "spacexEmploymentHistory",
      ],
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
      ["Citizenship Status", "select", "citizenshipStatus"],
      ["Discipline", "text", "fieldOfStudy"],
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
        "Previously employed by SpaceX",
        "former",
        "I am a former SpaceX employee",
        "spacexEmploymentHistory",
      ),
    ).toBe(100);
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

  it("does not mistake excluded labels for profile fields", () => {
    const companyWebsite = matcher.findBestDefinition(
      {
        signals: [{ text: "Company website", weight: 1 }],
        controlKind: "text",
      },
      profileSchema.fields,
    );
    const riskyLabels = [
      ["Middle name", "text", ""],
      ["Reference name", "text", ""],
      ["Name of current employer", "text", ""],
      ["Reference email", "text", "email"],
      ["Referral email address", "text", "email"],
      ["Referrer full name", "text", "name"],
      ["Who referred you? Email address", "text", ""],
      ["Employer website", "text", ""],
      ["Supervisor city", "text", ""],
      ["Please state your desired salary", "text", ""],
      ["Phone extension", "text", ""],
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
      ["Phone number", "phone"],
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

  it("leaves unmodeled or unsafe eligibility questions for manual review", () => {
    const unsafeQuestions = [
      "Are you not legally authorized to work?",
      "Can you obtain visa sponsorship?",
      "Do you already have visa sponsorship?",
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
