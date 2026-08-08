import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  detectApplyAvailability,
} from "../scripts/custom/google-job-monitor/detector.ts";
import {
  MONITOR_EXPIRES_AT,
  MONITOR_START_AT,
  TARGET_POSTING_URL,
  monitorGoogleJob,
  type MonitorFetch,
} from "../scripts/custom/google-job-monitor/monitor.ts";
import {
  GitHubIssueNotifier,
  TEST_NOTIFICATION_TITLE,
  buildNotification,
  type GitHubFetch,
} from "../scripts/custom/google-job-monitor/notifier.ts";

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/custom/google-job-monitor/fixtures",
);
const activeTime = new Date("2026-08-08T08:00:00Z");

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtureDirectory, name), "utf8");
}

describe("Google Careers apply detector", () => {
  it("requires a stable enabled action URL, not visible Apply text", async () => {
    const result = detectApplyAvailability(
      await fixture("negative.html"),
      TARGET_POSTING_URL,
      TARGET_POSTING_URL,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "no_apply_control",
    });
  });

  it("detects the positive structural signal", async () => {
    const result = detectApplyAvailability(
      await fixture("positive.html"),
      TARGET_POSTING_URL,
      TARGET_POSTING_URL,
    );

    expect(result.status).toBe("available");
    expect(result.reason).toBe("actionable_apply_link");
    expect(result.actionUrl).toContain(
      "/about/careers/applications/apply?jobId=synthetic_job_token",
    );
  });

  it("treats blocked pages as unknown", async () => {
    expect(
      detectApplyAvailability(
        await fixture("blocked.html"),
        TARGET_POSTING_URL,
        TARGET_POSTING_URL,
      ),
    ).toEqual({ status: "unknown", reason: "blocked_response" });
  });

  it.each([
    "Before you continue to Google",
    '<div class="g-recaptcha">Verification required</div>',
  ])("treats consent and captcha markup as unknown", async (marker) => {
    const html = (await fixture("negative.html")).replace(
      "<main>",
      `<main>${marker}`,
    );
    expect(
      detectApplyAvailability(html, TARGET_POSTING_URL, TARGET_POSTING_URL),
    ).toEqual({ status: "unknown", reason: "blocked_response" });
  });

  it("treats malformed pages as unknown", async () => {
    expect(
      detectApplyAvailability(
        await fixture("malformed.html"),
        TARGET_POSTING_URL,
        TARGET_POSTING_URL,
      ),
    ).toEqual({ status: "unknown", reason: "malformed_response" });
  });

  it("handles attribute order, quoting, whitespace, and absolute URLs", async () => {
    const result = detectApplyAvailability(
      await fixture("layout-variation.html"),
      TARGET_POSTING_URL,
      TARGET_POSTING_URL,
    );

    expect(result.status).toBe("available");
    expect(result.actionUrl).toContain("jobId=synthetic_layout_token");
  });

  it("does not treat a disabled control as actionable", async () => {
    expect(
      detectApplyAvailability(
        await fixture("disabled.html"),
        TARGET_POSTING_URL,
        TARGET_POSTING_URL,
      ),
    ).toEqual({
      status: "unavailable",
      reason: "disabled_apply_control",
    });
  });

  it("treats an unrecognized apply link layout as unknown", async () => {
    const html = (await fixture("positive.html")).replace(
      'id="apply-action-button"',
      'data-control="apply"',
    );

    expect(
      detectApplyAvailability(html, TARGET_POSTING_URL, TARGET_POSTING_URL),
    ).toEqual({
      status: "unknown",
      reason: "ambiguous_apply_control",
    });
  });

  it.each([
    ["an HTML comment", "<!-- CONTROL -->"],
    ["a template", "<template>CONTROL</template>"],
    ["a hidden ancestor", '<div hidden>CONTROL</div>'],
    [
      "an inline-style-hidden ancestor",
      '<div style="display: none !important">CONTROL</div>',
    ],
  ])("rejects an apply control inside %s", async (_case, wrapper) => {
    const positive = await fixture("positive.html");
    const control =
      '<a id="apply-action-button" aria-label="Apply" href="./apply?jobId=synthetic_job_token&amp;loc=US&amp;title=Synthetic+Role">Apply</a>';
    const html = positive.replace(control, wrapper.replace("CONTROL", control));

    expect(
      detectApplyAvailability(html, TARGET_POSTING_URL, TARGET_POSTING_URL)
        .status,
    ).not.toBe("available");
  });
});

describe("Google Careers monitor network policy", () => {
  it("exits before fetching once the window expires", async () => {
    let requests = 0;
    const fetchImpl: MonitorFetch = async () => {
      requests += 1;
      throw new Error("must not fetch");
    };

    const result = await monitorGoogleJob({
      now: new Date(MONITOR_EXPIRES_AT),
      fetchImpl,
    });

    expect(result.status).toBe("expired");
    expect(requests).toBe(0);
  });

  it("exits before fetching before the window starts", async () => {
    let requests = 0;
    const fetchImpl: MonitorFetch = async () => {
      requests += 1;
      throw new Error("must not fetch");
    };

    const result = await monitorGoogleJob({
      now: new Date(Date.parse(MONITOR_START_AT) - 1),
      fetchImpl,
    });

    expect(result.status).toBe("not_started");
    expect(requests).toBe(0);
  });

  it("makes one request and detects an available response", async () => {
    const fetchImpl: MonitorFetch = vi.fn(async () => {
      return new Response(await fixture("positive.html"), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    const result = await monitorGoogleJob({ now: activeTime, fetchImpl });

    expect(result.status).toBe("available");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces Retry-After without retrying a 429", async () => {
    const fetchImpl: MonitorFetch = vi.fn(async () => {
      return new Response("", {
        status: 429,
        headers: { "retry-after": "120" },
      });
    });

    const result = await monitorGoogleJob({ now: activeTime, fetchImpl });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "http_429",
      httpStatus: 429,
      retryAfter: "120",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([403, 500, 503])(
    "treats HTTP %i as unknown",
    async (status) => {
      const fetchImpl: MonitorFetch = async () =>
        new Response("", { status });
      const result = await monitorGoogleJob({ now: activeTime, fetchImpl });
      expect(result).toMatchObject({
        status: "unknown",
        reason: "http_status",
        httpStatus: status,
      });
    },
  );

  it("treats unexpected content types as unknown", async () => {
    const fetchImpl: MonitorFetch = async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const result = await monitorGoogleJob({ now: activeTime, fetchImpl });
    expect(result).toMatchObject({
      status: "unknown",
      reason: "unexpected_content_type",
    });
  });

  it("does not follow redirects away from the posting", async () => {
    const fetchImpl: MonitorFetch = vi.fn(async () => {
      return new Response("", {
        status: 302,
        headers: { location: "https://consent.google.com/" },
      });
    });

    const result = await monitorGoogleJob({ now: activeTime, fetchImpl });
    expect(result).toMatchObject({
      status: "unknown",
      reason: "unexpected_redirect",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not follow a redirect after the hard expiry", async () => {
    const expiry = Date.parse(MONITOR_EXPIRES_AT);
    const times = [expiry - 1_000, expiry - 500, expiry];
    const clock = () => new Date(times.shift() ?? expiry);
    const fetchImpl: MonitorFetch = vi.fn(async () => {
      return new Response("", {
        status: 302,
        headers: { location: `${TARGET_POSTING_URL}-redirected` },
      });
    });

    const result = await monitorGoogleJob({ clock, fetchImpl });

    expect(result).toMatchObject({ status: "expired", reason: "expired" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("turns timeouts into unknown", async () => {
    const fetchImpl: MonitorFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timed out", "AbortError")),
          { once: true },
        );
      });

    const result = await monitorGoogleJob({
      now: activeTime,
      fetchImpl,
      timeoutMs: 5,
    });
    expect(result).toMatchObject({
      status: "unknown",
      reason: "network_timeout",
    });
  });
});

describe("GitHub issue notifier", () => {
  it("makes the test notification explicitly non-production", () => {
    const message = buildNotification("test");
    expect(message.title).toBe(TEST_NOTIFICATION_TITLE);
    expect(message.body).toContain("TEST notification only");
    expect(message.body).toContain("does not claim");
  });

  it("creates the marked test issue with the intended assignee", async () => {
    const calls: string[] = [];
    const fetchImpl: GitHubFetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);

      if (method === "GET" && url.includes("/labels/")) {
        return new Response(null, { status: 404 });
      }
      if (method === "POST" && url.endsWith("/labels")) {
        return Response.json({}, { status: 201 });
      }
      if (method === "GET" && url.includes("/issues?")) {
        return Response.json([]);
      }
      if (method === "POST" && url.endsWith("/issues")) {
        const payload: unknown = JSON.parse(String(init?.body));
        expect(payload).toMatchObject({
          title: TEST_NOTIFICATION_TITLE,
          labels: ["google-job-monitor-test"],
          assignees: ["xsachax"],
        });
        return Response.json(
          {
            title: TEST_NOTIFICATION_TITLE,
            number: 43,
            html_url: "https://github.com/xsachax/job-app-automation/issues/43",
          },
          { status: 201 },
        );
      }
      throw new Error("unexpected request");
    };

    const notifier = new GitHubIssueNotifier(
      "xsachax/job-app-automation",
      "synthetic-token",
      fetchImpl,
    );
    const result = await notifier.notify("test");

    expect(result).toMatchObject({ status: "created", issueNumber: 43 });
    expect(calls).toHaveLength(4);
  });

  it("does not create a duplicate issue in any state", async () => {
    const calls: string[] = [];
    const fetchImpl: GitHubFetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/labels/")) {
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/issues?")) {
        return Response.json([
          {
            title: TEST_NOTIFICATION_TITLE,
            number: 42,
            html_url: "https://github.com/xsachax/job-app-automation/issues/42",
          },
        ]);
      }
      throw new Error("unexpected request");
    };

    const notifier = new GitHubIssueNotifier(
      "xsachax/job-app-automation",
      "synthetic-token",
      fetchImpl,
    );
    const result = await notifier.notify("test");

    expect(result).toEqual({
      status: "already_exists",
      issueNumber: 42,
      issueUrl: "https://github.com/xsachax/job-app-automation/issues/42",
    });
    expect(calls).toHaveLength(2);
  });
});
