import { readFile } from "node:fs/promises";
import path from "node:path";
import { detectApplyAvailability } from "./detector.ts";
import {
  MONITOR_EXIT_CODES,
  MONITOR_EXPIRES_AT,
  MONITOR_START_AT,
  TARGET_POSTING_URL,
  monitorGoogleJob,
  type MonitorResult,
} from "./monitor.ts";

interface CliOptions {
  fixture?: string;
  help: boolean;
}

function parseArguments(args: string[]): CliOptions {
  const options: CliOptions = { help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--fixture") {
      const value = args[index + 1];
      if (!value) throw new Error("Missing fixture path");
      options.fixture = value;
      index += 1;
      continue;
    }
    throw new Error("Unknown argument");
  }
  return options;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: npm run google-job:monitor -- [--fixture PATH]",
      "",
      "Without --fixture, performs one bounded live check of the fixed target.",
      "With --fixture, runs only the offline detector and makes no network request.",
      "",
    ].join("\n"),
  );
}

function exitCodeFor(result: MonitorResult): number {
  return MONITOR_EXIT_CODES[result.status];
}

async function run(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let result: MonitorResult;
  if (options.fixture) {
    const html = await readFile(path.resolve(options.fixture), "utf8");
    const detected = detectApplyAvailability(
      html,
      TARGET_POSTING_URL,
      TARGET_POSTING_URL,
    );
    result = {
      version: 1,
      source: "fixture",
      targetUrl: TARGET_POSTING_URL,
      checkedAt: new Date().toISOString(),
      startsAt: MONITOR_START_AT,
      expiresAt: MONITOR_EXPIRES_AT,
      ...detected,
    };
  } else {
    result = await monitorGoogleJob();
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCodeFor(result);
}

run().catch(() => {
  const result: MonitorResult = {
    version: 1,
    source: "network",
    status: "unknown",
    reason: "network_error",
    targetUrl: TARGET_POSTING_URL,
    checkedAt: new Date().toISOString(),
    startsAt: MONITOR_START_AT,
    expiresAt: MONITOR_EXPIRES_AT,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 64;
});
