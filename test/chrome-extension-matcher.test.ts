import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface MatchDefinition {
  definition: { key: string };
  score: number;
}

interface Matcher {
  normalizeText(value: string): string;
  findBestDefinition(
    context: {
      autocomplete?: string;
      signals: { text: string; weight: number; source?: string }[];
      controlKind: string;
    },
    definitions: unknown[],
  ): MatchDefinition | null;
}

interface ProfileSchema {
  fields: unknown[];
  buildEffectiveProfile(profile: Record<string, string>): Record<string, string>;
  formatControlValue(value: string, controlKind: string): string;
}

const require = createRequire(import.meta.url);
const matcher = require("../apps/chrome-extension/lib/field-matcher.js") as Matcher;
const profileSchema = require(
  "../apps/chrome-extension/lib/profile-schema.js",
) as ProfileSchema;

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
      ["Country calling code", "text", ""],
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
      ["State / Province", "state"],
      ["Phone number", "phone"],
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

  it("leaves compound or negated sponsorship questions for manual review", () => {
    const unsafeQuestions = [
      "Are you legally authorized to work in the United States without sponsorship?",
      "Can you work without requiring sponsorship?",
      "Do you not require visa sponsorship?",
      "Can you work in the United States without the need for visa sponsorship?",
      "Don't you require sponsorship?",
      "Are you not legally authorized to work?",
      "Can you obtain visa sponsorship?",
      "Do you already have visa sponsorship?",
      "Do you need work authorization?",
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
