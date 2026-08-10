import type { ScoreAllJobsResult } from "../judge/judge";
import { runJudgeScoring } from "../judge/run";
import { prisma } from "../db";
import {
  BROWSER_COMPANIES,
  DISCOVERY_SOURCES,
  SCRAPABLE_BROWSER_SYSTEMS,
  type BrowserSystem,
} from "./companies";
import { getDiscoveryConfig, toEntryLevelOptions } from "./config";
import {
  scrapeBrowserCompanies,
  type BrowserScrapeResult,
} from "./browser";
import {
  ingestSourcePostings,
  runDiscovery,
  type DiscoveryRunResult,
  type IngestCounts,
} from "./run";
import {
  classifyDiscoverySourceOutcome,
  countDiscoverySourceOutcomes,
  describeBrowserSource,
  reconcileDiscoverySourceRuns,
  recordDiscoverySourceFailure,
  verifyUntrackedDiscoveryJobs,
  type AvailabilityReconciliationResult,
  type CompletedDiscoverySourceRun,
  type DiscoverySourceDescriptor,
  type DiscoverySourceOutcomeCounts,
  type DiscoverySourceOutcome,
} from "./lifecycle";

export interface BrowserRefreshResult {
  company: string;
  system: BrowserSystem;
  usFound: number;
  caFound: number;
  usEntry: number;
  caEntry: number;
  created: number;
  updated: number;
  sourceComplete: boolean;
  observedCount: number;
  outcome: DiscoverySourceOutcome;
  reason: string;
}

export interface DiscoveryRefreshResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  api: DiscoveryRunResult;
  browser: BrowserRefreshResult[];
  lifecycle: {
    sources: AvailabilityReconciliationResult;
    untracked: AvailabilityReconciliationResult;
  };
  judge: ScoreAllJobsResult;
  totals: {
    sources: number;
    created: number;
    updated: number;
    usEntry: number;
    caEntry: number;
    outcomes: DiscoverySourceOutcomeCounts;
    suspect: number;
    closed: number;
  };
}

export type DiscoveryRefreshPhase =
  | "idle"
  | "starting"
  | "api"
  | "browser"
  | "reconciling"
  | "scoring"
  | "complete"
  | "failed";

export interface DiscoveryRefreshProgress {
  running: boolean;
  phase: DiscoveryRefreshPhase;
  completedSteps: number;
  totalSteps: number;
  completedSources: number;
  totalSources: number;
  currentSource: string | null;
  message: string;
  outcomes: DiscoverySourceOutcomeCounts;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DiscoveryRefreshAvailability {
  canRun: boolean;
  cooldownMs: number;
  cooldownRemainingMs: number;
  lastStartedAt: string | null;
  nextAllowedAt: string | null;
}

export type DiscoveryRefreshStatus =
  DiscoveryRefreshProgress & DiscoveryRefreshAvailability;

export const DISCOVERY_REFRESH_COOLDOWN_MS = 2 * 60 * 60 * 1_000;

export class DiscoveryRefreshInProgressError extends Error {
  constructor() {
    super("A discovery scrape is already running.");
    this.name = "DiscoveryRefreshInProgressError";
  }
}

export class DiscoveryRefreshCooldownError extends Error {
  readonly nextAllowedAt: string;
  readonly retryAfterMs: number;

  constructor(availability: DiscoveryRefreshAvailability) {
    super("Scrapes can run once every 2 hours.");
    this.name = "DiscoveryRefreshCooldownError";
    this.nextAllowedAt = availability.nextAllowedAt ?? "";
    this.retryAfterMs = availability.cooldownRemainingMs;
  }
}

let activeRefresh: Promise<DiscoveryRefreshResult> | null = null;
let refreshStartPending = false;
let refreshProgress: DiscoveryRefreshProgress = {
  running: false,
  phase: "idle",
  completedSteps: 0,
  totalSteps: 0,
  completedSources: 0,
  totalSources: 0,
  currentSource: null,
  message: "No scrape is running.",
  outcomes: countDiscoverySourceOutcomes([]),
  startedAt: null,
  finishedAt: null,
};

export function calculateDiscoveryRefreshAvailability(
  lastStartedAt: Date | null,
  now = Date.now(),
): DiscoveryRefreshAvailability {
  const lastStartedMs = lastStartedAt?.getTime();
  if (lastStartedMs === undefined || !Number.isFinite(lastStartedMs)) {
    return {
      canRun: true,
      cooldownMs: DISCOVERY_REFRESH_COOLDOWN_MS,
      cooldownRemainingMs: 0,
      lastStartedAt: null,
      nextAllowedAt: null,
    };
  }

  const nextAllowedMs = lastStartedMs + DISCOVERY_REFRESH_COOLDOWN_MS;
  const cooldownRemainingMs = Math.max(0, nextAllowedMs - now);
  return {
    canRun: cooldownRemainingMs === 0,
    cooldownMs: DISCOVERY_REFRESH_COOLDOWN_MS,
    cooldownRemainingMs,
    lastStartedAt: new Date(lastStartedMs).toISOString(),
    nextAllowedAt: new Date(nextAllowedMs).toISOString(),
  };
}

export async function getDiscoveryRefreshAvailability(
  now = Date.now(),
): Promise<DiscoveryRefreshAvailability> {
  const state = await prisma.discoveryRunState.findUnique({
    where: { id: "default" },
    select: { lastStartedAt: true },
  });
  return calculateDiscoveryRefreshAvailability(state?.lastStartedAt ?? null, now);
}

export async function reserveDiscoveryRefreshStart(
  startedAt = new Date(),
): Promise<DiscoveryRefreshAvailability> {
  const availability = await getDiscoveryRefreshAvailability(startedAt.getTime());
  if (!availability.canRun) {
    throw new DiscoveryRefreshCooldownError(availability);
  }
  await prisma.discoveryRunState.upsert({
    where: { id: "default" },
    create: { id: "default", lastStartedAt: startedAt },
    update: { lastStartedAt: startedAt },
  });
  return calculateDiscoveryRefreshAvailability(startedAt, startedAt.getTime());
}

export async function getDiscoveryRefreshProgress(): Promise<DiscoveryRefreshStatus> {
  return {
    ...refreshProgress,
    ...(await getDiscoveryRefreshAvailability()),
  };
}

function updateProgress(patch: Partial<DiscoveryRefreshProgress>) {
  refreshProgress = { ...refreshProgress, ...patch };
}

function zeroCounts(): IngestCounts {
  return {
    usTotal: 0,
    caTotal: 0,
    usEntry: 0,
    caEntry: 0,
    created: 0,
    updated: 0,
  };
}

function browserResult(
  result: BrowserScrapeResult,
  counts: IngestCounts,
  descriptor: DiscoverySourceDescriptor,
  sourceRun?: CompletedDiscoverySourceRun,
): BrowserRefreshResult {
  const classified = result.error
    ? classifyDiscoverySourceOutcome({
        authoritative: descriptor.authoritative,
        expectedComplete: descriptor.expectedComplete,
        error: result.error,
      })
    : sourceRun;
  if (!classified) {
    throw new Error(`Missing durable source run for ${result.company}`);
  }
  return {
    company: result.company,
    system: result.system,
    usFound: result.usFound,
    caFound: result.caFound,
    usEntry: counts.usEntry,
    caEntry: counts.caEntry,
    created: counts.created,
    updated: counts.updated,
    sourceComplete: sourceRun?.complete ?? false,
    observedCount: sourceRun?.observedCount ?? 0,
    outcome: classified.outcome,
    reason: classified.reason,
  };
}

async function executeRefresh(started: number): Promise<DiscoveryRefreshResult> {
  const config = await getDiscoveryConfig();
  const disabled = new Set(config.disabledSources.map((source) => source.toLowerCase()));
  const apiSourceCount = DISCOVERY_SOURCES.filter(
    (source) => !disabled.has(source.name.toLowerCase()),
  ).length;
  const supportedBrowserCompanies = BROWSER_COMPANIES.filter(
    (company) =>
      SCRAPABLE_BROWSER_SYSTEMS.includes(company.system) &&
      !disabled.has(company.name.toLowerCase()),
  );
  const totalSources = apiSourceCount + supportedBrowserCompanies.length;
  const totalSteps = totalSources + 2;
  let completedSources = 0;
  const sourceOutcomes = countDiscoverySourceOutcomes([]);

  updateProgress({
    phase: "api",
    totalSources,
    totalSteps,
    message: `Refreshing ${apiSourceCount} API sources…`,
  });
  const api = await runDiscovery({
    config,
    reconcile: false,
    onProgress: (result) => {
      completedSources++;
      sourceOutcomes[result.outcome]++;
      updateProgress({
        completedSources,
        completedSteps: completedSources,
        currentSource: result.company,
        outcomes: { ...sourceOutcomes },
        message: `API sources ${completedSources}/${apiSourceCount} · ${result.company}`,
      });
    },
  });

  if (supportedBrowserCompanies.length) {
    updateProgress({
      phase: "browser",
      currentSource: null,
      message: `Running ${supportedBrowserCompanies.length} browser sources…`,
    });
  }
  const scraped = supportedBrowserCompanies.length
    ? await scrapeBrowserCompanies({
        companies: supportedBrowserCompanies.map((company) => company.name),
        onResult: (result) => {
          completedSources++;
          const company = supportedBrowserCompanies.find(
            (candidate) => candidate.name === result.company,
          );
          if (!company) {
            throw new Error(`Unknown browser source result: ${result.company}`);
          }
          const descriptor = describeBrowserSource(company);
          const classified = classifyDiscoverySourceOutcome({
            authoritative: descriptor.authoritative,
            expectedComplete: descriptor.expectedComplete,
            ...(result.error ? { error: result.error } : {}),
            ...(result.warning ? { warning: result.warning } : {}),
          });
          sourceOutcomes[classified.outcome]++;
          updateProgress({
            completedSources,
            completedSteps: completedSources,
            currentSource: result.company,
            outcomes: { ...sourceOutcomes },
            message:
              `Browser sources ${completedSources - apiSourceCount}/` +
              `${supportedBrowserCompanies.length} · ${result.company}`,
          });
        },
      })
    : [];
  const browser: BrowserRefreshResult[] = [];
  for (const result of scraped) {
    const counts = zeroCounts();
    const company = supportedBrowserCompanies.find(
      (candidate) => candidate.name === result.company,
    );
    if (!company) {
      throw new Error(`Unknown browser source result: ${result.company}`);
    }
    const descriptor = describeBrowserSource(company);
    let completedSourceRun: CompletedDiscoverySourceRun | undefined;
    if (result.error) {
      await recordDiscoverySourceFailure(descriptor, result.error);
    } else {
      const ingested = await ingestSourcePostings(
        descriptor,
        result.postings,
        true,
        counts,
        {
          countries: config.countries,
          entryOptions: toEntryLevelOptions(config),
          sourceWarning: result.warning,
        },
      );
      completedSourceRun = ingested.sourceRun;
    }
    browser.push(browserResult(result, counts, descriptor, completedSourceRun));
  }

  updateProgress({
    phase: "reconciling",
    completedSteps: completedSources,
    currentSource: null,
    message: "Rechecking missing and legacy postings…",
  });
  const sourceLifecycle = await reconcileDiscoverySourceRuns(
    api.companies.flatMap((result) =>
      result.sourceRunId ? [result.sourceRunId] : [],
    ),
    { cycleStartedAt: new Date(started) },
  );
  api.lifecycle = sourceLifecycle;
  const untrackedLifecycle = await verifyUntrackedDiscoveryJobs(
    new Date(started),
  );

  updateProgress({
    phase: "scoring",
    completedSteps: completedSources + 1,
    currentSource: null,
    message: "Scoring newly discovered jobs…",
  });
  const judge = await runJudgeScoring(
    { onlyUnscored: true },
    { waitForActive: true },
  );
  const finished = Date.now();
  const browserCreated = browser.reduce((sum, result) => sum + result.created, 0);
  const browserUpdated = browser.reduce((sum, result) => sum + result.updated, 0);
  const browserUsEntry = browser.reduce((sum, result) => sum + result.usEntry, 0);
  const browserCaEntry = browser.reduce((sum, result) => sum + result.caEntry, 0);
  const browserOutcomes = countDiscoverySourceOutcomes(
    browser.map((result) => result.outcome),
  );

  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    api,
    browser,
    lifecycle: {
      sources: api.lifecycle,
      untracked: untrackedLifecycle,
    },
    judge,
    totals: {
      sources: api.companies.length + browser.length,
      created: api.created + browserCreated,
      updated: api.updated + browserUpdated,
      usEntry: api.usEntry + browserUsEntry,
      caEntry: api.caEntry + browserCaEntry,
      outcomes: {
        complete: api.outcomes.complete + browserOutcomes.complete,
        degraded: api.outcomes.degraded + browserOutcomes.degraded,
        limited: api.outcomes.limited + browserOutcomes.limited,
        failed: api.outcomes.failed + browserOutcomes.failed,
      },
      suspect: api.lifecycle.suspect + untrackedLifecycle.suspect,
      closed: api.lifecycle.closed + untrackedLifecycle.closed,
    },
  };
}

export async function runDiscoveryRefresh(): Promise<DiscoveryRefreshResult> {
  if (activeRefresh || refreshStartPending) {
    throw new DiscoveryRefreshInProgressError();
  }
  refreshStartPending = true;
  const started = Date.now();
  let refresh: Promise<DiscoveryRefreshResult>;
  try {
    await reserveDiscoveryRefreshStart(new Date(started));
    refreshProgress = {
      running: true,
      phase: "starting",
      completedSteps: 0,
      totalSteps: 0,
      completedSources: 0,
      totalSources: 0,
      currentSource: null,
      message: "Preparing discovery sources…",
      outcomes: countDiscoverySourceOutcomes([]),
      startedAt: new Date(started).toISOString(),
      finishedAt: null,
    };
    refresh = executeRefresh(started);
    activeRefresh = refresh;
  } finally {
    refreshStartPending = false;
  }

  try {
    const result = await refresh;
    updateProgress({
      running: false,
      phase: "complete",
      completedSteps: refreshProgress.totalSteps,
      completedSources: refreshProgress.totalSources,
      currentSource: null,
      message: "Scrape complete.",
      outcomes: result.totals.outcomes,
      finishedAt: result.finishedAt,
    });
    return result;
  } catch (error) {
    updateProgress({
      running: false,
      phase: "failed",
      currentSource: null,
      message: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    if (activeRefresh === refresh) activeRefresh = null;
  }
}
