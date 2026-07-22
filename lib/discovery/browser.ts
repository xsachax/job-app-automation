import { chromium, type Browser, type Page } from "playwright";
import type { Country } from "./entryLevel";
import {
  BROWSER_COMPANIES,
  SCRAPABLE_BROWSER_SYSTEMS,
  type BrowserCompany,
  type BrowserSystem,
} from "./companies";
import type { DiscoveryPosting } from "./adapters";

// Playwright-based scraper for the client-rendered / bot-gated career sites that
// have no usable public JSON API (see BROWSER_COMPANIES). It is intentionally
// best-effort and kept OUT of the default test/CI path — it needs a real
// browser and live network. Each search URL in the catalog is already scoped to
// one country, so we tag every posting harvested from a page with that page's
// country instead of trying to parse geography per card.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// A single harvested posting before country is applied.
interface RawCard {
  title: string;
  href: string;
  externalId: string;
  postedAt: string | null;
}

interface SiteRule {
  // The origin used to absolutize relative hrefs.
  origin: string;
  // Runs in the page and returns raw posting cards.
  extract: (page: Page) => Promise<RawCard[]>;
  // How many times to click "next" / scroll to load more (best effort).
  pages?: number;
  // Advance to the next page of results; return false when there is no more.
  next?: (page: Page, n: number) => Promise<boolean>;
}

// Generic DOM harvester: collect anchors whose href matches `pattern`, using the
// anchor's text as the title and (optionally) a sibling for a posted date.
function anchorHarvest(pattern: RegExp) {
  return (page: Page) =>
    page.evaluate((src) => {
      const re = new RegExp(src, "i");
      const seen = new Set<string>();
      const cards: { title: string; href: string; externalId: string; postedAt: string | null }[] = [];
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = a.getAttribute("href") || "";
        if (!re.test(href) || seen.has(href)) continue;
        const title = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (title.length < 4 || /see (full )?role|apply|learn more|view/i.test(title)) continue;
        seen.add(href);
        const container = a.closest("li,article,div");
        const ctx = (container?.textContent || "").replace(/\s+/g, " ").trim();
        const dm = ctx.match(/[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/); // "Jul 21, 2026"
        cards.push({ title, href, externalId: href, postedAt: dm ? dm[0] : null });
      }
      return cards;
    }, pattern.source);
}

// Per-site rules. Only sites with a verified, clean extractor are listed here;
// everything else is reported as unsupported rather than harvesting noise (many
// of these SPAs wrap an entire card in one anchor, or their location filter is
// ignored, which would yield polluted titles / wrong countries). Apple renders
// real postings server-side with a stable /details/<id> URL and a country-scoped
// search, so it extracts cleanly.
const RULES: Partial<Record<BrowserSystem, SiteRule>> = {
  apple: {
    origin: "https://jobs.apple.com",
    extract: anchorHarvest(/\/details\/\d/),
    pages: 3,
    next: async (page, n) => {
      // Apple paginates with a numbered pager; click the page-(n+1) control.
      const link = page.locator(`nav[aria-label*="agination" i] a`, { hasText: String(n + 1) }).first();
      if ((await link.count()) === 0) return false;
      await link.click();
      await page.waitForTimeout(2500);
      return true;
    },
  },
};

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function scrapeUrl(
  page: Page,
  company: BrowserCompany,
  url: string,
  country: Country,
  rule: SiteRule,
): Promise<DiscoveryPosting[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(6000);

  const all: RawCard[] = [];
  const maxPages = rule.pages ?? 1;
  for (let n = 1; ; n++) {
    all.push(...(await rule.extract(page)));
    if (n >= maxPages || !rule.next) break;
    const advanced = await rule.next(page, n).catch(() => false);
    if (!advanced) break;
  }

  const seen = new Set<string>();
  const out: DiscoveryPosting[] = [];
  for (const c of all) {
    // Real titles are short; anything long is concatenated card noise — drop it.
    if (c.title.length > 90) continue;
    const applyUrl = c.href.startsWith("http") ? c.href : rule.origin + c.href;
    if (seen.has(applyUrl)) continue;
    seen.add(applyUrl);
    out.push({
      company: company.name,
      title: c.title,
      location: country === "CA" ? "Canada" : "United States",
      country,
      applyUrl,
      externalId: c.externalId,
      description: "",
      postedAt: toDate(c.postedAt),
      system: company.system,
    });
  }
  return out;
}

export interface BrowserScrapeResult {
  company: string;
  system: BrowserSystem;
  usFound: number;
  caFound: number;
  postings: DiscoveryPosting[];
  supported: boolean;
  error?: string;
}

export async function scrapeBrowserCompany(
  company: BrowserCompany,
  browser: Browser,
): Promise<BrowserScrapeResult> {
  const res: BrowserScrapeResult = {
    company: company.name,
    system: company.system,
    usFound: 0,
    caFound: 0,
    postings: [],
    supported: SCRAPABLE_BROWSER_SYSTEMS.includes(company.system),
  };

  // No verified extractor: skip rather than harvest unreliable data.
  const rule = RULES[company.system];
  if (!rule) {
    res.error = "no reliable extractor yet (client-rendered / bot-gated)";
    return res;
  }

  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
  try {
    const page = await ctx.newPage();
    // Block heavy assets to speed things up.
    await page.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font") return route.abort();
      return route.continue();
    });
    const us = await scrapeUrl(page, company, company.searchUrlUS, "US", rule).catch(() => []);
    const ca = await scrapeUrl(page, company, company.searchUrlCA, "CA", rule).catch(() => []);
    res.usFound = us.length;
    res.caFound = ca.length;
    res.postings = [...us, ...ca];
  } catch (e) {
    res.error = e instanceof Error ? e.message : String(e);
  } finally {
    await ctx.close();
  }
  return res;
}

// Scrape every browser company (or a named subset). Returns raw postings; the
// caller ingests them (classify + persist) via ingestPostings in run.ts.
export async function scrapeBrowserCompanies(opts?: {
  companies?: string[];
  onResult?: (r: BrowserScrapeResult) => void;
}): Promise<BrowserScrapeResult[]> {
  const wanted = opts?.companies?.map((s) => s.toLowerCase());
  const targets = wanted
    ? BROWSER_COMPANIES.filter((c) => wanted.includes(c.name.toLowerCase()))
    : BROWSER_COMPANIES;

  const browser = await chromium.launch({ headless: true });
  const results: BrowserScrapeResult[] = [];
  try {
    for (const c of targets) {
      const r = await scrapeBrowserCompany(c, browser);
      results.push(r);
      opts?.onResult?.(r);
    }
  } finally {
    await browser.close();
  }
  return results;
}
