import { describe, expect, it } from "vitest";
import {
  CopilotAutofillError,
  extractCopilotResponseFromJsonl,
} from "../lib/autofill/copilot";

describe("Copilot assisted autofill output", () => {
  it("extracts the final assistant content without terminal wrapping", () => {
    const content = JSON.stringify({
      suggestions: [
        {
          fieldId: "field-1",
          answer:
            "A long machine-readable answer that must remain on one logical JSON line.",
          confidence: 0.9,
          reason: "Supported by synthetic profile evidence.",
          sourceKeys: ["summary"],
        },
      ],
    });
    const stream = [
      JSON.stringify({
        type: "assistant.message_delta",
        data: { deltaContent: content.slice(0, 20) },
      }),
      JSON.stringify({
        type: "assistant.message",
        data: { content },
      }),
      JSON.stringify({
        type: "result",
        exitCode: 0,
      }),
    ].join("\n");

    expect(extractCopilotResponseFromJsonl(stream)).toBe(content);
    expect(JSON.parse(extractCopilotResponseFromJsonl(stream))).toMatchObject({
      suggestions: [{ fieldId: "field-1" }],
    });
  });

  it("uses the last complete assistant message", () => {
    const stream = [
      JSON.stringify({
        type: "assistant.message",
        data: { content: '{"suggestions":[]}' },
      }),
      JSON.stringify({
        type: "assistant.message",
        data: { content: '{"suggestions":[{"fieldId":"field-1"}]}' },
      }),
    ].join("\n");

    expect(extractCopilotResponseFromJsonl(stream)).toBe(
      '{"suggestions":[{"fieldId":"field-1"}]}',
    );
  });

  it("rejects malformed streams and missing assistant responses", () => {
    expect(() => extractCopilotResponseFromJsonl("not-json")).toThrow(
      CopilotAutofillError,
    );
    expect(() =>
      extractCopilotResponseFromJsonl(
        JSON.stringify({ type: "result", exitCode: 0 }),
      ),
    ).toThrow("Copilot assisted autofill returned an empty response.");
  });
});
