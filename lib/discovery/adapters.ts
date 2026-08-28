// Per-system fetchers for the discovery pipeline. Each returns a normalized
// DiscoveryPosting[] with a real apply URL, a stable external id, and a posted
// date where the source exposes one. The country is classified up front from
// the location string so both the verifier and the runtime runner can filter to
// the US / Canada lists consistently.
//
// Only the "api" companies live here; the client-rendered / bot-gated companies
// are handled by lib/discovery/browser.ts (Playwright).

import { classifyCountry, isSoftwareRole, type Country } from "./entryLevel";
import type { ApiCompany, DiscoverySystem, BrowserSystem } from "./companies";
import { prisma } from "../db";
import { DEFAULT_YC_CONFIG, type YcConfig } from "./config";
import {
  YC_DIRECTORY_URL,
  selectYcCompanies,
  resolveYcBoards,
  mapPool,
  type YcDirectoryCompany,
  type ResolvedSystem,
} from "./yc";

export interface DiscoveryPosting {
  company: string;
  title: string;
  location: string;
  country: Country;
  applyUrl: string;
  externalId: string;
  description: string;
  postedAt: Date | null;
  system: DiscoverySystem | BrowserSystem;
  // Optional first-class enrichment hints a source may expose. Enrichment falls
  // back to parsing the description when these are absent.
  sponsorship?: string | null;
  compensation?: string | null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

class FetchHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfter: string | null) {
    super(`HTTP ${status}`);
    this.name = "FetchHttpError";
    this.status = status;
    const normalizedRetryAfter = retryAfter?.trim();
    const seconds = normalizedRetryAfter
      ? Number(normalizedRetryAfter)
      : Number.NaN;
    const dateMs = normalizedRetryAfter
      ? Date.parse(normalizedRetryAfter)
      : Number.NaN;
    this.retryAfterMs = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1_000)
      : Number.isFinite(dateMs)
        ? Math.max(0, dateMs - Date.now())
        : null;
  }
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new FetchHttpError(
        res.status,
        res.headers.get("retry-after"),
      );
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function requireValidPostingRows<T>(
  source: string,
  rows: T[],
  valid: (row: T) => boolean,
): T[] {
  const invalid = rows.reduce(
    (count, row) => count + (valid(row) ? 0 : 1),
    0,
  );
  if (invalid > 0) {
    throw new Error(
      `${source} response contained ${invalid} structurally invalid job row${invalid === 1 ? "" : "s"}`,
    );
  }
  return rows;
}

// Best-effort HTML fetch used by the YC ATS resolver. Missing pages yield an
// empty result; transient blocks throw so the resolver retries them next run.
async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if ([404, 410].includes(res.status)) return "";
      throw new FetchHttpError(
        res.status,
        res.headers.get("retry-after"),
      );
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

// Decode the handful of HTML entities that show up in scraped title/location
// strings (TalentBrew returns server-rendered HTML fragments).
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (entity, value) => {
      const codePoint = Number.parseInt(value, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    })
    .replace(/&#(\d+);/g, (entity, value) => {
      const codePoint = Number.parseInt(value, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    })
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2f;/gi, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toDate(v: string | number | null | undefined): Date | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v; // epoch seconds vs ms
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Workday exposes only relative posted labels ("Posted Today", "Posted 3 Days
// Ago", "Posted 30+ Days Ago").
function parseWorkdayPostedOn(label: string | undefined | null): Date | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.includes("today")) return new Date();
  if (l.includes("yesterday")) return new Date(Date.now() - 864e5);
  const m = l.match(/(\d+)\+?\s*days?/);
  if (m) return new Date(Date.now() - Number(m[1]) * 864e5);
  return null;
}

const mk = (
  system: DiscoverySystem,
  company: string,
  p: Omit<DiscoveryPosting, "company" | "system" | "country">,
): DiscoveryPosting => ({
  ...p,
  company,
  system,
  country: classifyCountry(p.location),
});

// --------------------------------- Greenhouse ---------------------------------

async function greenhouse(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs?content=true`,
  )) as {
    jobs?: {
      id?: number;
      title?: string;
      absolute_url?: string;
      updated_at?: string;
      content?: string;
      location?: { name?: string };
      offices?: { location?: string; name?: string }[];
    }[];
  };
  if (!Array.isArray(data.jobs)) {
    throw new Error("Greenhouse response did not contain a jobs array");
  }
  const jobs = requireValidPostingRows(
    "Greenhouse",
    data.jobs,
    (job) =>
      Number.isFinite(job?.id) &&
      isNonEmptyString(job?.title) &&
      isHttpUrl(job?.absolute_url),
  );
  return jobs.map((j) => {
    const offices = (j.offices ?? []).map((o) => o.location || o.name).filter(Boolean).join(" | ");
    const location = [j.location?.name, offices].filter(Boolean).join(" | ");
    return mk("greenhouse", c.name, {
      title: j.title ?? "",
      location,
      applyUrl: j.absolute_url ?? "",
      externalId: String(j.id ?? ""),
      description: stripHtml(j.content),
      postedAt: toDate(j.updated_at),
    });
  });
}

// ----------------------------------- Ashby -----------------------------------

async function ashby(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${c.token}`,
  )) as {
    jobs?: {
      id?: string;
      title?: string;
      location?: string;
      jobUrl?: string;
      applyUrl?: string;
      descriptionPlain?: string;
      publishedAt?: string;
      compensation?: { compensationTierSummary?: string };
      compensationTierSummary?: string;
    }[];
  };
  if (!Array.isArray(data.jobs)) {
    throw new Error("Ashby response did not contain a jobs array");
  }
  const jobs = requireValidPostingRows(
    "Ashby",
    data.jobs,
    (job) =>
      isNonEmptyString(job?.id) &&
      isNonEmptyString(job?.title) &&
      (isHttpUrl(job?.applyUrl) || isHttpUrl(job?.jobUrl)),
  );
  return jobs.map((j) =>
    mk("ashby", c.name, {
      title: j.title ?? "",
      location: j.location ?? "",
      applyUrl: j.applyUrl || j.jobUrl || "",
      externalId: String(j.id ?? ""),
      description: j.descriptionPlain ?? "",
      postedAt: toDate(j.publishedAt),
      compensation: j.compensationTierSummary ?? j.compensation?.compensationTierSummary ?? null,
    }),
  );
}

// ----------------------------------- Lever -----------------------------------

async function lever(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${c.token}?mode=json`,
  )) as {
    id?: string;
    text?: string;
    hostedUrl?: string;
    applyUrl?: string;
    createdAt?: number;
    categories?: { location?: string; allLocations?: string[] };
    descriptionPlain?: string;
    description?: string;
  }[];
  if (!Array.isArray(data)) {
    throw new Error("Lever response was not an array");
  }
  const jobs = requireValidPostingRows(
    "Lever",
    data,
    (job) =>
      isNonEmptyString(job?.id) &&
      isNonEmptyString(job?.text) &&
      (isHttpUrl(job?.hostedUrl) || isHttpUrl(job?.applyUrl)),
  );
  return jobs.map((j) => {
    const loc =
      j.categories?.location ||
      (j.categories?.allLocations ?? []).filter(Boolean).join(" | ");
    return mk("lever", c.name, {
      title: j.text ?? "",
      location: loc ?? "",
      applyUrl: j.hostedUrl || j.applyUrl || "",
      externalId: String(j.id ?? ""),
      description: j.descriptionPlain ?? stripHtml(j.description),
      postedAt: toDate(j.createdAt),
    });
  });
}

// --------------------------------- Workable ---------------------------------

async function workable(c: ApiCompany): Promise<DiscoveryPosting[]> {
  if (!isNonEmptyString(c.token)) {
    throw new Error("Workable source requires an account token");
  }
  const data = (await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(c.token)}`,
  )) as {
    jobs?: {
      title?: string;
      shortcode?: string;
      url?: string;
      application_url?: string;
      published_on?: string;
      country?: string;
      city?: string;
      state?: string;
      education?: string;
      experience?: string;
      locations?: {
        country?: string;
        countryCode?: string;
        city?: string;
        region?: string;
        hidden?: boolean;
      }[];
    }[];
  };
  if (!Array.isArray(data.jobs)) {
    throw new Error("Workable response did not contain a jobs array");
  }
  const jobs = requireValidPostingRows(
    "Workable",
    data.jobs,
    (job) =>
      isNonEmptyString(job?.title) &&
      isNonEmptyString(job?.shortcode) &&
      (isHttpUrl(job?.url) || isHttpUrl(job?.application_url)),
  );
  return jobs.map((job) => {
    const locations = (job.locations ?? [])
      .filter((location) => !location.hidden)
      .map((location) =>
        [location.city, location.region, location.country ?? location.countryCode]
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean);
    const location =
      locations.join(" | ") ||
      [job.city, job.state, job.country].filter(Boolean).join(", ");
    const metadata = [
      job.experience ? `Experience level: ${job.experience}.` : "",
      job.education ? `Education: ${job.education}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return mk("workable", c.name, {
      title: job.title ?? "",
      location,
      applyUrl: job.url || job.application_url || "",
      externalId: job.shortcode ?? "",
      description: metadata,
      postedAt: toDate(job.published_on),
    });
  });
}

// -------------------------------- Teamtailor --------------------------------

interface TeamtailorAddress {
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressCountry?: string | { name?: string | null } | null;
}

interface TeamtailorPlace {
  address?: TeamtailorAddress | null;
}

function schemaText(value: string | { name?: string | null } | null | undefined) {
  if (typeof value === "string") return value;
  return value?.name ?? "";
}

function teamtailorLocationFromHtml(html: string): string {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    let raw: unknown;
    try {
      raw = JSON.parse(script[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(raw) ? raw : [raw];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const posting = node as {
        "@type"?: string | string[];
        jobLocation?: TeamtailorPlace | TeamtailorPlace[];
      };
      const types = Array.isArray(posting["@type"])
        ? posting["@type"]
        : [posting["@type"]];
      if (!types.includes("JobPosting")) continue;
      const places = Array.isArray(posting.jobLocation)
        ? posting.jobLocation
        : posting.jobLocation
          ? [posting.jobLocation]
          : [];
      return places
        .map((place) => {
          const address = place.address;
          const country = schemaText(address?.addressCountry)
            .replace(/^CA$/i, "Canada")
            .replace(/^US$/i, "United States");
          return [...new Set(
            [address?.addressLocality, address?.addressRegion, country]
              .filter((part): part is string => Boolean(part?.trim()))
              .map((part) => part.trim()),
          )].join(", ");
        })
        .filter(Boolean)
        .join(" | ");
    }
  }
  throw new Error("Teamtailor detail did not contain JobPosting structured data");
}

async function teamtailor(c: ApiCompany): Promise<DiscoveryPosting[]> {
  if (!isNonEmptyString(c.token)) {
    throw new Error("Teamtailor source requires an account token");
  }
  const data = (await fetchJson(
    `https://${c.token}.teamtailor.com/jobs.json`,
  )) as {
    items?: {
      id?: string;
      title?: string;
      url?: string;
      date_published?: string;
      content_html?: string;
    }[];
  };
  if (!Array.isArray(data.items)) {
    throw new Error("Teamtailor response did not contain an items array");
  }
  const jobs = requireValidPostingRows(
    "Teamtailor",
    data.items,
    (job) =>
      isNonEmptyString(job?.id) &&
      isNonEmptyString(job?.title) &&
      isHttpUrl(job?.url),
  );
  return mapPool(jobs, 6, async (job) => {
    const detailHtml = await fetchText(job.url ?? "");
    return mk("teamtailor", c.name, {
      title: job.title ?? "",
      location: teamtailorLocationFromHtml(detailHtml),
      applyUrl: job.url ?? "",
      externalId: job.id ?? "",
      description: stripHtml(job.content_html),
      postedAt: toDate(job.date_published),
    });
  });
}

// ----------------------------------- Amazon -----------------------------------

async function amazon(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const out: DiscoveryPosting[] = [];
  const q = c.queryTerms[0];
  for (const country of ["USA", "CAN"] as const) {
    for (let offset = 0; offset < 300; offset += 100) {
      const url =
        `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}` +
        `&normalized_country_code[]=${country}&result_limit=100&offset=${offset}`;
      const data = (await fetchJson(url)) as {
        jobs?: {
          id_icims?: string;
          title?: string;
          normalized_location?: string;
          job_path?: string;
          posted_date?: string;
          basic_qualifications?: string;
        }[];
      };
      const jobs = data.jobs ?? [];
      for (const j of jobs) {
        out.push(
          mk("amazon", c.name, {
            title: j.title ?? "",
            location: j.normalized_location ?? country,
            applyUrl: j.job_path ? `https://www.amazon.jobs${j.job_path}` : "",
            externalId: String(j.id_icims ?? ""),
            description: stripHtml(j.basic_qualifications),
            postedAt: toDate(j.posted_date),
          }),
        );
      }
      if (jobs.length < 100) break;
    }
  }
  return out;
}

// ------------------------------------ Uber ------------------------------------

interface UberJob {
  Id?: string;
  Title?: string;
  Description?: string;
  DisplayDate?: string;
  Locations?: {
    City?: string;
    Region?: string;
    Country?: string;
  }[];
  Urls?: {
    Url?: string;
    IsDefault?: boolean;
  }[];
}

async function uber(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const base = "https://jobs.uber.com";
  const out: DiscoveryPosting[] = [];
  const q = c.queryTerms[0];
  const url = `${base}/api/jobs/search?query=${encodeURIComponent(q)}`;
  let raw: unknown;
  try {
    raw = await fetchJson(url);
  } catch (error) {
    if (
      !(error instanceof FetchHttpError) ||
      (error.status !== 429 && error.status < 500)
    ) {
      throw error;
    }
    await wait(
      Math.min(10_000, Math.max(1_000, error.retryAfterMs ?? 3_000)),
    );
    raw = await fetchJson(url);
  }

  const jobs =
    raw && typeof raw === "object" && "jobs" in raw
      ? (raw as { jobs?: unknown }).jobs
      : undefined;
  if (!Array.isArray(jobs)) {
    throw new Error("Uber response did not contain a jobs array");
  }
  const validJobs = requireValidPostingRows(
    "Uber",
    jobs as UberJob[],
    (job) => isNonEmptyString(job.Id) && isNonEmptyString(job.Title),
  );
  for (const job of validJobs) {
    const location = job.Locations?.[0];
    const locationText = [
      location?.City,
      location?.Region,
      location?.Country,
    ]
      .filter(Boolean)
      .join(", ");
    const path = job.Urls?.find((candidate) => candidate.IsDefault)?.Url;
    const applyUrl = path && /^https?:\/\//i.test(path)
      ? path
      : path?.startsWith("/")
        ? `${base}${path}`
        : job.Id
          ? `${base}/en/jobs/${job.Id}/`
          : "";
    out.push(
      mk("uber", c.name, {
        title: job.Title ?? "",
        location: locationText,
        applyUrl,
        externalId: String(job.Id ?? ""),
        description: stripHtml(job.Description),
        postedAt: toDate(job.DisplayDate),
      }),
    );
  }
  return out;
}

// ---------------------------------- Netflix ----------------------------------

async function netflix(
  c: ApiCompany,
  ctx: FetchContext = {},
): Promise<DiscoveryPosting[]> {
  type NetflixJob = {
    id?: number;
    display_job_id?: string;
    name?: string;
    location?: string;
    locations?: string[];
    job_description?: string;
    canonicalPositionUrl?: string;
    t_create?: number;
  };
  type NetflixJobWithCountry = NetflixJob & { nativeCountry: "US" | "CA" };

  const rows: NetflixJobWithCountry[] = [];
  const seen = new Set<string>();
  const q = c.queryTerms[0];
  for (const [locationFilter, nativeCountry] of [
    ["United States", "US"],
    ["Canada", "CA"],
  ] as const) {
    let start = 0;
    let total: number | null = null;
    while (total === null || start < total) {
      const url =
        `https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com` +
        `&query=${encodeURIComponent(q)}&location=${encodeURIComponent(locationFilter)}` +
        `&start=${start}&num=10`;
      const data = (await fetchJson(url)) as {
        count?: number;
        positions?: NetflixJob[];
      };
      if (!Array.isArray(data.positions)) {
        throw new Error("Netflix response did not contain a positions array");
      }
      const positions = requireValidPostingRows(
        "Netflix",
        data.positions,
        (job) => Number.isFinite(job?.id) && isNonEmptyString(job?.name),
      );
      const reportedCount = Number(data.count);
      total =
        Number.isFinite(reportedCount) && reportedCount >= 0
          ? reportedCount
          : null;
      for (const job of positions) {
        const key = job.display_job_id ?? String(job.id);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ ...job, nativeCountry });
      }
      if (positions.length === 0) break;
      start += positions.length;
      if (total === null && positions.length < 10) break;
    }
  }

  let detailFailures = 0;
  const hydrated = await mapPool(rows, 5, async (job) => {
    if (isNonEmptyString(job.job_description)) return job;
    try {
      const detail = (await fetchJson(
        `https://explore.jobs.netflix.net/api/apply/v2/jobs/${job.id}?domain=netflix.com`,
      )) as NetflixJob;
      if (!isNonEmptyString(detail.job_description)) {
        detailFailures++;
        return job;
      }
      return { ...job, ...detail, nativeCountry: job.nativeCountry };
    } catch {
      detailFailures++;
      return job;
    }
  });
  if (detailFailures > 0) {
    const warning =
      `Netflix detail unavailable for ${detailFailures} posting` +
      `${detailFailures === 1 ? "" : "s"}; using list data`;
    console.warn(`[discovery] ${warning}`);
    ctx.onWarning?.(warning);
  }

  return hydrated.map((job) => ({
    ...mk("netflix", c.name, {
      title: job.name ?? "",
      location: (job.locations ?? []).join(" | ") || job.location || "",
      applyUrl:
        job.canonicalPositionUrl ??
        `https://explore.jobs.netflix.net/careers/job/${job.id}`,
      externalId: job.display_job_id ?? String(job.id ?? ""),
      description: stripHtml(job.job_description),
      postedAt: toDate(job.t_create),
    }),
    country: job.nativeCountry,
  }));
}

// ------------------------------------ Snap ------------------------------------

async function snap(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const q = c.queryTerms[0];
  const data = (await fetchJson(
    `https://careers.snap.com/api/jobs?keywords=${encodeURIComponent(q)}&limit=400`,
  )) as {
    body?: {
      _source?: {
        id?: string;
        title?: string;
        absolute_url?: string;
        offices?: { location?: string }[];
      };
    }[];
  };
  return (data.body ?? []).map((b) => {
    const s = b._source ?? {};
    const location = (s.offices ?? []).map((o) => o.location).filter(Boolean).join(" | ");
    return mk("snap", c.name, {
      title: s.title ?? "",
      location,
      applyUrl: s.absolute_url ?? "",
      externalId: String(s.id ?? ""),
      description: "",
      postedAt: null,
    });
  });
}

// --------------------------- Jibe-style careers API ---------------------------

async function phenom(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const q = c.queryTerms[0];
  const limit = 100;
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 20; page++) {
    const data = (await fetchJson(
      `https://${c.token}/api/jobs?keywords=${encodeURIComponent(q)}&limit=${limit}&page=${page}`,
      { redirect: "follow" },
    )) as {
      totalCount?: number;
      count?: number;
      jobs?: {
        data?: {
          req_id?: string;
          title?: string;
          full_location?: string;
          country?: string;
          description?: string;
          apply_url?: string;
          posted_date?: string;
        };
      }[];
    };
    const jobs = data.jobs ?? [];
    let added = 0;

    for (const j of jobs) {
      const d = j.data ?? {};
      const key = String(d.req_id || d.apply_url || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      added++;
      out.push(
        mk("phenom", c.name, {
          title: d.title ?? "",
          location: d.full_location ?? d.country ?? "",
          applyUrl: d.apply_url ?? "",
          externalId: String(d.req_id ?? ""),
          description: stripHtml(d.description),
          postedAt: toDate(d.posted_date),
        }),
      );
    }

    const total = data.totalCount ?? data.count;
    if (
      jobs.length === 0 ||
      added === 0 ||
      (total != null && seen.size >= total) ||
      (total == null && jobs.length < limit)
    ) {
      break;
    }
  }

  return out;
}

// ----------------------------------- Workday -----------------------------------

async function workday(
  c: ApiCompany,
  ctx: FetchContext = {},
): Promise<DiscoveryPosting[]> {
  const w = c.workday!;
  type WorkdayListRow = {
    title?: string;
    externalPath?: string;
    locationsText?: string;
    postedOn?: string;
    bulletFields?: string[];
  };

  const rows = new Map<string, WorkdayListRow>();
  for (const searchText of w.searchTerms ?? [c.queryTerms[0]]) {
    for (let offset = 0; offset < 100; offset += 20) {
      const data = (await fetchJson(`https://${w.host}/wday/cxs/${w.tenant}/${w.site}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
      })) as { jobPostings?: WorkdayListRow[] };
      const jobs = data.jobPostings ?? [];
      for (const j of jobs) {
        const key = j.bulletFields?.[0] ?? j.externalPath ?? "";
        if (key && !rows.has(key)) rows.set(key, j);
      }
      if (jobs.length < 20) break;
    }
  }

  return mapPool([...rows.values()], 5, async (j) => {
    const title = j.title ?? "";
    const location = j.locationsText ?? "";
    const generatedUrl = j.externalPath
      ? `https://${w.host}/en-US/${w.site}${j.externalPath}`
      : "";
    const listPosting = () =>
      mk("workday", c.name, {
        title,
        location,
        applyUrl: generatedUrl,
        externalId: j.bulletFields?.[0] ?? j.externalPath ?? "",
        description: "",
        postedAt: parseWorkdayPostedOn(j.postedOn),
      });

    if (
      !w.fetchDescriptions ||
      !j.externalPath ||
      !isSoftwareRole(title)
    ) {
      return listPosting();
    }

    let data: {
      jobPostingInfo?: {
        title?: string;
        jobDescription?: string;
        location?: string;
        postedOn?: string;
        jobReqId?: string;
        externalUrl?: string;
        additionalLocations?: string[];
      };
    };
    try {
      data = (await fetchJson(
        `https://${w.host}/wday/cxs/${w.tenant}/${w.site}${j.externalPath}`,
      )) as typeof data;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const warning =
        `${c.name} Workday detail unavailable for ${j.externalPath}; ` +
        `using list data (${reason})`;
      console.warn(`[discovery] ${warning}`);
      ctx.onWarning?.(warning);
      return listPosting();
    }
    if (!data.jobPostingInfo) {
      const warning =
        `${c.name} Workday detail missing for ${j.externalPath}; using list data`;
      console.warn(`[discovery] ${warning}`);
      ctx.onWarning?.(warning);
      return listPosting();
    }
    const detail = data.jobPostingInfo;
    const detailLocation = [detail.location, ...(detail.additionalLocations ?? [])]
      .filter(Boolean)
      .join(" | ");
    return mk("workday", c.name, {
      title: detail.title ?? title,
      location: detailLocation || location,
      applyUrl: detail.externalUrl ?? generatedUrl,
      externalId: detail.jobReqId ?? j.bulletFields?.[0] ?? j.externalPath,
      description: stripHtml(detail.jobDescription),
      postedAt: parseWorkdayPostedOn(detail.postedOn ?? j.postedOn),
    });
  });
}

// ----------------------------------- Spotify ----------------------------------
// lifeatspotify.com exposes a public WordPress-backed search API. No posted
// date or description in the listing; country is classified from the joined
// office locations. Apply URL: lifeatspotify.com/jobs/<id>.

async function spotify(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();
  for (const term of c.queryTerms) {
    const data = (await fetchJson(
      `https://api.lifeatspotify.com/wp-json/animal/v1/job/search?query=${encodeURIComponent(term)}`,
    )) as {
      result?: {
        id?: string;
        text?: string;
        locations?: { location?: string }[];
      }[];
    };
    for (const j of data.result ?? []) {
      const id = j.id ?? "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const location = (j.locations ?? []).map((l) => l.location).filter(Boolean).join(" | ");
      out.push(
        mk("spotify", c.name, {
          title: j.text ?? "",
          location,
          applyUrl: `https://www.lifeatspotify.com/jobs/${id}`,
          externalId: id,
          description: "",
          postedAt: null,
        }),
      );
    }
  }
  return out;
}

// ---------------------------------- Microsoft ----------------------------------
// apply.careers.microsoft.com exposes a public JSON search API (pcsx) that is
// directly fetchable server-side. It filters by country natively via the
// `location` param (verified US/CA-clean), paginates by `start` in steps of 10,
// and returns a real apply URL + posted timestamp.

async function microsoft(
  c: ApiCompany,
  ctx: FetchContext = {},
): Promise<DiscoveryPosting[]> {
  const base = "https://apply.careers.microsoft.com";
  const q = c.queryTerms[0];
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();
  let requests = 0;

  const fetchPage = async (url: string) => {
    if (requests > 0) await wait(200);
    requests++;
    try {
      return await fetchJson(url);
    } catch (error) {
      if (!(error instanceof FetchHttpError) || error.status !== 429) throw error;
      await wait(
        Math.min(5_000, Math.max(500, error.retryAfterMs ?? 1_500)),
      );
      requests++;
      return fetchJson(url);
    }
  };

  for (const location of ["United States", "Canada"] as const) {
    for (let start = 0; start < 400; start += 10) {
      const url =
        `${base}/api/pcsx/search?domain=microsoft.com` +
        `&query=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}` +
        `&start=${start}&sort_by=relevance`;
      let data: {
        data?: {
          count?: number;
          positions?: {
            id?: string | number;
            displayJobId?: string;
            name?: string;
            locations?: string[];
            positionUrl?: string;
            postedTs?: number;
          }[];
        };
      };
      try {
        data = (await fetchPage(url)) as typeof data;
        if (!Array.isArray(data.data?.positions)) {
          throw new Error("Microsoft response did not contain a positions array");
        }
      } catch (error) {
        if (out.length === 0) throw error;
        ctx.onWarning?.(
          `Microsoft pagination stopped after ${out.length} postings: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return out;
      }
      const positions = data.data.positions;
      for (const p of positions) {
        const id = String(p.id ?? p.displayJobId ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(
          mk("microsoft", c.name, {
            title: p.name ?? "",
            location: (p.locations ?? []).join(" | "),
            applyUrl: p.positionUrl ? `${base}${p.positionUrl}` : "",
            externalId: id,
            description: "",
            postedAt: toDate(p.postedTs),
          }),
        );
      }
      const total = Number(data.data?.count ?? 0);
      if (positions.length < 10 || start + 10 >= total) break;
    }
  }
  return out;
}

// ---------------------------------- TalentBrew ----------------------------------
// Radancy TalentBrew (e.g. jobs.intuit.com) renders results into HTML fragments
// returned from a JSON endpoint. We parse each job tile for title, location and
// id, and build the apply URL from its /job/... path. Paginated via CurrentPage;
// the seen-set + per-page "added" guard stops us if pagination ever loops.

async function talentbrew(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const host = c.talentbrew!.host;
  const q = c.queryTerms[0];
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 12; page++) {
    const url =
      `https://${host}/search-jobs/results?ActiveFacetID=0&CurrentPage=${page}` +
      `&RecordsPerPage=100&Distance=50&RadiusUnitType=0` +
      `&Keyword=${encodeURIComponent(q)}&Location=&ShowRadius=False&IsPagination=True` +
      `&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters` +
      `&SortCriteria=0&SortDirection=0&SearchType=1&KeywordType=Any`;
    const data = (await fetchJson(url, { headers: { "X-Requested-With": "XMLHttpRequest" } })) as {
      results?: string;
    };
    const html = data.results ?? "";
    if (!html) break;
    let added = 0;
    for (const chunk of html.split(/<li\b/i).slice(1)) {
      const href = chunk.match(/href="(\/job\/[^"]+)"/i)?.[1];
      const rawTitle = chunk.match(/data-title="([^"]*)"/i)?.[1];
      if (!href || !rawTitle) continue;
      const id =
        chunk.match(/data-job-id="([^"]*)"/i)?.[1] ??
        chunk.match(/data-(?:[a-z]+-)?jobid="([^"]*)"/i)?.[1] ??
        href;
      if (seen.has(id)) continue;
      seen.add(id);
      const rawLoc =
        chunk.match(/class="job-location[^"]*"[^>]*>([^<]+)</i)?.[1] ??
        chunk.match(/data-orig-location="([^"]*)"/i)?.[1] ??
        "";
      out.push(
        mk("talentbrew", c.name, {
          title: decodeEntities(rawTitle),
          location: decodeEntities(rawLoc),
          applyUrl: `https://${host}${href}`,
          externalId: id,
          description: "",
          postedAt: null,
        }),
      );
      added++;
    }
    if (added < 1) break;
  }
  return out;
}

// --------------------------------- GitHub board ---------------------------------
// Community-maintained new-grad aggregators publish either listings.json or a
// Markdown jobs table. Each row is a real posting at a real employer, so the
// posting's company comes from the row rather than the board name.

interface BoardListing {
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[] | string;
  active?: boolean;
  is_visible?: boolean;
  visible?: boolean;
  date_posted?: number | string;
  date_updated?: number | string;
  id?: string;
  sponsorship?: string;
}

function stripMarkdown(value: string): string {
  return decodeEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function markdownLink(value: string): string {
  return (
    value.match(/<a\s+[^>]*href=["']([^"']+)["']/i)?.[1] ??
    value.match(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i)?.[1] ??
    value.match(/https?:\/\/[^\s<>"')]+/i)?.[0] ??
    ""
  );
}

function githubMarkdownBoard(c: ApiCompany, markdown: string): DiscoveryPosting[] {
  const lines = markdown.split(/\r?\n/);
  let columns:
    | { company: number; title: number; location: number; apply: number; status: number }
    | undefined;
  let previousCompany = "";
  const out: DiscoveryPosting[] = [];

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    const normalized = cells.map((cell) => stripMarkdown(cell).toLowerCase());
    const company = normalized.findIndex((cell) => cell.includes("company"));
    const title = normalized.findIndex((cell) => cell.includes("role") || cell.includes("position"));
    const location = normalized.findIndex((cell) => cell.includes("location"));
    const apply = normalized.findIndex((cell) => cell.includes("application") || cell === "apply");
    const status = normalized.findIndex((cell) => cell.includes("status"));
    if ([company, title, location, apply, status].every((index) => index >= 0)) {
      columns = { company, title, location, apply, status };
      continue;
    }
    if (!columns || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;

    const statusText = stripMarkdown(cells[columns.status] ?? "").toLowerCase();
    if (!statusText.includes("open") || statusText.includes("closed")) continue;
    const companyCell = stripMarkdown(cells[columns.company] ?? "");
    if (companyCell && companyCell !== "↳") previousCompany = companyCell;
    const companyName = companyCell === "↳" ? previousCompany : companyCell;
    const role = stripMarkdown(cells[columns.title] ?? "");
    const locationText = stripMarkdown(cells[columns.location] ?? "");
    const applyUrl = decodeEntities(markdownLink(cells[columns.apply] ?? ""));
    if (!companyName || !role || !locationText || !isHttpUrl(applyUrl)) continue;
    out.push(
      mk("githubboard", companyName, {
        title: role,
        location: locationText,
        applyUrl,
        externalId: applyUrl,
        description: "",
        postedAt: null,
      }),
    );
  }
  if (!columns) {
    throw new Error(`${c.name} Markdown board did not contain the expected jobs table`);
  }
  return out;
}

async function githubBoard(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const b = c.board!;
  const url = `https://raw.githubusercontent.com/${b.owner}/${b.repo}/${b.ref}/${b.path}`;
  if (b.format === "markdown") {
    return githubMarkdownBoard(c, await fetchText(url, 30000));
  }
  const data = (await fetchJson(url, { headers: { Accept: "application/json" } }, 30000)) as
    | BoardListing[]
    | { data?: BoardListing[]; listings?: BoardListing[] };
  const rows: BoardListing[] = Array.isArray(data) ? data : (data.listings ?? data.data ?? []);
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.active === false) continue;
    if (r.is_visible === false || r.visible === false) continue;
    const applyUrl = (r.url ?? "").trim();
    const title = (r.title ?? "").trim();
    const company = (r.company_name ?? "").trim();
    if (!applyUrl || !title || !company) continue;
    const id = String(r.id ?? applyUrl);
    if (seen.has(id)) continue;
    seen.add(id);
    const location = Array.isArray(r.locations)
      ? r.locations.filter(Boolean).join(" | ")
      : String(r.locations ?? "");
    out.push(
      mk("githubboard", company, {
        title,
        location,
        applyUrl,
        externalId: id,
        description: "",
        postedAt: toDate(r.date_posted ?? r.date_updated),
        sponsorship: r.sponsorship ?? null,
      }),
    );
  }
  return out;
}

const FETCHERS: Record<
  Exclude<DiscoverySystem, "ycombinator">,
  (c: ApiCompany, ctx?: FetchContext) => Promise<DiscoveryPosting[]>
> = {
  greenhouse,
  ashby,
  lever,
  workable,
  teamtailor,
  amazon,
  uber,
  netflix,
  snap,
  phenom,
  spotify,
  talentbrew,
  microsoft,
  githubboard: githubBoard,
  workday,
};

// Extra context the runner threads through for sources that need config (the YC
// expansion needs its knobs + the enabled country list). Plain fetchers ignore it.
export interface FetchContext {
  yc?: YcConfig;
  countries?: string[];
  onWarning?: (message: string) => void;
}

// --------------------------------- Y Combinator ---------------------------------
// Pull the YC "currently hiring" directory, keep the recent + successful + US/CA
// companies, resolve each one's public ATS (cached), then reuse the per-ATS
// fetchers above to pull the real postings. The company name on each posting is
// the YC company, and the system is its underlying ATS, so downstream dedup /
// enrichment / country filtering all behave exactly as for a named company.

async function ycombinator(c: ApiCompany, ctx: FetchContext): Promise<DiscoveryPosting[]> {
  const yc = ctx.yc ?? DEFAULT_YC_CONFIG;
  const countries = ctx.countries?.length ? ctx.countries : ["US", "CA"];
  const dirUrl = c.yc?.directoryUrl ?? YC_DIRECTORY_URL;

  const directory = (await fetchJson(dirUrl, { headers: { Accept: "application/json" } }, 30000)) as
    | YcDirectoryCompany[]
    | { companies?: YcDirectoryCompany[] };
  const list = Array.isArray(directory) ? directory : (directory.companies ?? []);

  const selected = selectYcCompanies(list, {
    yearsBack: yc.yearsBack,
    minTeamSize: yc.minTeamSize,
    maxTeamSize: yc.maxTeamSize,
    countries,
  }).slice(0, yc.maxCompanies);

  const boards = await resolveYcBoards(selected, {
    prisma,
    fetchText: (url) => fetchText(url, 8000),
    concurrency: yc.concurrency,
    onProbeFailure: (company, error) => {
      console.warn(
        `YC ATS discovery unavailable for ${company.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  });

  const perBoard = await mapPool(boards, yc.concurrency, async (b) => {
    const synthetic: ApiCompany = {
      name: b.name,
      method: "api",
      system: b.system as ResolvedSystem,
      token: b.token,
      countryFilter: "post",
      queryTerms: c.queryTerms,
    };
    try {
      return await FETCHERS[b.system](synthetic, ctx);
    } catch (error) {
      if (
        error instanceof FetchHttpError &&
        [404, 410].includes(error.status)
      ) {
        // ATS links can outlive the board they point to. Remove terminal misses
        // so the next run re-resolves the company instead of retrying stale data.
        await prisma.ycAtsCache.deleteMany({
          where: { slug: b.slug, system: b.system, token: b.token },
        });
        return [];
      }
      ctx.onWarning?.(
        `YC board ${b.name} (${b.system}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  });
  return perBoard.flat();
}

// Fetch every posting for one API company across US + Canada (unfiltered). The
// optional context carries config for sources (e.g. YC) that need it.
export async function fetchCompanyPostings(
  c: ApiCompany,
  ctx: FetchContext = {},
): Promise<DiscoveryPosting[]> {
  if (c.system === "ycombinator") return ycombinator(c, ctx);
  const fetcher = FETCHERS[c.system];
  if (!fetcher) throw new Error(`no discovery fetcher for system ${c.system}`);
  return fetcher(c, ctx);
}
