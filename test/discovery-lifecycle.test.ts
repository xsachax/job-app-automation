import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/db";
import type { DiscoveryPosting } from "../lib/discovery/adapters";
import {
  JOB_AVAILABILITY,
  beginDiscoverySourceRun,
  classifyDiscoverySourceOutcome,
  classifyStoredDiscoverySourceRun,
  completeDiscoverySourceRun,
  countDiscoverySourceOutcomes,
  failDiscoverySourceRun,
  isPublicVerificationAddress,
  reconcileDiscoverySourceRuns,
  verifyPostingUrl,
  verifyUntrackedDiscoveryJobs,
  type DiscoverySourceDescriptor,
  type PostingVerifier,
} from "../lib/discovery/lifecycle";
import {
  ingestPostings,
  ingestSourcePostings,
  runDiscovery,
} from "../lib/discovery/run";
import { resetDb } from "./helpers";

const DIRECT_SOURCE: DiscoverySourceDescriptor = {
  key: "test:greenhouse:acme",
  name: "Acme",
  system: "greenhouse",
  company: "Acme",
  authoritative: true,
  positiveEvidence: "direct",
  expectedComplete: true,
};

const BOARD_SOURCE: DiscoverySourceDescriptor = {
  key: "test:githubboard:new-grad",
  name: "Test New-Grad Board",
  system: "githubboard",
  company: null,
  authoritative: false,
  positiveEvidence: "secondary",
  expectedComplete: true,
};

const LIMITED_SOURCE: DiscoverySourceDescriptor = {
  key: "test:browser:acme",
  name: "Acme Browser",
  system: "apple",
  company: "Acme",
  authoritative: false,
  positiveEvidence: "direct",
  expectedComplete: false,
};

const BASE_TIME = new Date("2026-08-08T00:00:00.000Z").getTime();

function at(slot: number, seconds = 0) {
  return new Date(BASE_TIME + slot * 60_000 + seconds * 1_000);
}

function posting(overrides: Partial<DiscoveryPosting> = {}): DiscoveryPosting {
  return {
    company: "Acme",
    title: "Software Engineer, New Grad",
    location: "San Francisco, CA",
    country: "US",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
    externalId: "123",
    description: "New graduate software role. No prior experience required.",
    postedAt: null,
    system: "greenhouse",
    ...overrides,
  };
}

async function successfulRun(
  descriptor: DiscoverySourceDescriptor,
  postings: DiscoveryPosting[],
  slot: number,
  observedCount = postings.length,
) {
  const context = await beginDiscoverySourceRun(descriptor, at(slot));
  await ingestPostings(postings, true, undefined, { sourceRun: context });
  const completed = await completeDiscoverySourceRun(
    context,
    observedCount,
    at(slot, 5),
  );
  return { context, completed };
}

const inconclusive: PostingVerifier = vi.fn(async () => ({
  status: "inconclusive" as const,
  reason: "blocked by test host",
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discovery posting lifecycle", () => {
  it("requires two complete authoritative misses, retains history, and reopens the same row", async () => {
    const seeded = await successfulRun(DIRECT_SOURCE, [posting()], 0);
    await reconcileDiscoverySourceRuns([seeded.completed.runId], {
      cycleStartedAt: seeded.context.startedAt,
      verify: inconclusive,
    });
    const original = await prisma.job.findFirstOrThrow();
    await prisma.job.update({
      where: { id: original.id },
      data: { applicationStatus: "saved" },
    });

    const guardedDrop = await successfulRun(DIRECT_SOURCE, [], 1);
    expect(guardedDrop.completed.complete).toBe(false);
    expect(
      await reconcileDiscoverySourceRuns([guardedDrop.completed.runId], {
        cycleStartedAt: guardedDrop.context.startedAt,
        verify: inconclusive,
      }),
    ).toMatchObject({ checkedRuns: 0, missing: 0 });

    const firstMiss = await successfulRun(DIRECT_SOURCE, [], 2);
    const firstResult = await reconcileDiscoverySourceRuns(
      [firstMiss.completed.runId],
      {
        cycleStartedAt: firstMiss.context.startedAt,
        verify: inconclusive,
      },
    );
    expect(firstResult).toMatchObject({ missing: 1, suspect: 1, closed: 0 });
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.SUSPECT,
      consecutiveMisses: 1,
      applicationStatus: "saved",
    });

    const secondMiss = await successfulRun(DIRECT_SOURCE, [], 3);
    const secondResult = await reconcileDiscoverySourceRuns(
      [secondMiss.completed.runId],
      {
        cycleStartedAt: secondMiss.context.startedAt,
        verify: inconclusive,
      },
    );
    expect(secondResult).toMatchObject({ missing: 1, closed: 1 });
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.CLOSED,
      consecutiveMisses: 2,
      applicationStatus: "saved",
    });

    const reappeared = await successfulRun(DIRECT_SOURCE, [posting()], 4);
    await reconcileDiscoverySourceRuns([reappeared.completed.runId], {
      cycleStartedAt: reappeared.context.startedAt,
      verify: inconclusive,
    });
    expect(await prisma.job.count()).toBe(1);
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.OPEN,
      consecutiveMisses: 0,
      applicationStatus: "saved",
      closedAt: null,
      closureReason: null,
    });
  });

  it("invalidates cached verification when a direct posting URL changes", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    const job = await prisma.job.findFirstOrThrow();
    await prisma.job.update({
      where: { id: job.id },
      data: {
        lastVerifiedAt: at(0),
        lastVerificationResult: "open",
      },
    });

    await successfulRun(
      DIRECT_SOURCE,
      [posting({ applyUrl: "https://example.test/jobs/123/apply" })],
      1,
    );

    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      applyUrl: "https://example.test/jobs/123/apply",
      lastVerifiedAt: null,
      lastVerificationResult: null,
    });
  });

  it("quarantines failed, degraded, and intentionally limited runs from closure", async () => {
    const seeded = await successfulRun(DIRECT_SOURCE, [posting()], 0, 100);
    await reconcileDiscoverySourceRuns([seeded.completed.runId], {
      cycleStartedAt: seeded.context.startedAt,
      verify: inconclusive,
    });
    const limitedSeen = await successfulRun(
      LIMITED_SOURCE,
      [
        posting({
          system: "apple",
          externalId: "apple-123",
          applyUrl: "https://jobs.apple.com/details/apple-123",
        }),
      ],
      1,
    );
    expect(limitedSeen.completed.outcome).toBe("limited");

    const degraded = await successfulRun(DIRECT_SOURCE, [], 2, 10);
    expect(degraded.completed).toMatchObject({
      complete: false,
      outcome: "degraded",
    });
    expect(degraded.completed.message).toContain("implausible result drop");
    const limited = await successfulRun(LIMITED_SOURCE, [], 3);
    expect(limited.completed).toMatchObject({
      complete: false,
      outcome: "limited",
    });
    const failed = await beginDiscoverySourceRun(DIRECT_SOURCE, at(4));
    await failDiscoverySourceRun(failed, new Error("HTTP 503"), at(4, 5));
    expect(
      await reconcileDiscoverySourceRuns(
        [degraded.completed.runId, limited.completed.runId, failed.runId],
        {
          cycleStartedAt: failed.startedAt,
          verify: inconclusive,
        },
      ),
    ).toMatchObject({ checkedRuns: 0, missing: 0 });

    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.OPEN,
      consecutiveMisses: 0,
    });
  });

  it("confirms a repeated low result only after a clean low-result attempt", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0, 100);

    const warnedContext = await beginDiscoverySourceRun(DIRECT_SOURCE, at(1));
    const warned = await completeDiscoverySourceRun(
      warnedContext,
      10,
      at(1, 5),
      "one detail subrequest returned HTTP 429",
    );
    expect(warned.complete).toBe(false);

    const firstCleanLowResult = await successfulRun(
      DIRECT_SOURCE,
      [],
      2,
      10,
    );
    expect(firstCleanLowResult.completed).toMatchObject({
      complete: false,
    });
    expect(firstCleanLowResult.completed.message).toContain(
      "implausible result drop",
    );

    const repeatedCleanLowResult = await successfulRun(
      DIRECT_SOURCE,
      [],
      3,
      10,
    );
    expect(repeatedCleanLowResult.completed).toMatchObject({
      complete: true,
    });
    expect(repeatedCleanLowResult.completed.message).toContain(
      "repeated low result confirmed",
    );
  });

  it("does not confirm a stale low result across a healthy limited run", async () => {
    const nonAuthoritativeComplete = {
      ...DIRECT_SOURCE,
      key: "test:phenom:acme",
      system: "phenom",
      authoritative: false,
    };
    await successfulRun(nonAuthoritativeComplete, [posting()], 0, 100);

    const firstLow = await successfulRun(
      nonAuthoritativeComplete,
      [],
      1,
      10,
    );
    expect(firstLow.completed).toMatchObject({
      complete: false,
      outcome: "degraded",
    });

    const recovered = await successfulRun(
      nonAuthoritativeComplete,
      [posting()],
      2,
      100,
    );
    expect(recovered.completed).toMatchObject({
      complete: true,
      outcome: "limited",
    });

    const laterLow = await successfulRun(
      nonAuthoritativeComplete,
      [],
      3,
      10,
    );
    expect(laterLow.completed).toMatchObject({
      complete: false,
      outcome: "degraded",
    });
    expect(laterLow.completed.message).toContain("implausible result drop");
    expect(laterLow.completed.message).not.toContain(
      "repeated low result confirmed",
    );
  });

  it("persists non-fatal source warnings as degraded and quarantines the run", async () => {
    const result = await ingestSourcePostings(
      DIRECT_SOURCE,
      [posting()],
      true,
      undefined,
      { sourceWarning: "one board subrequest returned HTTP 429" },
    );

    expect(result.sourceRun).toMatchObject({
      complete: false,
      outcome: "degraded",
      seeded: false,
    });
    expect(result.sourceRun.message).toContain("partial source response");
    expect(result.sourceRun.message).toContain("HTTP 429");
    expect(
      await prisma.discoverySource.findUniqueOrThrow({
        where: { key: DIRECT_SOURCE.key },
      }),
    ).toMatchObject({
      baselineAt: null,
      lastCompleteRunAt: null,
      lastStatus: "degraded",
    });
  });

  it("reports configured search-limited sources as intentional limits", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDiscovery({
      companies: ["Amazon"],
      concurrency: 1,
      reconcile: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      outcomes: {
        complete: 0,
        degraded: 0,
        limited: 1,
        failed: 0,
      },
      companies: [
        {
          company: "Amazon",
          sourceComplete: false,
          outcome: "limited",
        },
      ],
    });
    expect(result.companies[0]?.reason).toContain(
      "search-limited by design",
    );
    const sourceRunId = result.companies[0]?.sourceRunId;
    if (!sourceRunId) throw new Error("Amazon source run was not recorded");
    expect(
      await prisma.discoverySourceRun.findUniqueOrThrow({
        where: { id: sourceRunId },
      }),
    ).toMatchObject({ status: "limited", complete: false });
  });

  it("reconstructs the snapshot outcomes as mutually exclusive", () => {
    const outcomes = [
      classifyStoredDiscoverySourceRun({
        status: "error",
        complete: false,
        authoritative: false,
        expectedComplete: false,
        message: "HTTP 404",
      }),
      classifyStoredDiscoverySourceRun({
        status: "success",
        complete: false,
        authoritative: false,
        expectedComplete: false,
        message:
          "50 postings; partial source response: Microsoft pagination stopped after 50 postings: HTTP 429",
      }),
      classifyStoredDiscoverySourceRun({
        status: "success",
        complete: false,
        authoritative: false,
        expectedComplete: false,
        message:
          "1433 postings; partial source response: 27 non-fatal subrequest warnings",
      }),
      classifyStoredDiscoverySourceRun({
        status: "success",
        complete: false,
        authoritative: false,
        expectedComplete: false,
        message:
          "409 postings; source is search-limited or partial; absence is not authoritative",
      }),
      classifyStoredDiscoverySourceRun({
        status: "success",
        complete: true,
        authoritative: false,
        expectedComplete: true,
        message: "2649 postings; complete source response",
      }),
    ];

    expect(outcomes).toEqual([
      "failed",
      "degraded",
      "degraded",
      "limited",
      "limited",
    ]);
    expect(countDiscoverySourceOutcomes(outcomes)).toEqual({
      complete: 0,
      degraded: 2,
      limited: 2,
      failed: 1,
    });

    const bounded = classifyDiscoverySourceOutcome({
      authoritative: true,
      expectedComplete: true,
      warning: `line one\n${"x".repeat(1_000)}`,
    });
    expect(bounded.reason).toHaveLength(600);
    expect(bounded.reason).not.toContain("\n");
  });

  it("records a still-present role before classification removes it from the queue", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    const changed = await successfulRun(
      DIRECT_SOURCE,
      [
        posting({
          title: "Senior Software Engineer",
          description: "Requires 7+ years of professional experience.",
        }),
      ],
      1,
    );
    const reconciliation = await reconcileDiscoverySourceRuns(
      [changed.completed.runId],
      {
        cycleStartedAt: changed.context.startedAt,
        verify: inconclusive,
      },
    );

    expect(reconciliation.missing).toBe(0);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      title: "Senior Software Engineer",
      isEntryLevel: false,
      availabilityStatus: JOB_AVAILABILITY.OPEN,
      consecutiveMisses: 0,
    });
  });

  it("moves a relocated exact requisition out of the configured country queue", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    await successfulRun(
      DIRECT_SOURCE,
      [
        posting({
          location: "London, United Kingdom",
          country: "OTHER",
        }),
      ],
      1,
    );

    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      country: "OTHER",
      location: "London, United Kingdom",
      isEntryLevel: false,
      availabilityStatus: JOB_AVAILABILITY.OPEN,
    });
  });

  it("never closes a role from aggregator disappearance alone", async () => {
    const boardPosting = posting({
      system: "githubboard",
      externalId: "board-123",
      applyUrl: "https://example.test/jobs/123",
    });
    const initial = await successfulRun(BOARD_SOURCE, [boardPosting], 0);
    expect(initial.completed).toMatchObject({
      complete: true,
      outcome: "limited",
    });

    for (const slot of [1, 2, 3]) {
      const missing = await successfulRun(BOARD_SOURCE, [], slot);
      await reconcileDiscoverySourceRuns([missing.completed.runId], {
        cycleStartedAt: missing.context.startedAt,
        verify: inconclusive,
      });
    }

    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.SUSPECT,
    });
  });

  it("keeps one canonical row and records direct plus aggregator evidence", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    await successfulRun(
      BOARD_SOURCE,
      [
        posting({
          system: "githubboard",
          externalId: "board-copy",
          applyUrl: "https://example.test/aggregated/123",
        }),
      ],
      1,
    );

    const job = await prisma.job.findFirstOrThrow({
      include: { discoverySightings: true },
    });
    expect(await prisma.job.count()).toBe(1);
    expect(job.discoverySystem).toBe("greenhouse");
    expect(job.applyUrl).toContain("greenhouse");
    expect(job.discoverySightings).toHaveLength(2);

    await successfulRun(BOARD_SOURCE, [], 2);
    const directCurrent = await successfulRun(DIRECT_SOURCE, [posting()], 3);
    const boardMissing = await successfulRun(BOARD_SOURCE, [], 3);
    await reconcileDiscoverySourceRuns(
      [directCurrent.completed.runId, boardMissing.completed.runId],
      {
        cycleStartedAt: at(3),
        verify: inconclusive,
      },
    );
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.OPEN,
      consecutiveMisses: 0,
    });
  });

  it("does not combine aggregator misses with a single authoritative miss", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    await successfulRun(
      BOARD_SOURCE,
      [
        posting({
          system: "githubboard",
          externalId: "board-copy",
          applyUrl: "https://example.test/aggregated/123",
        }),
      ],
      0,
    );

    await successfulRun(BOARD_SOURCE, [], 1);
    const boardMissOne = await successfulRun(BOARD_SOURCE, [], 2);
    await reconcileDiscoverySourceRuns([boardMissOne.completed.runId], {
      cycleStartedAt: boardMissOne.context.startedAt,
      verify: inconclusive,
    });
    const boardMissTwo = await successfulRun(BOARD_SOURCE, [], 3);
    await reconcileDiscoverySourceRuns([boardMissTwo.completed.runId], {
      cycleStartedAt: boardMissTwo.context.startedAt,
      verify: inconclusive,
    });

    await successfulRun(DIRECT_SOURCE, [], 1);
    const directFirstMiss = await successfulRun(DIRECT_SOURCE, [], 4);
    const boardMissThree = await successfulRun(BOARD_SOURCE, [], 4);
    const result = await reconcileDiscoverySourceRuns(
      [directFirstMiss.completed.runId, boardMissThree.completed.runId],
      {
        cycleStartedAt: at(4),
        verify: inconclusive,
      },
    );

    expect(result.closed).toBe(0);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.SUSPECT,
    });
  });

  it("archives immediately when targeted verification returns a hard closure", async () => {
    await successfulRun(DIRECT_SOURCE, [posting()], 0);
    await successfulRun(DIRECT_SOURCE, [], 1);
    const missing = await successfulRun(DIRECT_SOURCE, [], 2);
    const result = await reconcileDiscoverySourceRuns(
      [missing.completed.runId],
      {
        cycleStartedAt: missing.context.startedAt,
        verify: async () => ({
          status: "closed",
          reason: "posting returned HTTP 410",
          httpStatus: 410,
        }),
      },
    );

    expect(result.closed).toBe(1);
    expect(await prisma.job.findFirstOrThrow()).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.CLOSED,
      closureReason: "posting returned HTTP 410",
    });
  });

  it("hard-verifies untracked legacy rows without deleting saved state", async () => {
    const job = await prisma.job.create({
      data: {
        dedupeKey: "greenhouse:legacy",
        atsType: "greenhouse",
        externalId: "legacy",
        title: "Legacy Software Engineer",
        company: "Legacy Co",
        applyUrl: "https://example.test/jobs/legacy",
        country: "US",
        isEntryLevel: true,
        discoverySystem: "greenhouse",
        applicationStatus: "applied",
        appliedAt: at(0),
        lastSeenAt: at(0),
      },
    });

    const result = await verifyUntrackedDiscoveryJobs(at(5), {
      verify: async () => ({
        status: "closed",
        reason: "posting returned HTTP 404",
        httpStatus: 404,
      }),
    });

    expect(result.closed).toBe(1);
    expect(await prisma.job.count()).toBe(1);
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      availabilityStatus: JOB_AVAILABILITY.CLOSED,
      applicationStatus: "applied",
      closureReason: "posting returned HTTP 404",
    });
  });

  it("periodically verifies jobs whose only sightings come from limited sources", async () => {
    const observed = await successfulRun(
      LIMITED_SOURCE,
      [
        posting({
          system: "apple",
          externalId: "apple-123",
          applyUrl: "https://jobs.apple.com/details/apple-123",
        }),
      ],
      0,
    );
    expect(observed.completed).toMatchObject({
      complete: false,
      outcome: "limited",
    });
    const job = await prisma.job.findFirstOrThrow();
    expect(
      await prisma.discoveryJobSighting.count({ where: { jobId: job.id } }),
    ).toBe(1);
    await prisma.job.update({
      where: { id: job.id },
      data: { lastSeenAt: at(0, 5) },
    });

    const result = await verifyUntrackedDiscoveryJobs(at(10), {
      verify: async () => ({
        status: "closed",
        reason: "posting returned HTTP 404",
        httpStatus: 404,
      }),
    });

    expect(result.closed).toBe(1);
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({ availabilityStatus: JOB_AVAILABILITY.CLOSED });
  });

  it("uses only hard HTTP or explicit page evidence for targeted closure", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 410,
        contentType: "text/html",
        body: "",
        redirected: false,
      })
      .mockResolvedValueOnce({
        status: 200,
        contentType: "text/html",
        body: "<html><body>This job is no longer accepting applications.</body></html>",
        redirected: false,
      })
      .mockResolvedValueOnce({
        status: 403,
        contentType: "text/html",
        body: "",
        redirected: false,
      })
      .mockResolvedValueOnce({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Careers at Acme</body></html>",
        redirected: true,
      })
      .mockResolvedValueOnce({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Careers at Acme</body></html>",
        redirected: false,
      })
      .mockResolvedValueOnce({
        status: 200,
        contentType: "text/html",
        body: '<script type="application/ld+json">{"@type":"JobPosting","title":"Software Engineer"}</script>',
        redirected: true,
      });
    const input = {
      id: "job",
      title: "Software Engineer",
      company: "Acme",
      applyUrl: "https://example.test/jobs/123",
      atsType: "greenhouse",
      externalId: "123",
    };

    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "closed",
      httpStatus: 410,
    });
    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "closed",
      httpStatus: 200,
    });
    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "inconclusive",
      httpStatus: 403,
    });
    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "inconclusive",
      httpStatus: 200,
    });
    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "inconclusive",
      httpStatus: 200,
    });
    await expect(verifyPostingUrl(input, { request })).resolves.toMatchObject({
      status: "open",
      httpStatus: 200,
    });
  });

  it("rejects private, local, and reserved verification addresses", async () => {
    expect(isPublicVerificationAddress("127.0.0.1")).toBe(false);
    expect(isPublicVerificationAddress("169.254.169.254")).toBe(false);
    expect(isPublicVerificationAddress("10.0.0.1")).toBe(false);
    expect(isPublicVerificationAddress("::1")).toBe(false);
    expect(isPublicVerificationAddress("2001:db8::1")).toBe(false);
    expect(isPublicVerificationAddress("8.8.8.8")).toBe(true);
    expect(isPublicVerificationAddress("2606:4700:4700::1111")).toBe(true);
    await expect(
      verifyPostingUrl({
        id: "private-job",
        title: "Software Engineer",
        company: "Acme",
        applyUrl: "http://169.254.169.254/latest/meta-data",
        atsType: "unknown",
        externalId: null,
      }),
    ).resolves.toMatchObject({
      status: "inconclusive",
      reason: "posting URL host resolves to a non-public address",
    });
  });
});
