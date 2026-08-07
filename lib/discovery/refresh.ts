import type { ScoreAllJobsResult } from "../judge/judge";
import { runJudgeScoring } from "../judge/run";
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
  ingestPostings,
  runDiscovery,
  type DiscoveryRunResult,
  type IngestCounts,
} from "./run";

export interface BrowserRefreshResult {
  company: string;
  system: BrowserSystem;
  usFound: number;
  caFound: number;
  usEntry: number;
  caEntry: number;
  created: number;
  updated: number;
  error?: string;
}

export interface DiscoveryRefreshResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  api: DiscoveryRunResult;
  browser: BrowserRefreshResult[];
  judge: ScoreAllJobsResult;
  totals: {
    sources: number;
    created: number;
    updated: number;
    usEntry: number;
    caEntry: number;
    errors: number;
  };
}

export type DiscoveryRefreshPhase =
  | "idle"
  | "starting"
  | "api"
  | "browser"
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
  errors: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export class DiscoveryRefreshInProgressError extends Error {
  constructor() {
    super("A discovery scrape is already running.");
    this.name = "DiscoveryRefreshInProgressError";
  }
}

let activeRefresh: Promise<DiscoveryRefreshResult> | null = null;
let refreshProgress: DiscoveryRefreshProgress = {
  running: false,
  phase: "idle",
  completedSteps: 0,
  totalSteps: 0,
  completedSources: 0,
  totalSources: 0,
  currentSource: null,
  message: "No scrape is running.",
  errors: 0,
  startedAt: null,
  finishedAt: null,
};

export function getDiscoveryRefreshProgress(): DiscoveryRefreshProgress {
  return { ...refreshProgress };
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

function browserResult(result: BrowserScrapeResult, counts: IngestCounts): BrowserRefreshResult {
  return {
    company: result.company,
    system: result.system,
    usFound: result.usFound,
    caFound: result.caFound,
    usEntry: counts.usEntry,
    caEntry: counts.caEntry,
    created: counts.created,
    updated: counts.updated,
    ...(result.error ? { error: result.error } : {}),
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
  const totalSteps = totalSources + 1;
  let completedSources = 0;
  let sourceErrors = 0;

  updateProgress({
    phase: "api",
    totalSources,
    totalSteps,
    message: `Refreshing ${apiSourceCount} API sources…`,
  });
  const api = await runDiscovery({
    config,
    onProgress: (result) => {
      completedSources++;
      if (result.error) sourceErrors++;
      updateProgress({
        completedSources,
        completedSteps: completedSources,
        currentSource: result.company,
        errors: sourceErrors,
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
          if (result.error) sourceErrors++;
          updateProgress({
            completedSources,
            completedSteps: completedSources,
            currentSource: result.company,
            errors: sourceErrors,
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
    if (!result.error) {
      await ingestPostings(result.postings, true, counts, {
        countries: config.countries,
        entryOptions: toEntryLevelOptions(config),
      });
    }
    browser.push(browserResult(result, counts));
  }

  updateProgress({
    phase: "scoring",
    completedSteps: completedSources,
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
  const browserErrors = browser.filter((result) => result.error).length;

  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    api,
    browser,
    judge,
    totals: {
      sources: api.companies.length + browser.length,
      created: api.created + browserCreated,
      updated: api.updated + browserUpdated,
      usEntry: api.usEntry + browserUsEntry,
      caEntry: api.caEntry + browserCaEntry,
      errors: api.errors + browserErrors,
    },
  };
}

export async function runDiscoveryRefresh(): Promise<DiscoveryRefreshResult> {
  if (activeRefresh) throw new DiscoveryRefreshInProgressError();

  const started = Date.now();
  refreshProgress = {
    running: true,
    phase: "starting",
    completedSteps: 0,
    totalSteps: 0,
    completedSources: 0,
    totalSources: 0,
    currentSource: null,
    message: "Preparing discovery sources…",
    errors: 0,
    startedAt: new Date(started).toISOString(),
    finishedAt: null,
  };
  const refresh = executeRefresh(started);
  activeRefresh = refresh;
  try {
    const result = await refresh;
    updateProgress({
      running: false,
      phase: "complete",
      completedSteps: refreshProgress.totalSteps,
      completedSources: refreshProgress.totalSources,
      currentSource: null,
      message: "Scrape complete.",
      errors: result.totals.errors,
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
