import { TARGET_POSTING_URL } from "./monitor.ts";

export type NotificationMode = "available" | "test";

export interface NotificationMessage {
  title: string;
  body: string;
  label: string;
  labelColor: string;
  labelDescription: string;
}

export interface NotificationResult {
  status: "created" | "already_exists";
  issueNumber: number;
  issueUrl: string;
}

export type GitHubFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface IssueSummary {
  title: string;
  number: number;
  htmlUrl: string;
  isPullRequest: boolean;
}

export const TEST_NOTIFICATION_TITLE =
  "[TEST] Google Careers monitor notification delivery";
export const AVAILABLE_NOTIFICATION_TITLE =
  "Google Careers target posting is now applyable";
const TEST_NOTIFICATION_LABEL = "google-job-monitor-test";
const AVAILABLE_NOTIFICATION_LABEL = "google-job-monitor-available";

function notificationIdentity(
  mode: NotificationMode,
): Pick<NotificationMessage, "label" | "title"> {
  return mode === "test"
    ? { title: TEST_NOTIFICATION_TITLE, label: TEST_NOTIFICATION_LABEL }
    : {
        title: AVAILABLE_NOTIFICATION_TITLE,
        label: AVAILABLE_NOTIFICATION_LABEL,
      };
}

export function buildNotification(
  mode: NotificationMode,
  checkedAt?: string,
): NotificationMessage {
  if (mode === "test") {
    return {
      title: TEST_NOTIFICATION_TITLE,
      label: TEST_NOTIFICATION_LABEL,
      labelColor: "fbca04",
      labelDescription: "One-shot delivery test for the temporary job monitor",
      body: [
        "@xsachax",
        "",
        "**TEST notification only.** This verifies GitHub email/push delivery for the temporary Google Careers monitor.",
        "",
        "No live availability check was performed, and this issue does not claim that the target posting is applyable.",
        "",
        `Target monitored after activation: ${TARGET_POSTING_URL}`,
        "",
        "Cleanup: confirm delivery, then close this test issue. Production monitoring remains disabled until the repository variable is enabled.",
      ].join("\n"),
    };
  }

  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("A valid detection time is required");
  }

  return {
    title: AVAILABLE_NOTIFICATION_TITLE,
    label: AVAILABLE_NOTIFICATION_LABEL,
    labelColor: "0e8a16",
    labelDescription: "One-shot actionable availability detection",
    body: [
      "@xsachax",
      "",
      `The monitor detected an enabled, same-origin Google Careers apply control at ${checkedAt}.`,
      "",
      `Open the posting and verify it directly: ${TARGET_POSTING_URL}`,
      "",
      "This is a point-in-time detection, not a forecast or a submitted application.",
      "",
      "This issue is intentionally one-shot and terminal; later scheduled runs skip target requests.",
    ].join("\n"),
  };
}

function parseIssue(value: unknown): IssueSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.number !== "number" ||
    typeof record.html_url !== "string"
  ) {
    return null;
  }
  return {
    title: record.title,
    number: record.number,
    htmlUrl: record.html_url,
    isPullRequest: typeof record.pull_request === "object",
  };
}

export class GitHubIssueNotifier {
  private readonly owner: string;
  private readonly repository: string;
  private readonly token: string;
  private readonly fetchImpl: GitHubFetch;

  constructor(repositorySlug: string, token: string, fetchImpl: GitHubFetch = fetch) {
    const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repositorySlug);
    if (!match || !token) throw new Error("Invalid GitHub notifier configuration");
    this.owner = match[1];
    this.repository = match[2];
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  private async request(pathname: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`https://api.github.com${pathname}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "job-app-automation-google-careers-monitor/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  }

  private async ensureLabel(message: NotificationMessage): Promise<void> {
    const labelPath = `/repos/${this.owner}/${this.repository}/labels/${encodeURIComponent(message.label)}`;
    const existing = await this.request(labelPath);
    if (existing.ok) {
      await existing.arrayBuffer();
      return;
    }
    await existing.arrayBuffer();
    if (existing.status !== 404) {
      throw new Error(`GitHub label lookup failed with ${existing.status}`);
    }

    const created = await this.request(
      `/repos/${this.owner}/${this.repository}/labels`,
      {
        method: "POST",
        body: JSON.stringify({
          name: message.label,
          color: message.labelColor,
          description: message.labelDescription,
        }),
      },
    );
    await created.arrayBuffer();
    if (created.ok) return;

    if (created.status === 422) {
      const raced = await this.request(labelPath);
      await raced.arrayBuffer();
      if (raced.ok) return;
    }
    throw new Error(`GitHub label creation failed with ${created.status}`);
  }

  private async findExisting(
    identity: Pick<NotificationMessage, "label" | "title">,
  ): Promise<IssueSummary | null> {
    const query = new URLSearchParams({
      state: "all",
      labels: identity.label,
      per_page: "100",
    });
    const response = await this.request(
      `/repos/${this.owner}/${this.repository}/issues?${query}`,
    );
    if (!response.ok) {
      await response.arrayBuffer();
      throw new Error(`GitHub issue lookup failed with ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("GitHub issue lookup returned malformed data");
    }

    for (const value of payload) {
      const issue = parseIssue(value);
      if (issue && !issue.isPullRequest && issue.title === identity.title) {
        return issue;
      }
    }
    return null;
  }

  async hasNotification(mode: NotificationMode): Promise<boolean> {
    return Boolean(await this.findExisting(notificationIdentity(mode)));
  }

  async notify(
    mode: NotificationMode,
    checkedAt?: string,
  ): Promise<NotificationResult> {
    const message = buildNotification(mode, checkedAt);
    await this.ensureLabel(message);

    const existing = await this.findExisting(notificationIdentity(mode));
    if (existing) {
      return {
        status: "already_exists",
        issueNumber: existing.number,
        issueUrl: existing.htmlUrl,
      };
    }

    const response = await this.request(
      `/repos/${this.owner}/${this.repository}/issues`,
      {
        method: "POST",
        body: JSON.stringify({
          title: message.title,
          body: message.body,
          labels: [message.label],
          assignees: ["xsachax"],
        }),
      },
    );
    if (!response.ok) {
      await response.arrayBuffer();
      throw new Error(`GitHub issue creation failed with ${response.status}`);
    }

    const issue = parseIssue(await response.json());
    if (!issue) throw new Error("GitHub issue creation returned malformed data");
    return {
      status: "created",
      issueNumber: issue.number,
      issueUrl: issue.htmlUrl,
    };
  }
}
