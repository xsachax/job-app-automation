import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 1_000_000;

export class CopilotAutofillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotAutofillError";
  }
}

export interface CopilotPromptOptions {
  timeoutMs?: number;
}

export function extractCopilotResponseFromJsonl(jsonl: string): string {
  let response = "";
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      throw new CopilotAutofillError(
        "Copilot CLI returned a malformed event stream.",
      );
    }
    if (!event || typeof event !== "object") continue;
    const message = event as {
      type?: unknown;
      data?: { content?: unknown };
    };
    if (
      message.type === "assistant.message" &&
      typeof message.data?.content === "string"
    ) {
      response = message.data.content;
    }
  }
  const clean = response.trim();
  if (!clean) {
    throw new CopilotAutofillError(
      "Copilot assisted autofill returned an empty response.",
    );
  }
  return clean;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function executableOnPath(name: string): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

async function cachedCopilotBinary(): Promise<string | null> {
  const roots =
    process.platform === "darwin"
      ? [
          join(homedir(), "Library/Caches/github-copilot-sdk/cli"),
          join(homedir(), ".cache/github-copilot-sdk/cli"),
        ]
      : [join(homedir(), ".cache/github-copilot-sdk/cli")];

  for (const root of roots) {
    let versions: string[];
    try {
      versions = await readdir(root);
    } catch {
      continue;
    }
    versions.sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    );
    for (const version of versions) {
      const candidate = join(root, version, "copilot");
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

async function resolveCopilotCommand(): Promise<string> {
  const configured = process.env.COPILOT_CLI_PATH?.trim();
  if (configured) {
    if (!(await isExecutable(configured))) {
      throw new CopilotAutofillError(
        "COPILOT_CLI_PATH does not point to an executable Copilot CLI.",
      );
    }
    return configured;
  }

  const direct =
    (await executableOnPath("copilot")) ?? (await cachedCopilotBinary());
  if (direct) return direct;

  throw new CopilotAutofillError(
    "Copilot CLI is unavailable. Configure an OpenAI/Anthropic key or install Copilot CLI.",
  );
}

export async function runCopilotAutofillPrompt(
  prompt: string,
  options: CopilotPromptOptions = {},
): Promise<string> {
  const resolved = await resolveCopilotCommand();
  const args = [
    "--no-custom-instructions",
    "--disable-builtin-mcps",
    "--available-tools=",
    "--no-remote",
    "--no-remote-export",
    "--no-ask-user",
    "--no-auto-update",
    "--no-color",
    "--stream",
    "off",
    "--output-format",
    "json",
    "--effort",
    "low",
    "-p",
    prompt,
  ];

  return new Promise<string>((resolve, reject) => {
    const child = spawn(resolved, args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new CopilotAutofillError("Copilot assisted autofill timed out."));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        finish(
          new CopilotAutofillError(
            "Copilot assisted autofill returned too much data.",
          ),
        );
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2_000);
    });
    child.once("error", () => {
      finish(new CopilotAutofillError("Copilot CLI could not be started."));
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = /not (?:logged|authenticated)|login/i.test(stderr)
          ? " Sign in to Copilot CLI first."
          : "";
        finish(
          new CopilotAutofillError(
            `Copilot assisted autofill failed.${detail}`,
          ),
        );
        return;
      }
      try {
        finish(undefined, extractCopilotResponseFromJsonl(stdout));
      } catch (error) {
        finish(
          error instanceof CopilotAutofillError
            ? error
            : new CopilotAutofillError(
                "Copilot CLI response could not be decoded.",
              ),
        );
      }
    });
  });
}
