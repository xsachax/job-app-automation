// Y Combinator directory-expansion source.
//
// Instead of hard-coding hundreds of company tokens, we treat the YC directory
// as one aggregator source: pull the community-maintained yc-oss feed of
// currently-hiring companies, keep the "successful, recent" ones (batch within
// the configured window + a team-size floor + US/CA presence), then RESOLVE each
// company's public ATS (Greenhouse / Lever / Ashby) from its own website and let
// the existing per-ATS fetchers pull the real postings. Every posting therefore
// still flows through the normal entry-level / country / software filters.
//
// The expensive part is the per-company website crawl, so resolved boards are
// cached in YcAtsCache (positive + negative) and only re-checked once stale.

import type { PrismaClient } from "@prisma/client";

// Only the directory fields we use.
export interface YcDirectoryCompany {
  name: string;
  slug: string;
  website?: string | null;
  batch?: string | null;
  status?: string | null;
  team_size?: number | null;
  isHiring?: boolean | null;
  regions?: string[] | null;
  all_locations?: string | null;
}

export type ResolvedSystem = "greenhouse" | "lever" | "ashby";

export interface ResolvedBoard {
  name: string;
  slug: string;
  system: ResolvedSystem;
  token: string;
}

export interface SelectOptions {
  yearsBack: number;
  minTeamSize: number;
  maxTeamSize: number;
  countries: string[];
  /** Reference date; injectable for deterministic tests. Defaults to now. */
  now?: Date;
}

// yc-oss publishes the "currently hiring" slice as a single static JSON file.
export const YC_DIRECTORY_URL = "https://yc-oss.github.io/api/companies/hiring.json";

// Cache freshness: a resolved board rarely changes ATS, so keep positives long;
// re-check "no board found" companies sooner (they may start using an ATS).
export const YC_CACHE_TTL_HIT_MS = 30 * 864e5;
export const YC_CACHE_TTL_MISS_MS = 7 * 864e5;

export function parseBatchYear(batch: string | null | undefined): number {
  if (!batch) return 0;
  const m = String(batch).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}

// Does a company plausibly hire in one of the wanted countries? This is a coarse
// prefilter to avoid resolving obviously-foreign companies; the authoritative
// country decision still happens per-posting downstream. "Remote" with no
// country is kept (it can be US/CA remote).
export function companyMatchesCountries(c: YcDirectoryCompany, countries: string[]): boolean {
  const wanted = new Set(countries.map((x) => x.toUpperCase()));
  const text = `${(c.regions ?? []).join(" ")} ${c.all_locations ?? ""}`.toLowerCase();
  if (wanted.has("US") && /\bunited states\b|\bu\.?s\.?a?\b|\bamerica\b/.test(text)) return true;
  if (wanted.has("CA") && /\bcanada\b/.test(text)) return true;
  // Country-less remote could be either — don't exclude it here.
  if (/\bremote\b/.test(text) && !/\b(europe|united kingdom|india|asia|latam|africa)\b/.test(text)) {
    return true;
  }
  return false;
}

// Pick the recent, successful, region-relevant companies, most-established first
// (so a maxCompanies cap keeps the strongest signal).
export function selectYcCompanies(
  companies: YcDirectoryCompany[],
  opts: SelectOptions,
): YcDirectoryCompany[] {
  const now = opts.now ?? new Date();
  const minYear = now.getFullYear() - opts.yearsBack;
  const maxTeam = opts.maxTeamSize > 0 ? opts.maxTeamSize : Infinity;
  return companies
    .filter((c) => {
      if (c.isHiring === false) return false;
      if (c.status && c.status !== "Active") return false;
      if (parseBatchYear(c.batch) < minYear) return false;
      const team = c.team_size ?? 0;
      if (team < opts.minTeamSize || team > maxTeam) return false;
      if (!c.website) return false;
      if (!companyMatchesCountries(c, opts.countries)) return false;
      return true;
    })
    .sort((a, b) => (b.team_size ?? 0) - (a.team_size ?? 0));
}

// ---------------------------------------------------------------------------
// ATS detection
// ---------------------------------------------------------------------------

function cleanToken(raw: string): string {
  // Trim query/anchor leftovers and stray punctuation the regex may have caught.
  return raw.replace(/["'<>)][\s\S]*$/, "").replace(/[/?#][\s\S]*$/, "").trim();
}

// Slugs that are ATS marketing/asset paths, not a real board token.
const TOKEN_BLOCKLIST = new Set([
  "embed", "job_board", "jobs", "js", "assets", "img", "images", "static",
  "www", "api", "v1", "boards", "job-boards", "posting-api", "careers", "public",
]);

function validToken(system: ResolvedSystem, token: string): boolean {
  if (!token || token.length < 2 || token.length > 60) return false;
  if (TOKEN_BLOCKLIST.has(token.toLowerCase())) return false;
  const shape = system === "greenhouse" ? /^[a-z0-9]+$/i : /^[a-z0-9-]+$/i;
  return shape.test(token);
}

// Find the first public Greenhouse / Lever / Ashby board referenced in a page's
// HTML. Order matters only for pages that embed more than one widget (rare).
export function detectAtsFromHtml(html: string): { system: ResolvedSystem; token: string } | null {
  if (!html) return null;
  const patterns: { system: ResolvedSystem; re: RegExp }[] = [
    // Greenhouse: hosted board, embed widget, or API — token is the "for="/path segment.
    { system: "greenhouse", re: /greenhouse\.io\/embed\/job_board\?for=([a-z0-9]+)/i },
    { system: "greenhouse", re: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9]+)/i },
    { system: "greenhouse", re: /(?:job-boards|boards)\.greenhouse\.io\/([a-z0-9]+)/i },
    { system: "greenhouse", re: /grnhse\.com\/embed[^"']*for=([a-z0-9]+)/i },
    // Lever.
    { system: "lever", re: /jobs\.lever\.co\/([a-z0-9-]+)/i },
    { system: "lever", re: /api\.lever\.co\/v0\/postings\/([a-z0-9-]+)/i },
    // Ashby.
    { system: "ashby", re: /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i },
    { system: "ashby", re: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9-]+)/i },
  ];
  for (const { system, re } of patterns) {
    const m = html.match(re);
    if (m) {
      const token = cleanToken(m[1]);
      if (validToken(system, token)) return { system, token };
    }
  }
  return null;
}

// Candidate URLs to probe for a company, cheapest/most-likely first.
export function careerUrlCandidates(website: string): string[] {
  let base: string;
  try {
    base = new URL(website).origin;
  } catch {
    base = website.replace(/\/+$/, "");
  }
  return [base, `${base}/careers`, `${base}/jobs`, `${base}/company/careers`, `${base}/about/careers`];
}

export type FetchText = (url: string) => Promise<string>;

// Resolve one company's ATS by crawling its site. Returns null when no public
// board is found (a legitimately cached negative result).
export async function resolveCompanyAts(
  company: YcDirectoryCompany,
  fetchText: FetchText,
): Promise<{ system: ResolvedSystem; token: string } | null> {
  if (!company.website) return null;
  let probeError: unknown;
  for (const url of careerUrlCandidates(company.website)) {
    let html: string;
    try {
      html = await fetchText(url);
    } catch (error) {
      probeError = error;
      continue;
    }
    const hit = detectAtsFromHtml(html);
    if (hit) return hit;
  }
  if (probeError) throw probeError;
  return null;
}

// ---------------------------------------------------------------------------
// Cache-backed resolution
// ---------------------------------------------------------------------------

function isFresh(system: string | null, checkedAt: Date, now: number): boolean {
  const age = now - checkedAt.getTime();
  return age < (system ? YC_CACHE_TTL_HIT_MS : YC_CACHE_TTL_MISS_MS);
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface ResolveDeps {
  prisma: Pick<PrismaClient, "ycAtsCache">;
  fetchText: FetchText;
  concurrency: number;
  now?: Date;
}

// Resolve ATS boards for a set of companies, using the DB cache to skip fresh
// entries and persisting freshly-resolved results (positive + negative).
export async function resolveYcBoards(
  companies: YcDirectoryCompany[],
  deps: ResolveDeps,
): Promise<ResolvedBoard[]> {
  const now = (deps.now ?? new Date()).getTime();
  const slugs = companies.map((c) => c.slug);
  const cachedRows = slugs.length
    ? await deps.prisma.ycAtsCache.findMany({ where: { slug: { in: slugs } } })
    : [];
  const cache = new Map(cachedRows.map((r) => [r.slug, r]));

  const toResolve = companies.filter((c) => {
    const row = cache.get(c.slug);
    return !row || !isFresh(row.system, row.checkedAt, now);
  });

  await mapPool(toResolve, deps.concurrency, async (c) => {
    let hit: { system: ResolvedSystem; token: string } | null;
    try {
      hit = await resolveCompanyAts(c, deps.fetchText);
    } catch {
      // A transient probe failure is not evidence that this company has no ATS.
      // Leave any stale cache row untouched so the next run retries it.
      return;
    }
    const data = {
      name: c.name,
      website: c.website ?? null,
      batch: c.batch ?? null,
      system: hit?.system ?? null,
      token: hit?.token ?? null,
      checkedAt: new Date(),
    };
    await deps.prisma.ycAtsCache.upsert({
      where: { slug: c.slug },
      update: data,
      create: { slug: c.slug, ...data },
    });
    cache.set(c.slug, { slug: c.slug, ...data });
  });

  const boards: ResolvedBoard[] = [];
  const seen = new Set<string>();
  for (const c of companies) {
    const row = cache.get(c.slug);
    if (!row || !row.system || !row.token) continue;
    // Two YC companies occasionally resolve to the same board (rebrands); keep one.
    const key = `${row.system}:${row.token.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push({
      name: c.name,
      slug: c.slug,
      system: row.system as ResolvedSystem,
      token: row.token,
    });
  }
  return boards;
}
