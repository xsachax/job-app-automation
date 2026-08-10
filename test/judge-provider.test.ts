import { describe, expect, it } from "vitest";
import {
  canReplaceJudgeProvider,
  canonicalJudgeProvider,
  judgeProviderLabel,
} from "../lib/judge/provider";

describe("Judge provider identity", () => {
  it("treats legacy agent rows conservatively as Copilot", () => {
    expect(canonicalJudgeProvider("agent")).toBe("copilot");
    expect(judgeProviderLabel("agent")).toBe("Copilot");
  });

  it("keeps Copilot above external providers and external providers above baseline", () => {
    expect(canReplaceJudgeProvider("agent", "openai")).toBe(false);
    expect(canReplaceJudgeProvider("copilot", "anthropic")).toBe(false);
    expect(canReplaceJudgeProvider("openai", "copilot")).toBe(true);
    expect(canReplaceJudgeProvider("anthropic", "openai")).toBe(true);
    expect(canReplaceJudgeProvider("deterministic", "anthropic")).toBe(true);
  });

  it("reports truthful provenance labels", () => {
    expect(judgeProviderLabel("copilot")).toBe("Copilot");
    expect(judgeProviderLabel("openai")).toBe("OpenAI");
    expect(judgeProviderLabel("anthropic")).toBe("Anthropic");
    expect(judgeProviderLabel("deterministic")).toBe("Baseline");
  });
});
