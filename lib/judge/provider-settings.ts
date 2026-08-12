import { z } from "zod";
import { prisma } from "../db";
import {
  EXTERNAL_JUDGE_PROVIDERS,
  type ExternalJudgeProvider,
  type JudgeRunProvider,
} from "./provider";

const SETTINGS_ID = "default";
const DEFAULT_MODELS: Record<ExternalJudgeProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

interface StoredProviderConfig {
  model: string | null;
  apiKey: string | null;
}

interface StoredJudgeProviderSettings {
  provider: ExternalJudgeProvider;
  providers: Record<ExternalJudgeProvider, StoredProviderConfig>;
}

export interface JudgeProviderSummary {
  model: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

export interface JudgeProviderPublicSettings extends JudgeProviderSummary {
  provider: ExternalJudgeProvider;
  providers: Record<ExternalJudgeProvider, JudgeProviderSummary>;
  copilotConnected: boolean;
  copilotHasPriority: boolean;
  effectiveProvider: JudgeRunProvider;
  enhancedAvailable: boolean;
  status: string;
}

export interface ExternalJudgeProviderConfig {
  provider: ExternalJudgeProvider;
  model: string;
  apiKey: string;
}

export type JudgeProviderResolution =
  | {
      provider: "copilot";
      external: null;
      status: string;
    }
  | {
      provider: ExternalJudgeProvider;
      external: ExternalJudgeProviderConfig;
      status: string;
    }
  | {
      provider: "deterministic";
      external: null;
      status: string;
    };

export interface SaveJudgeProviderSettingsInput {
  provider: ExternalJudgeProvider;
  model?: string | null;
  apiKey?: string | null;
}

export class JudgeProviderSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeProviderSettingsValidationError";
  }
}

const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const apiKeySchema = z
  .string()
  .min(8)
  .max(512)
  .refine((value) => !/[\s\x00-\x1f\x7f]/.test(value))
  .refine((value) => !/^(?:\*{4,}|\.{4,}|x{4,})/i.test(value));

const updateSchema = z
  .object({
    provider: z.enum(EXTERNAL_JUDGE_PROVIDERS),
    model: z.union([modelSchema, z.null()]).optional(),
    apiKey: z.union([apiKeySchema, z.null()]).optional(),
  })
  .strict();

function emptySettings(): StoredJudgeProviderSettings {
  return {
    provider: "openai",
    providers: {
      openai: { model: null, apiKey: null },
      anthropic: { model: null, apiKey: null },
    },
  };
}

function cleanModel(value: unknown): string | null {
  const parsed = modelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function cleanApiKey(value: unknown): string | null {
  const parsed = apiKeySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function coerceStoredSettings(raw: unknown): StoredJudgeProviderSettings {
  const defaults = emptySettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const source = raw as {
    provider?: unknown;
    providers?: Record<string, unknown>;
  };
  const provider = EXTERNAL_JUDGE_PROVIDERS.includes(
    source.provider as ExternalJudgeProvider,
  )
    ? (source.provider as ExternalJudgeProvider)
    : defaults.provider;
  const providerConfig = (name: ExternalJudgeProvider): StoredProviderConfig => {
    const value = source.providers?.[name];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaults.providers[name];
    }
    const config = value as { model?: unknown; apiKey?: unknown };
    return {
      model: cleanModel(config.model),
      apiKey: cleanApiKey(config.apiKey),
    };
  };
  return {
    provider,
    providers: {
      openai: providerConfig("openai"),
      anthropic: providerConfig("anthropic"),
    },
  };
}

async function readStoredSettings(): Promise<StoredJudgeProviderSettings> {
  const row = await prisma.judgeProviderSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return emptySettings();
  return coerceStoredSettings({
    provider: row.provider,
    providers: {
      openai: {
        model: row.openAiModel,
        apiKey: row.openAiApiKey,
      },
      anthropic: {
        model: row.anthropicModel,
        apiKey: row.anthropicApiKey,
      },
    },
  });
}

function configuredModel(
  provider: ExternalJudgeProvider,
  config: StoredProviderConfig,
): string {
  return config.model ?? DEFAULT_MODELS[provider];
}

function maskApiKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  return `****${apiKey.slice(-4)}`;
}

function summarizeProvider(
  provider: ExternalJudgeProvider,
  config: StoredProviderConfig,
): JudgeProviderSummary {
  return {
    model: configuredModel(provider, config),
    hasApiKey: Boolean(config.apiKey),
    apiKeyHint: maskApiKey(config.apiKey),
  };
}

export function isCopilotJudgeConnected(): boolean {
  return process.env.COPILOT_JUDGE_CONNECTED === "1";
}

function publicSettings(
  stored: StoredJudgeProviderSettings,
): JudgeProviderPublicSettings {
  const providers = {
    openai: summarizeProvider("openai", stored.providers.openai),
    anthropic: summarizeProvider("anthropic", stored.providers.anthropic),
  };
  const selected = providers[stored.provider];
  const copilotConnected = isCopilotJudgeConnected();
  const effectiveProvider: JudgeRunProvider = copilotConnected
    ? "copilot"
    : selected.hasApiKey
      ? stored.provider
      : "deterministic";
  const status = copilotConnected
    ? "GitHub Copilot is marked connected and has priority. External providers will not be called."
    : selected.hasApiKey
      ? `${stored.provider === "openai" ? "OpenAI" : "Anthropic"} is the enhanced Judge fallback.`
      : "No enhanced Judge provider is available; re-runs use the deterministic baseline only.";
  return {
    provider: stored.provider,
    ...selected,
    providers,
    copilotConnected,
    copilotHasPriority: copilotConnected,
    effectiveProvider,
    enhancedAvailable: effectiveProvider !== "deterministic",
    status,
  };
}

export async function getJudgeProviderPublicSettings(): Promise<JudgeProviderPublicSettings> {
  return publicSettings(await readStoredSettings());
}

export async function getExternalJudgeProviderConfig(
  provider: ExternalJudgeProvider,
): Promise<ExternalJudgeProviderConfig | null> {
  const stored = await readStoredSettings();
  const config = stored.providers[provider];
  if (!config.apiKey) return null;
  return {
    provider,
    model: configuredModel(provider, config),
    apiKey: config.apiKey,
  };
}

export async function getSelectedExternalJudgeProviderConfig(): Promise<ExternalJudgeProviderConfig | null> {
  const stored = await readStoredSettings();
  const config = stored.providers[stored.provider];
  if (!config.apiKey) return null;
  return {
    provider: stored.provider,
    model: configuredModel(stored.provider, config),
    apiKey: config.apiKey,
  };
}

export async function resolveJudgeProvider(): Promise<JudgeProviderResolution> {
  if (isCopilotJudgeConnected()) {
    return {
      provider: "copilot",
      external: null,
      status:
        "GitHub Copilot is marked connected and has priority. Use the existing export/apply workflow for enhanced evidence.",
    };
  }
  const stored = await readStoredSettings();
  const config = stored.providers[stored.provider];
  if (!config.apiKey) {
    return {
      provider: "deterministic",
      external: null,
      status:
        "Enhanced Judge scoring is unavailable because the selected fallback has no API key.",
    };
  }
  return {
    provider: stored.provider,
    external: {
      provider: stored.provider,
      model: configuredModel(stored.provider, config),
      apiKey: config.apiKey,
    },
    status: `${stored.provider === "openai" ? "OpenAI" : "Anthropic"} fallback selected.`,
  };
}

function validationMessage(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "JSON body must be an object.";
  }
  const body = input as Record<string, unknown>;
  if (!EXTERNAL_JUDGE_PROVIDERS.includes(body.provider as ExternalJudgeProvider)) {
    return "Provider must be openai or anthropic.";
  }
  if ("model" in body && body.model !== null && !modelSchema.safeParse(body.model).success) {
    return "Model must be 1-100 characters using letters, numbers, dots, slashes, colons, underscores, or hyphens.";
  }
  if ("apiKey" in body && body.apiKey !== null && !apiKeySchema.safeParse(body.apiKey).success) {
    return "API key must be an unmasked 8-512 character secret without whitespace.";
  }
  return "Judge provider settings are invalid.";
}

export async function saveJudgeProviderSettings(
  input: unknown,
): Promise<JudgeProviderPublicSettings> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    throw new JudgeProviderSettingsValidationError(validationMessage(input));
  }
  const isOpenAi = parsed.data.provider === "openai";
  const providerUpdate = {
    provider: parsed.data.provider,
    ...(parsed.data.model !== undefined
      ? isOpenAi
        ? { openAiModel: parsed.data.model }
        : { anthropicModel: parsed.data.model }
      : {}),
    ...(parsed.data.apiKey !== undefined
      ? isOpenAi
        ? { openAiApiKey: parsed.data.apiKey }
        : { anthropicApiKey: parsed.data.apiKey }
      : {}),
  };
  const row = await prisma.judgeProviderSettings.upsert({
    where: { id: SETTINGS_ID },
    update: providerUpdate,
    create: {
      id: SETTINGS_ID,
      provider: parsed.data.provider,
      openAiModel:
        isOpenAi && parsed.data.model !== undefined
          ? parsed.data.model
          : null,
      openAiApiKey:
        isOpenAi && parsed.data.apiKey !== undefined
          ? parsed.data.apiKey
          : null,
      anthropicModel:
        !isOpenAi && parsed.data.model !== undefined
          ? parsed.data.model
          : null,
      anthropicApiKey:
        !isOpenAi && parsed.data.apiKey !== undefined
          ? parsed.data.apiKey
          : null,
    },
  });
  return publicSettings(
    coerceStoredSettings({
      provider: row.provider,
      providers: {
        openai: {
          model: row.openAiModel,
          apiKey: row.openAiApiKey,
        },
        anthropic: {
          model: row.anthropicModel,
          apiKey: row.anthropicApiKey,
        },
      },
    }),
  );
}
