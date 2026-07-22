import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  API_COMPANIES,
  BROWSER_COMPANIES,
  type ApiCompany,
} from "../lib/discovery/companies";
import { classifyCountry, classifyEntryLevel, type Country } from "../lib/discovery/entryLevel";

// Live verifier for the discovery query catalog. For every API company it hits
// the real endpoint, classifies each posting by country (US / CA) and whether
// it's an entry-level software role, and prints a confirmation table. Browser
// companies are listed with their pinned search URLs. Not part of the runtime.
//
//   npm run discovery:verify

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

interface Posting {
  title: string;
  location: string;
  description?: string;
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").slice(0, 6000);
}

// --------------------------- per-system fetchers ---------------------------

async function greenhouse(token: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
  )) as {
    jobs?: {
      title: string;
      location?: { name?: string };
      offices?: { location?: string; name?: string }[];
      content?: string;
    }[];
  };
  return (data.jobs ?? []).map((j) => {
    // Cloudflare (and some others) put a work-style word in location.name
    // ("Hybrid" / "Distributed"); the real geography lives in offices[].location.
    const offices = (j.offices ?? []).map((o) => o.location || o.name).filter(Boolean).join(" | ");
    const loc = [j.location?.name, offices].filter(Boolean).join(" | ");
    return { title: j.title, location: loc, description: stripHtml(j.content) };
  });
}

async function ashby(token: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${token}`,
  )) as { jobs?: { title: string; location?: string; descriptionPlain?: string }[] };
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    location: j.location ?? "",
    description: j.descriptionPlain ?? "",
  }));
}

async function lever(token: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${token}?mode=json`,
  )) as { text: string; categories?: { location?: string }; descriptionPlain?: string }[];
  return (Array.isArray(data) ? data : []).map((j) => ({
    title: j.text,
    location: j.categories?.location ?? "",
    description: j.descriptionPlain ?? "",
  }));
}

async function amazon(query: string, country: "USA" | "CAN"): Promise<Posting[]> {
  const url =
    `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(query)}` +
    `&normalized_country_code[]=${country}&result_limit=100`;
  const data = (await fetchJson(url)) as {
    jobs?: { title: string; normalized_location?: string; basic_qualifications?: string }[];
  };
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    location: j.normalized_location ?? country,
    description: stripHtml(j.basic_qualifications),
  }));
}

async function uber(query: string, country: "USA" | "CAN"): Promise<Posting[]> {
  const data = (await fetchJson(
    "https://www.uber.com/api/loadSearchJobsResults?localeCode=en",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "x" },
      body: JSON.stringify({
        params: { query, location: [{ country }] },
        page: 0,
        limit: 100,
      }),
    },
  )) as { data?: { results?: { title: string; location?: { city?: string; region?: string; country?: string }; description?: string }[] } };
  return (data.data?.results ?? []).map((j) => ({
    title: j.title,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", "),
    description: stripHtml(j.description),
  }));
}

async function netflix(query: string, country: "United States" | "Canada"): Promise<Posting[]> {
  const url =
    `https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com` +
    `&query=${encodeURIComponent(query)}&location=${encodeURIComponent(country)}&start=0&num=100`;
  const data = (await fetchJson(url)) as {
    positions?: { name: string; location?: string; job_description?: string }[];
  };
  return (data.positions ?? []).map((j) => ({
    title: j.name,
    location: j.location ?? "",
    description: stripHtml(j.job_description),
  }));
}

async function snap(query: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://careers.snap.com/api/jobs?keywords=${encodeURIComponent(query)}&limit=400`,
  )) as { body?: { _source?: { title?: string; offices?: { location?: string }[]; role?: string } }[] };
  return (data.body ?? []).map((b) => {
    const s = b._source ?? {};
    const loc = (s.offices ?? []).map((o) => o.location).filter(Boolean).join(" | ");
    return { title: s.title ?? "", location: loc, description: s.role ?? "" };
  });
}

async function phenom(host: string, query: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://${host}/api/jobs?keywords=${encodeURIComponent(query)}&limit=100`,
    { redirect: "follow" },
  )) as { jobs?: { data?: { title?: string; full_location?: string; country?: string; description?: string } }[] };
  return (data.jobs ?? []).map((j) => ({
    title: j.data?.title ?? "",
    location: j.data?.full_location ?? j.data?.country ?? "",
    description: stripHtml(j.data?.description),
  }));
}

async function workday(host: string, tenant: string, site: string, query: string): Promise<Posting[]> {
  const data = (await fetchJson(
    `https://${host}/wday/cxs/${tenant}/${site}/jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: query }),
    },
  )) as { jobPostings?: { title?: string; locationsText?: string }[] };
  return (data.jobPostings ?? []).map((j) => ({
    title: j.title ?? "",
    location: j.locationsText ?? "",
  }));
}

// Fetch ALL postings for a company (country split happens after, except native
// systems which are queried per-country).
async function fetchCompany(c: ApiCompany): Promise<{ US: Posting[]; CA: Posting[] }> {
  const q = c.queryTerms[0];
  switch (c.system) {
    case "greenhouse": {
      const all = await greenhouse(c.token!);
      return split(all);
    }
    case "ashby": {
      const all = await ashby(c.token!);
      return split(all);
    }
    case "lever": {
      const all = await lever(c.token!);
      return split(all);
    }
    case "snap": {
      const all = await snap(q);
      return split(all);
    }
    case "phenom": {
      const all = await phenom(c.token!, q);
      return split(all);
    }
    case "workday": {
      const all = await workday(c.workday!.host, c.workday!.tenant, c.workday!.site, q);
      return split(all);
    }
    case "amazon":
      return { US: await amazon(q, "USA"), CA: await amazon(q, "CAN") };
    case "uber":
      return { US: await uber(q, "USA"), CA: await uber(q, "CAN") };
    case "netflix":
      return { US: await netflix(q, "United States"), CA: await netflix(q, "Canada") };
    default:
      return { US: [], CA: [] };
  }
}

function split(all: Posting[]): { US: Posting[]; CA: Posting[] } {
  const US: Posting[] = [];
  const CA: Posting[] = [];
  for (const p of all) {
    const c: Country = classifyCountry(p.location);
    if (c === "US") US.push(p);
    else if (c === "CA") CA.push(p);
  }
  return { US, CA };
}

function entryLevel(list: Posting[]): Posting[] {
  return list.filter((p) => classifyEntryLevel({ title: p.title, description: p.description }).isEntryLevel);
}

async function run() {
  const rows: {
    name: string;
    system: string;
    ok: boolean;
    usTotal: number;
    caTotal: number;
    usEntry: number;
    caEntry: number;
    sampleUS: string;
    sampleCA: string;
    error?: string;
  }[] = [];

  for (const c of API_COMPANIES) {
    try {
      const { US, CA } = await fetchCompany(c);
      const usE = entryLevel(US);
      const caE = entryLevel(CA);
      rows.push({
        name: c.name,
        system: c.system,
        ok: US.length + CA.length > 0,
        usTotal: US.length,
        caTotal: CA.length,
        usEntry: usE.length,
        caEntry: caE.length,
        sampleUS: usE[0]?.title ?? "",
        sampleCA: caE[0]?.title ?? "",
      });
      process.stdout.write(`  ✓ ${c.name}\n`);
    } catch (e) {
      rows.push({
        name: c.name,
        system: c.system,
        ok: false,
        usTotal: 0,
        caTotal: 0,
        usEntry: 0,
        caEntry: 0,
        sampleUS: "",
        sampleCA: "",
        error: e instanceof Error ? e.message : String(e),
      });
      process.stdout.write(`  ✗ ${c.name} (${e instanceof Error ? e.message : e})\n`);
    }
    await sleep(200);
  }

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log("\n=== API companies (live) ===");
  console.log(
    pad("Company", 18) + pad("System", 11) + pad("US(entry/tot)", 15) + pad("CA(entry/tot)", 15) + "sample US entry-level role",
  );
  console.log("-".repeat(100));
  for (const r of rows) {
    const usc = `${r.usEntry}/${r.usTotal}`;
    const cac = `${r.caEntry}/${r.caTotal}`;
    console.log(
      pad(r.name, 18) + pad(r.system, 11) + pad(usc, 15) + pad(cac, 15) + (r.error ? `ERROR: ${r.error}` : pad(r.sampleUS, 40)),
    );
  }

  console.log("\n=== Browser companies (need Playwright at scrape time) ===");
  for (const b of BROWSER_COMPANIES) {
    console.log(`${pad(b.name, 14)} ${b.reason}`);
    console.log(`    US: ${b.searchUrlUS}`);
    console.log(`    CA: ${b.searchUrlCA}`);
  }

  const apiOk = rows.filter((r) => r.ok).length;
  const usEntryTotal = rows.reduce((a, r) => a + r.usEntry, 0);
  const caEntryTotal = rows.reduce((a, r) => a + r.caEntry, 0);
  console.log(
    `\nSummary: ${apiOk}/${API_COMPANIES.length} API endpoints returned data · ` +
      `${usEntryTotal} US + ${caEntryTotal} CA entry-level software roles found · ` +
      `${BROWSER_COMPANIES.length} browser-scrape companies.`,
  );

  mkdirSync(".discovery", { recursive: true });
  writeFileSync(
    ".discovery/verify-report.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), api: rows, browser: BROWSER_COMPANIES }, null, 2),
  );
  console.log("\nWrote .discovery/verify-report.json");
}

run();
