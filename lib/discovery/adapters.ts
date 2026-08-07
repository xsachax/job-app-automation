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

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Best-effort HTML fetch used by the YC ATS resolver. Never throws — a missing
// or blocked page just yields "" so the resolver moves on to the next candidate.
async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
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
  return (data.jobs ?? []).map((j) => {
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
  return (data.jobs ?? []).map((j) =>
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
  return (Array.isArray(data) ? data : []).map((j) => {
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

async function uber(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const out: DiscoveryPosting[] = [];
  const q = c.queryTerms[0];
  for (const country of ["USA", "CAN"] as const) {
    const data = (await fetchJson("https://www.uber.com/api/loadSearchJobsResults?localeCode=en", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
      body: JSON.stringify({ params: { query: q, location: [{ country }] }, page: 0, limit: 100 }),
    })) as {
      data?: {
        results?: {
          id?: number;
          title?: string;
          location?: { city?: string; region?: string; countryName?: string };
          description?: string;
          creationDate?: string;
        }[];
      };
    };
    for (const j of data.data?.results ?? []) {
      const loc = [j.location?.city, j.location?.region, j.location?.countryName].filter(Boolean).join(", ");
      out.push(
        mk("uber", c.name, {
          title: j.title ?? "",
          location: loc,
          applyUrl: j.id ? `https://www.uber.com/careers/list/${j.id}/` : "",
          externalId: String(j.id ?? ""),
          description: stripHtml(j.description),
          postedAt: toDate(j.creationDate),
        }),
      );
    }
  }
  return out;
}

// ---------------------------------- Netflix ----------------------------------

async function netflix(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const out: DiscoveryPosting[] = [];
  const q = c.queryTerms[0];
  for (const country of ["United States", "Canada"] as const) {
    const url =
      `https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com` +
      `&query=${encodeURIComponent(q)}&location=${encodeURIComponent(country)}&start=0&num=100`;
    const data = (await fetchJson(url)) as {
      positions?: {
        id?: number;
        display_job_id?: string;
        name?: string;
        location?: string;
        job_description?: string;
        canonicalPositionUrl?: string;
        t_create?: number;
      }[];
    };
    for (const j of data.positions ?? []) {
      out.push(
        mk("netflix", c.name, {
          title: j.name ?? "",
          location: j.location ?? "",
          applyUrl: j.canonicalPositionUrl ?? "",
          externalId: j.display_job_id ?? String(j.id ?? ""),
          description: stripHtml(j.job_description),
          postedAt: toDate(j.t_create),
        }),
      );
    }
  }
  return out;
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

async function workday(c: ApiCompany): Promise<DiscoveryPosting[]> {
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
      console.warn(
        `[discovery] ${c.name} Workday detail unavailable for ${j.externalPath}; using list data (${reason})`,
      );
      return listPosting();
    }
    if (!data.jobPostingInfo) {
      console.warn(
        `[discovery] ${c.name} Workday detail missing for ${j.externalPath}; using list data`,
      );
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

async function microsoft(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const base = "https://apply.careers.microsoft.com";
  const q = c.queryTerms[0];
  const out: DiscoveryPosting[] = [];
  const seen = new Set<string>();
  for (const location of ["United States", "Canada"] as const) {
    for (let start = 0; start < 400; start += 10) {
      const url =
        `${base}/api/pcsx/search?domain=microsoft.com` +
        `&query=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}` +
        `&start=${start}&sort_by=relevance`;
      const data = (await fetchJson(url)) as {
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
      const positions = data.data?.positions ?? [];
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
// Community-maintained new-grad aggregators publish a raw listings.json. Each
// row is a real posting at a real employer, so we set the posting's company from
// the row (not c.name) and keep only currently-active + visible entries. The
// apply URL is the row's direct link; dates are unix seconds. Country is
// classified from the joined locations, so US/CA separation is automatic.

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

async function githubBoard(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const b = c.board!;
  const url = `https://raw.githubusercontent.com/${b.owner}/${b.repo}/${b.ref}/${b.path}`;
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

const FETCHERS: Record<Exclude<DiscoverySystem, "ycombinator">, (c: ApiCompany) => Promise<DiscoveryPosting[]>> = {
  greenhouse,
  ashby,
  lever,
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
    fetchText,
    concurrency: yc.concurrency,
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
      return await FETCHERS[b.system](synthetic);
    } catch {
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
  return fetcher(c);
}
