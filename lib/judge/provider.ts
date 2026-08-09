export const EXTERNAL_JUDGE_PROVIDERS = ["openai", "anthropic"] as const;

export type ExternalJudgeProvider = (typeof EXTERNAL_JUDGE_PROVIDERS)[number];
export type EnhancedJudgeProvider = "copilot" | ExternalJudgeProvider;
export type JudgeFitProvider = "deterministic" | EnhancedJudgeProvider;
export type StoredJudgeFitProvider = JudgeFitProvider | "agent";
export type JudgeRunProvider = JudgeFitProvider;

const PROVIDER_PRIORITY: Record<JudgeFitProvider, number> = {
  deterministic: 0,
  openai: 1,
  anthropic: 1,
  copilot: 2,
};

export function canonicalJudgeProvider(
  provider: string | null | undefined,
): JudgeFitProvider | null {
  if (provider === "agent") return "copilot";
  if (
    provider === "deterministic" ||
    provider === "copilot" ||
    provider === "openai" ||
    provider === "anthropic"
  ) {
    return provider;
  }
  return null;
}

export function isCopilotJudgeProvider(
  provider: string | null | undefined,
): boolean {
  return canonicalJudgeProvider(provider) === "copilot";
}

export function isEnhancedJudgeProvider(
  provider: string | null | undefined,
): provider is StoredJudgeFitProvider {
  const canonical = canonicalJudgeProvider(provider);
  return canonical !== null && canonical !== "deterministic";
}

export function canReplaceJudgeProvider(
  current: string | null | undefined,
  incoming: EnhancedJudgeProvider,
): boolean {
  const canonicalCurrent = canonicalJudgeProvider(current);
  if (!canonicalCurrent) return true;
  return PROVIDER_PRIORITY[incoming] >= PROVIDER_PRIORITY[canonicalCurrent];
}

export function judgeProviderLabel(
  provider: string | null | undefined,
): string {
  switch (canonicalJudgeProvider(provider)) {
    case "copilot":
      return "Copilot";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "deterministic":
      return "Baseline";
    default:
      return "Unscored";
  }
}
