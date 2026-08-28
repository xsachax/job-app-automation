import { createHash } from "node:crypto";
import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { canonicalCompanyName } from "../company-names";
import { prisma } from "../db";
import type { ApiCompany, BrowserCompany } from "./companies";

export const JOB_AVAILABILITY = {
  OPEN: "open",
  SUSPECT: "suspect",
  CLOSED: "closed",
} as const;

export type PostingVerificationStatus = "open" | "closed" | "inconclusive";

export interface PostingVerificationResult {
  status: PostingVerificationStatus;
  reason: string;
  httpStatus?: number;
}

export interface PostingVerificationInput {
  id: string;
  title: string;
  company: string;
  applyUrl: string;
  atsType: string;
  externalId: string | null;
}

export type PostingVerifier = (
  posting: PostingVerificationInput,
) => Promise<PostingVerificationResult>;

export interface DiscoverySourceDescriptor {
  key: string;
  name: string;
  system: string;
  company: string | null;
  authoritative: boolean;
  positiveEvidence: "direct" | "secondary";
  expectedComplete: boolean;
}

export const DISCOVERY_SOURCE_OUTCOMES = [
  "complete",
  "degraded",
  "limited",
  "failed",
] as const;

export type DiscoverySourceOutcome =
  (typeof DISCOVERY_SOURCE_OUTCOMES)[number];

export type DiscoverySourceOutcomeCounts = Record<
  DiscoverySourceOutcome,
  number
>;

export interface ClassifiedDiscoverySourceOutcome {
  outcome: DiscoverySourceOutcome;
  reason: string;
}

const MAX_SOURCE_REASON_LENGTH = 600;

export function boundedDiscoverySourceReason(
  value: unknown,
  fallback = "source did not provide a reason",
): string {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const normalized = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const reason = normalized || fallback;
  return reason.length > MAX_SOURCE_REASON_LENGTH
    ? `${reason.slice(0, MAX_SOURCE_REASON_LENGTH - 3)}...`
    : reason;
}

export function classifyDiscoverySourceOutcome(input: {
  authoritative: boolean;
  expectedComplete: boolean;
  complete?: boolean;
  warning?: string;
  error?: unknown;
  reason?: string;
}): ClassifiedDiscoverySourceOutcome {
  if (input.error !== undefined) {
    return {
      outcome: "failed",
      reason: boundedDiscoverySourceReason(input.error),
    };
  }
  if (input.warning?.trim()) {
    return {
      outcome: "degraded",
      reason: boundedDiscoverySourceReason(
        `partial source response: ${input.warning}`,
      ),
    };
  }
  if (input.complete === false && input.expectedComplete) {
    return {
      outcome: "degraded",
      reason: boundedDiscoverySourceReason(
        input.reason,
        "incomplete source response",
      ),
    };
  }
  if (!input.expectedComplete) {
    return {
      outcome: "limited",
      reason: boundedDiscoverySourceReason(
        input.reason,
        "search-limited by design; absence is not authoritative",
      ),
    };
  }
  if (!input.authoritative) {
    const reason =
      input.reason && input.reason !== "complete source response"
        ? `${input.reason}; non-authoritative by design; absence is not closure evidence`
        : "non-authoritative by design; absence is not closure evidence";
    return {
      outcome: "limited",
      reason: boundedDiscoverySourceReason(reason),
    };
  }
  if (input.complete) {
    return {
      outcome: "complete",
      reason: boundedDiscoverySourceReason(
        input.reason,
        "complete source response",
      ),
    };
  }
  return {
    outcome: "degraded",
    reason: boundedDiscoverySourceReason(
      input.reason,
      "incomplete source response",
    ),
  };
}

export function countDiscoverySourceOutcomes(
  outcomes: DiscoverySourceOutcome[],
): DiscoverySourceOutcomeCounts {
  const counts: DiscoverySourceOutcomeCounts = {
    complete: 0,
    degraded: 0,
    limited: 0,
    failed: 0,
  };
  for (const outcome of outcomes) counts[outcome]++;
  return counts;
}

export function classifyStoredDiscoverySourceRun(input: {
  status: string;
  complete: boolean;
  authoritative: boolean;
  expectedComplete: boolean;
  message: string | null;
}): DiscoverySourceOutcome {
  const status = input.status.toLowerCase();
  if (status === "error" || status === "failed" || status === "running") {
    return "failed";
  }
  if (status === "degraded" || status === "partial") return "degraded";
  if (status === "limited") return "limited";

  const message = input.message?.toLowerCase() ?? "";
  if (message.includes("partial source response")) return "degraded";
  if (
    message.includes("empty result after previously observing") ||
    message.includes("implausible result drop")
  ) {
    return "degraded";
  }
  if (message.includes("search-limited")) return "limited";
  if (!input.expectedComplete || !input.authoritative) return "limited";
  return input.complete ? "complete" : "degraded";
}

function storedStatusForOutcome(
  outcome: DiscoverySourceOutcome,
): "success" | "degraded" | "limited" | "error" {
  switch (outcome) {
    case "complete":
      return "success";
    case "degraded":
      return "degraded";
    case "limited":
      return "limited";
    case "failed":
      return "error";
  }
}

export interface DiscoverySourceRunContext {
  descriptor: DiscoverySourceDescriptor;
  runId: string;
  startedAt: Date;
  observedJobIds: Set<string>;
}

export interface CompletedDiscoverySourceRun {
  runId: string;
  outcome: DiscoverySourceOutcome;
  complete: boolean;
  seeded: boolean;
  observedCount: number;
  reason: string;
  message: string;
}

export interface AvailabilityReconciliationResult {
  checkedRuns: number;
  missing: number;
  verified: number;
  suspect: number;
  closed: number;
}

const AUTHORITATIVE_SYSTEMS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "teamtailor",
]);
const COMPLETE_SEARCH_SYSTEMS = new Set(["phenom", "spotify", "githubboard"]);
const VERIFICATION_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_VERIFICATIONS = 60;
const DEFAULT_MAX_ORPHAN_VERIFICATIONS = 30;
const MAX_VERIFICATION_BODY_BYTES = 250_000;
const MAX_VERIFICATION_REDIRECTS = 5;

function sourceKey(kind: "api" | "browser", system: string, name: string, identity: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(identity).digest("hex").slice(0, 12);
  return `${kind}:${system}:${slug}:${digest}`;
}

export function describeApiSource(company: ApiCompany): DiscoverySourceDescriptor {
  const identity = company.board
    ? `${company.board.owner}/${company.board.repo}/${company.board.ref}/${company.board.path}`
    : company.workday
      ? `${company.workday.host}/${company.workday.tenant}/${company.workday.site}`
      : company.yc?.directoryUrl ?? company.token ?? company.name;
  const authoritative = AUTHORITATIVE_SYSTEMS.has(company.system);
  const aggregator = company.system === "githubboard";
  return {
    key: sourceKey("api", company.system, company.name, identity),
    name: company.name,
    system: company.system,
    company:
      company.system === "githubboard" || company.system === "ycombinator"
        ? null
        : canonicalCompanyName(company.name),
    authoritative,
    positiveEvidence: aggregator ? "secondary" : "direct",
    expectedComplete:
      authoritative || COMPLETE_SEARCH_SYSTEMS.has(company.system),
  };
}

export function describeBrowserSource(
  company: BrowserCompany,
): DiscoverySourceDescriptor {
  return {
    key: sourceKey(
      "browser",
      company.system,
      company.name,
      `${company.searchUrlUS}|${company.searchUrlCA}`,
    ),
    name: company.name,
    system: company.system,
    company: canonicalCompanyName(company.name),
    authoritative: false,
    positiveEvidence: "direct",
    // Browser extractors are intentionally capped and therefore never prove absence.
    expectedComplete: false,
  };
}

export async function beginDiscoverySourceRun(
  descriptor: DiscoverySourceDescriptor,
  startedAt = new Date(),
): Promise<DiscoverySourceRunContext> {
  await prisma.discoverySource.upsert({
    where: { key: descriptor.key },
    create: descriptor,
    update: {
      name: descriptor.name,
      system: descriptor.system,
      company: descriptor.company,
      authoritative: descriptor.authoritative,
      positiveEvidence: descriptor.positiveEvidence,
      expectedComplete: descriptor.expectedComplete,
    },
  });
  const run = await prisma.discoverySourceRun.create({
    data: { sourceKey: descriptor.key, startedAt },
    select: { id: true },
  });
  return {
    descriptor,
    runId: run.id,
    startedAt,
    observedJobIds: new Set<string>(),
  };
}

export function recordDiscoveryJobObservation(
  context: DiscoverySourceRunContext | undefined,
  jobId: string,
) {
  context?.observedJobIds.add(jobId);
}

async function saveObservedSightings(
  context: DiscoverySourceRunContext,
  seenAt: Date,
) {
  const jobIds = [...context.observedJobIds];
  if (jobIds.length === 0) return;

  const existing = await prisma.discoveryJobSighting.findMany({
    where: { sourceKey: context.descriptor.key, jobId: { in: jobIds } },
    select: { jobId: true },
  });
  const existingIds = new Set(existing.map((row) => row.jobId));
  await prisma.discoveryJobSighting.updateMany({
    where: { sourceKey: context.descriptor.key, jobId: { in: jobIds } },
    data: {
      lastSeenAt: seenAt,
      lastSeenRunId: context.runId,
      consecutiveMisses: 0,
      lastMissingAt: null,
    },
  });

  const missingIds = jobIds.filter((jobId) => !existingIds.has(jobId));
  if (missingIds.length > 0) {
    await prisma.discoveryJobSighting.createMany({
      data: missingIds.map((jobId) => ({
        jobId,
        sourceKey: context.descriptor.key,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        lastSeenRunId: context.runId,
      })),
    });
  }
}

function completenessDecision(
  descriptor: DiscoverySourceDescriptor,
  observedCount: number,
  previousCount: number | null,
  previousLowResultAttempt: { observedCount: number } | null,
): ClassifiedDiscoverySourceOutcome & { complete: boolean } {
  if (!descriptor.expectedComplete) {
    return {
      complete: false,
      ...classifyDiscoverySourceOutcome({
        authoritative: descriptor.authoritative,
        expectedComplete: false,
        complete: false,
      }),
    };
  }
  const emptyAfterResults =
    previousCount != null && previousCount > 0 && observedCount === 0;
  const implausibleDrop =
    previousCount != null &&
    previousCount >= 4 &&
    previousCount - observedCount >= 3 &&
    observedCount < Math.ceil(previousCount * 0.25);
  if (emptyAfterResults || implausibleDrop) {
    if (
      previousLowResultAttempt &&
      previousLowResultAttempt.observedCount === observedCount
    ) {
      return {
        complete: true,
        ...classifyDiscoverySourceOutcome({
          authoritative: descriptor.authoritative,
          expectedComplete: true,
          complete: true,
          reason: `repeated low result confirmed (${previousCount} to ${observedCount})`,
        }),
      };
    }
    const reason = emptyAfterResults
      ? `empty result after previously observing ${previousCount} postings`
      : `implausible result drop (${previousCount} to ${observedCount})`;
    return {
      complete: false,
      ...classifyDiscoverySourceOutcome({
        authoritative: descriptor.authoritative,
        expectedComplete: true,
        complete: false,
        reason,
      }),
    };
  }
  return {
    complete: true,
    ...classifyDiscoverySourceOutcome({
      authoritative: descriptor.authoritative,
      expectedComplete: true,
      complete: true,
    }),
  };
}

function isLowResultAttempt(message: string | null): boolean {
  if (!message) return false;
  const separator = message.indexOf("; ");
  if (separator < 0) return false;
  const reason = message.slice(separator + 2);
  return (
    reason.startsWith("empty result after previously observing ") ||
    reason.startsWith("implausible result drop (")
  );
}

async function seedLegacySightings(
  context: DiscoverySourceRunContext,
) {
  const descriptor = context.descriptor;
  if (!descriptor.company) return;

  const jobs = await prisma.job.findMany({
    where: {
      company: descriptor.company,
      discoverySystem: descriptor.system,
    },
    select: { id: true, firstSeenAt: true, lastSeenAt: true },
  });
  if (jobs.length === 0) return;

  const existing = await prisma.discoveryJobSighting.findMany({
    where: {
      sourceKey: descriptor.key,
      jobId: { in: jobs.map((job) => job.id) },
    },
    select: { jobId: true },
  });
  const existingIds = new Set(existing.map((row) => row.jobId));
  const missing = jobs.filter((job) => !existingIds.has(job.id));
  if (missing.length === 0) return;

  await prisma.discoveryJobSighting.createMany({
    data: missing.map((job) => ({
      jobId: job.id,
      sourceKey: descriptor.key,
      firstSeenAt: job.firstSeenAt,
      lastSeenAt: job.lastSeenAt,
      // The first complete run is a baseline, not a miss.
      lastSeenRunId: context.runId,
    })),
  });
}

export async function completeDiscoverySourceRun(
  context: DiscoverySourceRunContext,
  observedCount: number,
  finishedAt = new Date(),
  warning?: string,
): Promise<CompletedDiscoverySourceRun> {
  const source = await prisma.discoverySource.findUniqueOrThrow({
    where: { key: context.descriptor.key },
    select: { baselineAt: true, lastObservedCount: true },
  });
  const previousAttempt = await prisma.discoverySourceRun.findFirst({
    where: {
      sourceKey: context.descriptor.key,
      status: { in: ["success", "degraded", "limited"] },
      id: { not: context.runId },
    },
    orderBy: { startedAt: "desc" },
    select: { observedCount: true, complete: true, message: true },
  });
  const previousLowResultAttempt =
    previousAttempt &&
    !previousAttempt.complete &&
    isLowResultAttempt(previousAttempt.message)
      ? { observedCount: previousAttempt.observedCount }
      : null;
  await saveObservedSightings(context, finishedAt);

  const trimmedWarning = warning?.trim()
    ? boundedDiscoverySourceReason(warning)
    : undefined;
  const decision = trimmedWarning
    ? {
        complete: false,
        ...classifyDiscoverySourceOutcome({
          authoritative: context.descriptor.authoritative,
          expectedComplete: context.descriptor.expectedComplete,
          complete: false,
          warning: trimmedWarning,
        }),
      }
    : completenessDecision(
        context.descriptor,
        observedCount,
        source.lastObservedCount,
        previousLowResultAttempt,
      );
  const seeded = decision.complete && source.baselineAt == null;
  if (seeded) await seedLegacySightings(context);

  const message = `${observedCount} postings; ${decision.reason}`;
  await prisma.$transaction([
    prisma.discoverySourceRun.update({
      where: { id: context.runId },
      data: {
        finishedAt,
        status: storedStatusForOutcome(decision.outcome),
        complete: decision.complete,
        seeded,
        observedCount,
        message,
      },
    }),
    prisma.discoverySource.update({
      where: { key: context.descriptor.key },
      data: {
        lastRunAt: finishedAt,
        lastStatus: storedStatusForOutcome(decision.outcome),
        lastMessage: message,
        ...(decision.complete
          ? {
              lastCompleteRunAt: finishedAt,
              lastObservedCount: observedCount,
              ...(seeded ? { baselineAt: finishedAt } : {}),
            }
          : context.descriptor.expectedComplete
            ? {}
            : { lastObservedCount: observedCount }),
      },
    }),
  ]);

  return {
    runId: context.runId,
    outcome: decision.outcome,
    complete: decision.complete,
    seeded,
    observedCount,
    reason: decision.reason,
    message,
  };
}

export async function failDiscoverySourceRun(
  context: DiscoverySourceRunContext,
  error: unknown,
  finishedAt = new Date(),
) {
  const message = boundedDiscoverySourceReason(error);
  await prisma.$transaction([
    prisma.discoverySourceRun.update({
      where: { id: context.runId },
      data: { finishedAt, status: "error", complete: false, message },
    }),
    prisma.discoverySource.update({
      where: { key: context.descriptor.key },
      data: {
        lastRunAt: finishedAt,
        lastStatus: "error",
        lastMessage: message,
      },
    }),
  ]);
}

export async function recordDiscoverySourceFailure(
  descriptor: DiscoverySourceDescriptor,
  error: unknown,
) {
  const context = await beginDiscoverySourceRun(descriptor);
  await failDiscoverySourceRun(context, error);
}

function verificationInput(job: PostingVerificationInput): PostingVerificationInput {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    applyUrl: job.applyUrl,
    atsType: job.atsType,
    externalId: job.externalId,
  };
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase() || "invalid";
  } catch {
    return "invalid";
  }
}

async function mapPool<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await worker(values[index]);
      }
    }),
  );
  return results;
}

async function verifyWithHostLimits<T extends PostingVerificationInput>(
  postings: T[],
  verify: PostingVerifier,
): Promise<Map<string, PostingVerificationResult>> {
  const byHost = new Map<string, T[]>();
  for (const posting of postings) {
    const host = hostFor(posting.applyUrl);
    byHost.set(host, [...(byHost.get(host) ?? []), posting]);
  }

  const output = new Map<string, PostingVerificationResult>();
  await mapPool([...byHost.values()], 3, async (group) => {
    const results = await mapPool(group, 2, async (posting) => {
      try {
        return await verify(verificationInput(posting));
      } catch (error) {
        return {
          status: "inconclusive" as const,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });
    for (let index = 0; index < group.length; index++) {
      output.set(group[index].id, results[index]);
    }
  });
  return output;
}

function recentOpenVerification(
  job: { lastVerifiedAt: Date | null; lastVerificationResult: string | null },
  now: Date,
) {
  return (
    job.lastVerificationResult === "open" &&
    job.lastVerifiedAt != null &&
    now.getTime() - job.lastVerifiedAt.getTime() < VERIFICATION_CACHE_MS
  );
}

interface VerificationHttpResponse {
  status: number;
  contentType: string;
  body: string;
  redirected: boolean;
}

type VerificationRequester = (
  url: URL,
  signal: AbortSignal,
) => Promise<VerificationHttpResponse>;

function cleanHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

export function isPublicVerificationAddress(
  address: string,
  family = isIP(address),
): boolean {
  if (family === 4) {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return false;
    }
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (
      a === 192 &&
      (b === 168 ||
        (b === 0 && (c === 0 || c === 2)) ||
        (b === 88 && c === 99))
    ) {
      return false;
    }
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) {
      return false;
    }
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family !== 6 || address.includes(".")) return false;

  const parts = address.toLowerCase().split(":");
  const first = Number.parseInt(parts[0] || "0", 16);
  const second = Number.parseInt(parts[1] || "0", 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2002 || first === 0x3fff) return false;
  if (
    first === 0x2001 &&
    (second === 0 || second === 0x0db8 || (second >= 0x20 && second <= 0x2f))
  ) {
    return false;
  }
  return true;
}

async function resolvePublicAddress(url: URL): Promise<LookupAddress> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`unsupported URL protocol ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("posting URL credentials are not allowed");
  }

  const hostname = cleanHostname(url.hostname);
  if (
    !hostname ||
    (!isIP(hostname) && !hostname.includes(".")) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan")
  ) {
    throw new Error("posting URL host is not public");
  }

  const version = isIP(hostname);
  const addresses = version
    ? [{ address: hostname, family: version as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(
      ({ address, family }) =>
        !isPublicVerificationAddress(address, family),
    )
  ) {
    throw new Error("posting URL host resolves to a non-public address");
  }
  return addresses[0];
}

function requestOnce(
  url: URL,
  resolved: LookupAddress,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const pinnedLookup = (
    _hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    if (options.all) callback(null, [resolved]);
    else callback(null, resolved.address, resolved.family);
  };
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: url.protocol,
        hostname: cleanHostname(url.hostname),
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        signal,
        lookup: pinnedLookup,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
          "Accept-Encoding": "identity",
          Connection: "close",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        },
      },
      resolve,
    );
    req.once("error", reject);
    req.end();
  });
}

function readLimitedBody(
  response: IncomingMessage,
  limit = MAX_VERIFICATION_BODY_BYTES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    response.on("data", (value: Buffer | string) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = limit - bytes;
      if (remaining <= 0) {
        finish();
        response.destroy();
        return;
      }
      chunks.push(chunk.subarray(0, remaining));
      bytes += Math.min(chunk.length, remaining);
      if (chunk.length >= remaining) {
        finish();
        response.destroy();
      }
    });
    response.once("end", finish);
    response.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function discardResponse(response: IncomingMessage) {
  response.on("error", () => undefined);
  response.destroy();
}

async function requestPublicPosting(
  url: URL,
  signal: AbortSignal,
  redirects = 0,
): Promise<VerificationHttpResponse> {
  const resolved = await resolvePublicAddress(url);
  const response = await requestOnce(url, resolved, signal);
  const status = response.statusCode ?? 0;
  const locationHeader = response.headers.location;
  const location = Array.isArray(locationHeader)
    ? locationHeader[0]
    : locationHeader;
  if (
    location &&
    [301, 302, 303, 307, 308].includes(status)
  ) {
    discardResponse(response);
    if (redirects >= MAX_VERIFICATION_REDIRECTS) {
      throw new Error("posting verification exceeded the redirect limit");
    }
    return requestPublicPosting(
      new URL(location, url),
      signal,
      redirects + 1,
    );
  }

  const contentTypeHeader = response.headers["content-type"];
  const contentType = (Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(",")
    : contentTypeHeader ?? "").toLowerCase();
  const isHtml =
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml");
  const inspectBody =
    isHtml ||
    contentType.includes("application/json") ||
    contentType.includes("text/plain");
  const body = inspectBody ? await readLimitedBody(response) : "";
  if (!inspectBody) discardResponse(response);
  return {
    status,
    contentType,
    body,
    redirected: redirects > 0,
  };
}

function hasPostingEvidence(
  response: VerificationHttpResponse,
  posting: PostingVerificationInput,
) {
  const normalizedBody = response.body
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const title = posting.title.trim().toLowerCase();
  const externalId = posting.externalId?.trim().toLowerCase() ?? "";
  const matchesIdentity =
    (title.length > 0 && normalizedBody.includes(title)) ||
    (externalId.length > 0 && normalizedBody.includes(externalId));
  const hasApplicationMarker =
    /"@type"\s*:\s*"jobposting"|apply for this job|apply now|submit application|job application/i.test(
      response.body,
    );
  return (
    matchesIdentity &&
    (hasApplicationMarker || response.contentType.includes("application/json"))
  );
}

export async function verifyPostingUrl(
  posting: PostingVerificationInput,
  options: { request?: VerificationRequester } = {},
): Promise<PostingVerificationResult> {
  let url: URL;
  try {
    url = new URL(posting.applyUrl);
  } catch {
    return { status: "inconclusive", reason: "invalid apply URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await (options.request ?? requestPublicPosting)(
      url,
      controller.signal,
    );
    if (response.status === 404 || response.status === 410) {
      return {
        status: "closed",
        reason: `posting returned HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return {
        status: "inconclusive",
        reason: `posting verification returned HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        status: "inconclusive",
        reason: `posting verification returned HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }

    if (
      response.contentType.includes("text/html") ||
      response.contentType.includes("application/xhtml+xml")
    ) {
      const text = response.body.replace(/\s+/g, " ");
      const closedMarkers = [
        /\b(?:this|the) (?:job|position|posting) (?:is|has been) (?:closed|filled|expired|no longer available)\b/i,
        /\b(?:job|position|posting) (?:is )?no longer accepting applications\b/i,
        /\b(?:this|the) (?:job|position|posting) (?:is )?(?:unavailable|not available)\b/i,
      ];
      if (closedMarkers.some((marker) => marker.test(text))) {
        return {
          status: "closed",
          reason: "posting page says the role is no longer available",
          httpStatus: response.status,
        };
      }
    }
    if (!hasPostingEvidence(response, posting)) {
      return {
        status: "inconclusive",
        reason: response.redirected
          ? "posting redirected to a page without matching job evidence"
          : "posting page did not contain matching job evidence",
        httpStatus: response.status,
      };
    }
    return {
      status: "open",
      reason: `posting returned HTTP ${response.status}`,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      status: "inconclusive",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "posting verification timed out"
          : error instanceof Error
            ? error.message
            : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

interface ReconciliationCandidate extends PostingVerificationInput {
  availabilityStatus: string;
  consecutiveMisses: number;
  lastVerifiedAt: Date | null;
  lastVerificationResult: string | null;
  sourceNames: Set<string>;
  authoritativeSourceNames: Set<string>;
  authoritative: boolean;
  maxSourceMisses: number;
  maxAuthoritativeMisses: number;
  sightingIds: string[];
}

async function hasCurrentDirectEvidence(
  jobId: string,
  sourceKey: string,
  cycleStartedAt: Date,
) {
  const sightings = await prisma.discoveryJobSighting.findMany({
    where: {
      jobId,
      sourceKey: { not: sourceKey },
      lastSeenAt: { gte: cycleStartedAt },
    },
    select: { source: { select: { positiveEvidence: true } } },
  });
  return sightings.some((sighting) => sighting.source.positiveEvidence === "direct");
}

export async function reconcileDiscoverySourceRuns(
  runIds: string[],
  options: {
    cycleStartedAt?: Date;
    verify?: PostingVerifier;
    maxVerifications?: number;
  } = {},
): Promise<AvailabilityReconciliationResult> {
  const summary: AvailabilityReconciliationResult = {
    checkedRuns: 0,
    missing: 0,
    verified: 0,
    suspect: 0,
    closed: 0,
  };
  if (runIds.length === 0) return summary;

  const cycleStartedAt = options.cycleStartedAt ?? new Date();
  const verify = options.verify ?? verifyPostingUrl;
  const runs = await prisma.discoverySourceRun.findMany({
    where: {
      id: { in: runIds },
      status: { in: ["success", "limited"] },
      complete: true,
      seeded: false,
    },
    include: { source: true },
  });
  summary.checkedRuns = runs.length;

  const candidates = new Map<string, ReconciliationCandidate>();
  for (const run of runs) {
    const missed = await prisma.discoveryJobSighting.findMany({
      where: {
        sourceKey: run.sourceKey,
        lastSeenRunId: { not: run.id },
        job: { availabilityStatus: { not: JOB_AVAILABILITY.CLOSED } },
      },
      include: { job: true },
    });
    for (const sighting of missed) {
      summary.missing++;
      const sourceMisses = sighting.consecutiveMisses + 1;
      await prisma.discoveryJobSighting.update({
        where: { id: sighting.id },
        data: {
          consecutiveMisses: sourceMisses,
          lastMissingAt: run.finishedAt ?? new Date(),
        },
      });

      if (
        await hasCurrentDirectEvidence(
          sighting.jobId,
          run.sourceKey,
          cycleStartedAt,
        )
      ) {
        await prisma.$transaction([
          prisma.job.update({
            where: { id: sighting.jobId },
            data: {
              availabilityStatus: JOB_AVAILABILITY.OPEN,
              consecutiveMisses: 0,
              closedAt: null,
              closureReason: null,
            },
          }),
          prisma.discoveryJobSighting.update({
            where: { id: sighting.id },
            data: { consecutiveMisses: 0, lastMissingAt: null },
          }),
        ]);
        continue;
      }

      await prisma.job.update({
        where: { id: sighting.jobId },
        data: {
          availabilityStatus: JOB_AVAILABILITY.SUSPECT,
          consecutiveMisses: Math.max(
            sighting.job.consecutiveMisses,
            sourceMisses,
          ),
        },
      });

      const existing = candidates.get(sighting.jobId);
      if (existing) {
        existing.sourceNames.add(run.source.name);
        existing.authoritative ||= run.source.authoritative;
        if (run.source.authoritative) {
          existing.authoritativeSourceNames.add(run.source.name);
          existing.maxAuthoritativeMisses = Math.max(
            existing.maxAuthoritativeMisses,
            sourceMisses,
          );
        }
        existing.maxSourceMisses = Math.max(
          existing.maxSourceMisses,
          sourceMisses,
        );
        existing.sightingIds.push(sighting.id);
      } else {
        candidates.set(sighting.jobId, {
          ...verificationInput(sighting.job),
          availabilityStatus: sighting.job.availabilityStatus,
          consecutiveMisses: sighting.job.consecutiveMisses,
          lastVerifiedAt: sighting.job.lastVerifiedAt,
          lastVerificationResult: sighting.job.lastVerificationResult,
          sourceNames: new Set([run.source.name]),
          authoritativeSourceNames: new Set(
            run.source.authoritative ? [run.source.name] : [],
          ),
          authoritative: run.source.authoritative,
          maxSourceMisses: sourceMisses,
          maxAuthoritativeMisses: run.source.authoritative ? sourceMisses : 0,
          sightingIds: [sighting.id],
        });
      }
    }
  }

  const now = new Date();
  const ordered = [...candidates.values()].sort(
    (a, b) =>
      Number(b.authoritative) - Number(a.authoritative) ||
      b.maxSourceMisses - a.maxSourceMisses ||
      (a.lastVerifiedAt?.getTime() ?? 0) - (b.lastVerifiedAt?.getTime() ?? 0),
  );
  const cachedOpen = ordered.filter((candidate) =>
    recentOpenVerification(candidate, now),
  );
  for (const candidate of cachedOpen) {
    await prisma.$transaction([
      prisma.job.update({
        where: { id: candidate.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.OPEN,
          consecutiveMisses: 0,
          closedAt: null,
          closureReason: null,
        },
      }),
      prisma.discoveryJobSighting.updateMany({
        where: { id: { in: candidate.sightingIds } },
        data: { consecutiveMisses: 0 },
      }),
    ]);
  }

  const maxVerifications =
    options.maxVerifications ?? DEFAULT_MAX_VERIFICATIONS;
  const toVerify = ordered
    .filter((candidate) => !recentOpenVerification(candidate, now))
    .slice(0, maxVerifications);
  const results = await verifyWithHostLimits(toVerify, verify);
  const suspectIds = new Set<string>();
  for (const candidate of ordered) {
    if (cachedOpen.includes(candidate)) continue;
    const result = results.get(candidate.id);
    if (!result) {
      suspectIds.add(candidate.id);
      continue;
    }
    summary.verified++;
    await prisma.discoveryJobSighting.updateMany({
      where: { id: { in: candidate.sightingIds } },
      data: {
        lastVerifiedAt: now,
        lastVerificationStatus: result.status,
      },
    });

    if (result.status === "open") {
      await prisma.$transaction([
        prisma.job.update({
          where: { id: candidate.id },
          data: {
            availabilityStatus: JOB_AVAILABILITY.OPEN,
            consecutiveMisses: 0,
            lastVerifiedAt: now,
            lastVerificationResult: result.status,
            closedAt: null,
            closureReason: null,
          },
        }),
        prisma.discoveryJobSighting.updateMany({
          where: { id: { in: candidate.sightingIds } },
          data: { consecutiveMisses: 0 },
        }),
      ]);
      continue;
    }

    const closeFromMisses =
      result.status === "inconclusive" &&
      candidate.authoritative &&
      candidate.maxAuthoritativeMisses >= 2;
    if (result.status === "closed" || closeFromMisses) {
      const closureReason =
        result.status === "closed"
          ? result.reason
          : `Missing from ${[...candidate.authoritativeSourceNames].join(", ")} on ${candidate.maxAuthoritativeMisses} complete runs; verification was inconclusive`;
      await prisma.job.update({
        where: { id: candidate.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.CLOSED,
          consecutiveMisses: candidate.maxSourceMisses,
          lastVerifiedAt: now,
          lastVerificationResult: result.status,
          closedAt: now,
          closureReason,
        },
      });
      summary.closed++;
    } else {
      suspectIds.add(candidate.id);
      await prisma.job.update({
        where: { id: candidate.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.SUSPECT,
          consecutiveMisses: candidate.maxSourceMisses,
          lastVerifiedAt: now,
          lastVerificationResult: result.status,
        },
      });
    }
  }
  summary.suspect = suspectIds.size;
  return summary;
}

export async function verifyUntrackedDiscoveryJobs(
  cycleStartedAt: Date,
  options: {
    verify?: PostingVerifier;
    maxVerifications?: number;
  } = {},
): Promise<AvailabilityReconciliationResult> {
  const verify = options.verify ?? verifyPostingUrl;
  const now = new Date();
  const cacheCutoff = new Date(now.getTime() - VERIFICATION_CACHE_MS);
  const jobs = await prisma.job.findMany({
    where: {
      isEntryLevel: true,
      discoverySystem: { not: null },
      availabilityStatus: { not: JOB_AVAILABILITY.CLOSED },
      lastSeenAt: { lt: cycleStartedAt },
      // Jobs backed only by capped/search-limited sources need periodic direct
      // verification. The same fallback covers disabled or currently incomplete
      // sources without turning their absence into a reconciliation miss.
      discoverySightings: {
        none: { source: { lastCompleteRunAt: { gte: cycleStartedAt } } },
      },
      OR: [
        { lastVerifiedAt: null },
        { lastVerifiedAt: { lt: cacheCutoff } },
      ],
    },
    orderBy: { lastSeenAt: "asc" },
    take:
      options.maxVerifications ?? DEFAULT_MAX_ORPHAN_VERIFICATIONS,
  });
  const results = await verifyWithHostLimits(jobs, verify);
  const summary: AvailabilityReconciliationResult = {
    checkedRuns: 0,
    missing: jobs.length,
    verified: jobs.length,
    suspect: 0,
    closed: 0,
  };

  for (const job of jobs) {
    const result = results.get(job.id) ?? {
      status: "inconclusive" as const,
      reason: "posting was not verified",
    };
    if (result.status === "closed") {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.CLOSED,
          consecutiveMisses: Math.max(1, job.consecutiveMisses),
          lastVerifiedAt: now,
          lastVerificationResult: result.status,
          closedAt: now,
          closureReason: result.reason,
        },
      });
      summary.closed++;
    } else if (result.status === "open") {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.OPEN,
          consecutiveMisses: 0,
          lastVerifiedAt: now,
          lastVerificationResult: result.status,
          closedAt: null,
          closureReason: null,
        },
      });
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          availabilityStatus: JOB_AVAILABILITY.SUSPECT,
          consecutiveMisses: Math.max(1, job.consecutiveMisses),
          lastVerifiedAt: now,
          lastVerificationResult: result.status,
        },
      });
      summary.suspect++;
    }
  }
  return summary;
}
