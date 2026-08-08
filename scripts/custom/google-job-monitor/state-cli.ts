import { GitHubIssueNotifier } from "./notifier.ts";

async function run(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error("GitHub state-check environment is incomplete");
  }

  const notifier = new GitHubIssueNotifier(repository, token);
  const notified = await notifier.hasNotification("available");
  process.stdout.write(
    `${JSON.stringify({
      status: notified ? "availability_notified" : "clear",
    })}\n`,
  );
}

run().catch(() => {
  process.stdout.write(
    `${JSON.stringify({ status: "error", reason: "state_check_failed" })}\n`,
  );
  process.exitCode = 70;
});
