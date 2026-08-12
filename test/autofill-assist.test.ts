import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assistAutofill,
  AutofillAssistProviderError,
  AutofillAssistValidationError,
  type AutofillAssistRequest,
} from "../lib/autofill/assist";
import { prisma } from "../lib/db";

const textField = {
  id: "field-1",
  label: "Describe one project that demonstrates your technical impact",
  context: "",
  controlKind: "textarea",
  inputType: "",
  options: [],
  maxLength: 500,
  pattern: "",
  required: true as const,
  status: "unknown",
};

function request(
  fields: AutofillAssistRequest["fields"] = [textField],
): AutofillAssistRequest {
  return {
    job: {
      title: "Software Engineer",
      company: "Example",
      country: "US",
      url: "https://jobs.example.test/apply",
    },
    fields,
  };
}

beforeEach(async () => {
  await prisma.profile.upsert({
    where: { id: "me" },
    update: {
      data: JSON.stringify({
        firstName: "Sacha",
        summary: "Built reliable developer tooling for distributed systems.",
        resumeText: "Experienced software engineer focused on reliability.",
        resumePath: "/private/resume.pdf",
        resumeUrl: "https://private.example/resume.pdf",
      }),
    },
    create: {
      id: "me",
      data: JSON.stringify({
        firstName: "Sacha",
        summary: "Built reliable developer tooling for distributed systems.",
        resumeText: "Experienced software engineer focused on reliability.",
        resumePath: "/private/resume.pdf",
        resumeUrl: "https://private.example/resume.pdf",
      }),
    },
  });
});

afterAll(async () => {
  await prisma.profile.deleteMany();
  await prisma.$disconnect();
});

describe("assisted autofill", () => {
  it("uses the selected external provider and keeps only supported safe answers", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let authorization = "";
    const fields: AutofillAssistRequest["fields"] = [
      textField,
      {
        ...textField,
        id: "field-2",
        label: "Preferred work arrangement",
        controlKind: "select",
        options: ["Hybrid", "Remote"],
      },
      {
        ...textField,
        id: "field-3",
        label: "Confirmation",
        context: "I certify that every statement is complete and truthful.",
      },
      {
        ...textField,
        id: "field-4",
        label: "Short biography",
      },
      {
        ...textField,
        id: "field-5",
        label: "Current city",
      },
    ];

    const result = await assistAutofill(request(fields), {
      providerConfig: {
        provider: "openai",
        model: "gpt-test",
        apiKey: "sk-test-private",
      },
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        authorization = new Headers(init?.headers).get("authorization") || "";
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      fieldId: "field-1",
                      answer:
                        "Built reliable developer tooling for distributed systems.",
                      confidence: 0.95,
                      reason: "Supported by the summary.",
                      sourceKeys: ["summary"],
                    },
                    {
                      fieldId: "field-2",
                      answer: "remote",
                      confidence: 0.9,
                      reason: "Supported by the saved profile.",
                      sourceKeys: ["summary"],
                    },
                    {
                      fieldId: "field-4",
                      answer: "Low confidence text",
                      confidence: 0.4,
                      reason: "Weak support.",
                      sourceKeys: ["summary"],
                    },
                    {
                      fieldId: "field-5",
                      answer: "Toronto",
                      confidence: 0.95,
                      reason: "Unsupported source.",
                      sourceKeys: ["unknownProfileKey"],
                    },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    expect(result).toEqual({
      provider: "openai",
      suggestions: [
        expect.objectContaining({
          fieldId: "field-1",
          answer:
            "Built reliable developer tooling for distributed systems.",
        }),
        expect.objectContaining({
          fieldId: "field-2",
          answer: "Remote",
        }),
      ],
    });
    expect(authorization).toBe("Bearer sk-test-private");
    const messages = requestBody?.messages as
      | Array<{ role?: string; content?: string }>
      | undefined;
    const prompt = messages?.find((message) => message.role === "user")?.content;
    expect(prompt).toContain('"firstName":"Sacha"');
    expect(prompt).toContain("Experienced software engineer");
    expect(prompt).not.toContain("/private/resume.pdf");
    expect(prompt).not.toContain("private.example/resume.pdf");
    expect(prompt).not.toContain("I certify");
  });

  it("falls back to tool-disabled Copilot when the external request fails", async () => {
    let copilotPrompt = "";
    const result = await assistAutofill(request(), {
      providerConfig: {
        provider: "anthropic",
        model: "claude-test",
        apiKey: "sk-ant-private",
      },
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
      copilotRunner: async (prompt) => {
        copilotPrompt = prompt;
        return JSON.stringify({
          suggestions: [
            {
              fieldId: "field-1",
              answer:
                "Built reliable developer tooling for distributed systems.",
              confidence: 0.91,
              reason: "Supported by the summary.",
              sourceKeys: ["summary"],
            },
          ],
        });
      },
    });

    expect(result).toMatchObject({
      provider: "copilot",
      fallbackFrom: "anthropic",
      suggestions: [{ fieldId: "field-1" }],
    });
    expect(copilotPrompt).toContain("<untrusted_profile_and_application_data>");
  });

  it("uses Copilot directly when the selected provider has no key", async () => {
    const result = await assistAutofill(request(), {
      providerConfig: null,
      copilotRunner: async () =>
        JSON.stringify({
          suggestions: [
            {
              fieldId: "field-1",
              answer: "A profile-supported answer.",
              confidence: 0.8,
              reason: "Supported by the candidate name.",
              sourceKeys: ["firstName"],
            },
          ],
        }),
    });

    expect(result).toMatchObject({
      provider: "copilot",
      suggestions: [{ answer: "A profile-supported answer." }],
    });
  });

  it("rejects malformed requests and reports both failed provider paths", async () => {
    await expect(
      assistAutofill({ job: {}, fields: [] }, { providerConfig: null }),
    ).rejects.toBeInstanceOf(AutofillAssistValidationError);

    await expect(
      assistAutofill(request(), {
        providerConfig: {
          provider: "openai",
          model: "gpt-test",
          apiKey: "sk-test-private",
        },
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
        copilotRunner: async () => {
          throw new Error("Local Copilot is not authenticated.");
        },
      }),
    ).rejects.toMatchObject({
      provider: "openai",
      message: expect.stringMatching(
        /OpenAI assisted autofill failed.*Copilot fallback also failed.*not authenticated/,
      ),
    } satisfies Partial<AutofillAssistProviderError>);
  });
});
