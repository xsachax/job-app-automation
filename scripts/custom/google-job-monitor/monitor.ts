import {
  detectApplyAvailability,
  getGoogleCareersJobId,
  type DetectorReason,
} from "./detector.ts";

export const TARGET_POSTING_URL =
  "https://www.google.com/about/careers/applications/jobs/results/78703249065943750";
export const MONITOR_START_AT = "2026-08-08T07:33:12Z";
export const MONITOR_EXPIRES_AT = "2026-08-15T07:33:12Z";

export const MONITOR_EXIT_CODES = {
  available: 0,
  unavailable: 10,
  unknown: 20,
  not_started: 30,
  expired: 31,
} as const;

export type MonitorStatus =
  | "available"
  | "unavailable"
  | "unknown"
  | "not_started"
  | "expired";

export type MonitorReason =
  | DetectorReason
  | "body_too_large"
  | "expired"
  | "http_429"
  | "http_status"
  | "invalid_monitor_configuration"
  | "monitoring_window_not_started"
  | "network_error"
  | "network_timeout"
  | "redirect_limit"
  | "unexpected_content_type"
  | "unexpected_redirect";

export interface MonitorResult {
  version: 1;
  source: "fixture" | "network";
  status: MonitorStatus;
  reason: MonitorReason;
  targetUrl: string;
  checkedAt: string;
  startsAt: string;
  expiresAt: string;
  httpStatus?: number;
  redirects?: number;
  retryAfter?: string;
  actionUrl?: string;
}

export type MonitorFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface MonitorOptions {
  targetUrl?: string;
  startsAt?: string;
  expiresAt?: string;
  now?: Date;
  clock?: () => Date;
  fetchImpl?: MonitorFetch;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
}

const USER_AGENT =
  "job-app-automation-google-careers-monitor/1.0 (+https://github.com/xsachax/job-app-automation)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function resultBase(
  targetUrl: string,
  checkedAt: string,
  startsAt: string,
  expiresAt: string,
): Pick<
  MonitorResult,
  "version" | "source" | "targetUrl" | "checkedAt" | "startsAt" | "expiresAt"
> {
  return {
    version: 1,
    source: "network",
    targetUrl,
    checkedAt,
    startsAt,
    expiresAt,
  };
}

function safeRetryAfter(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,10}$/.test(trimmed)) return trimmed;
  if (
    trimmed.length <= 64 &&
    !trimmed.includes("\n") &&
    Number.isFinite(Date.parse(trimmed))
  ) {
    return trimmed;
  }
  return undefined;
}

function isSafeRedirect(value: string, expectedJobId: string): boolean {
  return getGoogleCareersJobId(value) === expectedJobId;
}

async function readBody(
  response: Response,
  maxBodyBytes: number,
): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    await response.body?.cancel();
    return null;
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }

  return text + decoder.decode();
}

export async function monitorGoogleJob(
  options: MonitorOptions = {},
): Promise<MonitorResult> {
  const targetUrl = options.targetUrl ?? TARGET_POSTING_URL;
  const startsAt = options.startsAt ?? MONITOR_START_AT;
  const expiresAt = options.expiresAt ?? MONITOR_EXPIRES_AT;
  const clock = options.clock ?? (() => options.now ?? new Date());
  const now = clock();
  const checkedAt = Number.isFinite(now.getTime())
    ? now.toISOString()
    : new Date(0).toISOString();
  const base = resultBase(targetUrl, checkedAt, startsAt, expiresAt);
  const startTime = Date.parse(startsAt);
  const expiryTime = Date.parse(expiresAt);
  const expectedJobId = getGoogleCareersJobId(targetUrl);

  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(expiryTime) ||
    expiryTime <= startTime ||
    !expectedJobId
  ) {
    return {
      ...base,
      status: "unknown",
      reason: "invalid_monitor_configuration",
    };
  }

  if (now.getTime() < startTime) {
    return {
      ...base,
      status: "not_started",
      reason: "monitoring_window_not_started",
    };
  }

  if (now.getTime() >= expiryTime) {
    return { ...base, status: "expired", reason: "expired" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBodyBytes = options.maxBodyBytes ?? 4 * 1024 * 1024;
  const controller = new AbortController();
  let abortReason: "expiry" | "timeout" | undefined;
  const abort = (reason: "expiry" | "timeout") => {
    if (abortReason) return;
    abortReason = reason;
    controller.abort();
  };
  const timeout = setTimeout(() => abort("timeout"), timeoutMs);
  const expiryTimeout = setTimeout(
    () => abort("expiry"),
    Math.max(0, expiryTime - now.getTime()),
  );
  let currentUrl = targetUrl;
  let redirects = 0;

  try {
    while (true) {
      const requestTime = clock().getTime();
      if (!Number.isFinite(requestTime)) {
        return {
          ...base,
          status: "unknown",
          reason: "invalid_monitor_configuration",
          redirects,
        };
      }
      if (requestTime >= expiryTime) {
        return { ...base, status: "expired", reason: "expired", redirects };
      }

      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "Accept-Language": "en-US,en;q=0.8",
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          return {
            ...base,
            status: "unknown",
            reason: "unexpected_redirect",
            httpStatus: response.status,
            redirects,
          };
        }
        if (redirects >= maxRedirects) {
          return {
            ...base,
            status: "unknown",
            reason: "redirect_limit",
            httpStatus: response.status,
            redirects,
          };
        }

        const redirectUrl = new URL(location, currentUrl).href;
        if (!isSafeRedirect(redirectUrl, expectedJobId)) {
          return {
            ...base,
            status: "unknown",
            reason: "unexpected_redirect",
            httpStatus: response.status,
            redirects,
          };
        }
        currentUrl = redirectUrl;
        redirects += 1;
        continue;
      }

      if (response.status === 429) {
        await response.body?.cancel();
        return {
          ...base,
          status: "unknown",
          reason: "http_429",
          httpStatus: response.status,
          redirects,
          retryAfter: safeRetryAfter(response.headers.get("retry-after")),
        };
      }

      if (!response.ok) {
        await response.body?.cancel();
        return {
          ...base,
          status: "unknown",
          reason: "http_status",
          httpStatus: response.status,
          redirects,
        };
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();
      if (
        !contentType ||
        (!contentType.startsWith("text/html") &&
          !contentType.startsWith("application/xhtml+xml"))
      ) {
        await response.body?.cancel();
        return {
          ...base,
          status: "unknown",
          reason: "unexpected_content_type",
          httpStatus: response.status,
          redirects,
        };
      }

      const html = await readBody(response, maxBodyBytes);
      if (html === null) {
        return {
          ...base,
          status: "unknown",
          reason: "body_too_large",
          httpStatus: response.status,
          redirects,
        };
      }

      const detected = detectApplyAvailability(html, targetUrl, currentUrl);
      const detectedAt = clock().getTime();
      if (!Number.isFinite(detectedAt)) {
        return {
          ...base,
          status: "unknown",
          reason: "invalid_monitor_configuration",
          httpStatus: response.status,
          redirects,
        };
      }
      if (detectedAt >= expiryTime) {
        return {
          ...base,
          status: "expired",
          reason: "expired",
          httpStatus: response.status,
          redirects,
        };
      }
      return {
        ...base,
        ...detected,
        httpStatus: response.status,
        redirects,
      };
    }
  } catch {
    if (abortReason === "expiry" || clock().getTime() >= expiryTime) {
      return { ...base, status: "expired", reason: "expired", redirects };
    }
    return {
      ...base,
      status: "unknown",
      reason: abortReason === "timeout" ? "network_timeout" : "network_error",
      redirects,
    };
  } finally {
    clearTimeout(timeout);
    clearTimeout(expiryTimeout);
  }
}
