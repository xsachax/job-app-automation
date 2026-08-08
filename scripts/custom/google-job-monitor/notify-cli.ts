import {
  GitHubIssueNotifier,
  type NotificationMode,
} from "./notifier.ts";

interface NotifyOptions {
  mode: NotificationMode;
  checkedAt?: string;
}

function parseArguments(args: string[]): NotifyOptions {
  let mode: NotificationMode | undefined;
  let checkedAt: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--mode" && (value === "test" || value === "available")) {
      mode = value;
      index += 1;
      continue;
    }
    if (argument === "--checked-at" && value) {
      checkedAt = value;
      index += 1;
      continue;
    }
    throw new Error("Invalid notifier arguments");
  }

  if (!mode) throw new Error("Notification mode is required");
  return { mode, checkedAt };
}

async function run(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error("GitHub notifier environment is incomplete");
  }

  const notifier = new GitHubIssueNotifier(repository, token);
  const result = await notifier.notify(options.mode, options.checkedAt);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

run().catch(() => {
  process.stdout.write(
    `${JSON.stringify({ status: "error", reason: "notification_failed" })}\n`,
  );
  process.exitCode = 70;
});
