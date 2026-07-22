// Per-system fetchers for the discovery pipeline. Each returns a normalized
// DiscoveryPosting[] with a real apply URL, a stable external id, and a posted
// date where the source exposes one. The country is classified up front from
// the location string so both the verifier and the runtime runner can filter to
// the US / Canada lists consistently.
//
// Only the "api" companies live here; the client-rendered / bot-gated companies
// are handled by lib/discovery/browser.ts (Playwright).

import { classifyCountry, type Country } from "./entryLevel";
import type { ApiCompany, DiscoverySystem } from "./companies";

export interface DiscoveryPosting {
  company: string;
  title: string;
  location: string;
  country: Country;
  applyUrl: string;
  externalId: string;
  description: string;
  postedAt: Date | null;
  system: DiscoverySystem;
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

function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
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
    }),
  );
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

// --------------------------------- Phenom (GitHub) ---------------------------------

async function phenom(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const q = c.queryTerms[0];
  const data = (await fetchJson(
    `https://${c.token}/api/jobs?keywords=${encodeURIComponent(q)}&limit=100`,
    { redirect: "follow" },
  )) as {
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
  return (data.jobs ?? []).map((j) => {
    const d = j.data ?? {};
    return mk("phenom", c.name, {
      title: d.title ?? "",
      location: d.full_location ?? d.country ?? "",
      applyUrl: d.apply_url ?? "",
      externalId: String(d.req_id ?? ""),
      description: stripHtml(d.description),
      postedAt: toDate(d.posted_date),
    });
  });
}

// ----------------------------------- Workday -----------------------------------

async function workday(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const w = c.workday!;
  const q = c.queryTerms[0];
  const out: DiscoveryPosting[] = [];
  for (let offset = 0; offset < 100; offset += 20) {
    const data = (await fetchJson(`https://${w.host}/wday/cxs/${w.tenant}/${w.site}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
    })) as {
      jobPostings?: {
        title?: string;
        externalPath?: string;
        locationsText?: string;
        postedOn?: string;
        bulletFields?: string[];
      }[];
    };
    const jobs = data.jobPostings ?? [];
    for (const j of jobs) {
      out.push(
        mk("workday", c.name, {
          title: j.title ?? "",
          location: j.locationsText ?? "",
          applyUrl: j.externalPath ? `https://${w.host}/en-US/${w.site}${j.externalPath}` : "",
          externalId: j.bulletFields?.[0] ?? j.externalPath ?? "",
          description: "",
          postedAt: parseWorkdayPostedOn(j.postedOn),
        }),
      );
    }
    if (jobs.length < 20) break;
  }
  return out;
}

const FETCHERS: Record<DiscoverySystem, (c: ApiCompany) => Promise<DiscoveryPosting[]>> = {
  greenhouse,
  ashby,
  lever: async () => [], // no API company currently uses Lever (Mistral moved to browser)
  amazon,
  uber,
  netflix,
  snap,
  phenom,
  workday,
};

// Fetch every posting for one API company across US + Canada (unfiltered).
export async function fetchCompanyPostings(c: ApiCompany): Promise<DiscoveryPosting[]> {
  const fetcher = FETCHERS[c.system];
  if (!fetcher) throw new Error(`no discovery fetcher for system ${c.system}`);
  return fetcher(c);
}
