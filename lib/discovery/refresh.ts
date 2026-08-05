import { scoreAllJobs, type ScoreAllJobsResult } from "../judge/judge";
import {
  BROWSER_COMPANIES,
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

export class DiscoveryRefreshInProgressError extends Error {
  constructor() {
    super("A discovery scrape is already running.");
    this.name = "DiscoveryRefreshInProgressError";
  }
}

let activeRefresh: Promise<DiscoveryRefreshResult> | null = null;

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

async function executeRefresh(): Promise<DiscoveryRefreshResult> {
  const started = Date.now();
  const config = await getDiscoveryConfig();
  const api = await runDiscovery({ config });
  const disabled = new Set(config.disabledSources.map((source) => source.toLowerCase()));
  const supportedBrowserCompanies = BROWSER_COMPANIES.filter(
    (company) =>
      SCRAPABLE_BROWSER_SYSTEMS.includes(company.system) &&
      !disabled.has(company.name.toLowerCase()),
  );

  const scraped = supportedBrowserCompanies.length
    ? await scrapeBrowserCompanies({
        companies: supportedBrowserCompanies.map((company) => company.name),
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

  const judge = await scoreAllJobs({ onlyUnscored: true });
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

  const refresh = executeRefresh();
  activeRefresh = refresh;
  try {
    return await refresh;
  } finally {
    if (activeRefresh === refresh) activeRefresh = null;
  }
}
