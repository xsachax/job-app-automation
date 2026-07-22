// ---------------------------------------------------------------------------
// Company career-site query catalog (discovery pivot)
// ---------------------------------------------------------------------------
//
// The user asked to target ~42 specific big-tech / well-known / VC-backed
// companies and find, for EACH, the exact web query that lists their currently
// open entry-level software roles in the US and in Canada (kept separate).
//
// Every entry below was probed LIVE (see scripts/verify-queries.ts,
// `npm run discovery:verify`). Companies fall into two buckets:
//
//   method: "api"     -> a public JSON endpoint we can fetch directly. Country
//                        separation is either a native request param
//                        (Amazon / Uber / Netflix / Workday) or done by us via
//                        classifyCountry() on the returned location string
//                        (Greenhouse / Lever / Ashby / Snap / Phenom).
//
//   method: "browser" -> no usable public JSON API (client-rendered SPA and/or
//                        bot protection e.g. Akamai/PerimeterX/CSRF). These need
//                        a headless browser (Playwright) at scrape time. We
//                        still record the exact human search URL (US + CA
//                        filtered where the site supports it) so the query is
//                        pinned and confirmable.
//
// `queryTerms` are the software keywords we search each board with; the
// entry-level / bachelor's / no-YoE narrowing is applied afterwards by
// classifyEntryLevel() so the logic stays in one place.

export type DiscoveryMethod = "api";
export type DiscoverySystem =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "amazon"
  | "uber"
  | "netflix"
  | "snap"
  | "phenom"
  | "spotify"
  | "talentbrew"
  | "microsoft"
  | "workday";

export type BrowserSystem =
  | "apple"
  | "tesla"
  | "google"
  | "deepmind"
  | "shopify"
  | "meta"
  | "linkedin"
  | "mistral";

// Browser systems that currently have a verified, clean Playwright extractor
// (lib/discovery/browser.ts). The rest render an entire card inside one anchor,
// ignore their own location filter, or hard-block headless clients (Akamai /
// PerimeterX), so we surface their pinned human search URL instead of scraping
// unreliable data. Keep this in sync with RULES in browser.ts.
export const SCRAPABLE_BROWSER_SYSTEMS: BrowserSystem[] = ["apple"];

export interface ApiCompany {
  name: string;
  method: "api";
  system: DiscoverySystem;
  // Identifier the system needs: ATS board token, Workday tenant, etc.
  token?: string;
  // Workday-specific host + site path.
  workday?: { host: string; tenant: string; site: string };
  // TalentBrew (Radancy) host, e.g. "jobs.intuit.com".
  talentbrew?: { host: string };
  // Does the endpoint filter US/CA server-side, or must we post-filter?
  countryFilter: "native" | "post";
  // Software keywords used to scope the query.
  queryTerms: string[];
}

export interface BrowserCompany {
  name: string;
  method: "browser";
  system: BrowserSystem;
  // Exact human search URLs, already scoped to software + country where possible.
  searchUrlUS: string;
  searchUrlCA: string;
  // Why it can't be hit as a plain JSON API.
  reason: string;
}

export type DiscoveryCompany = ApiCompany | BrowserCompany;

const SWE = ["software engineer", "software developer"];
const SWE_BROAD = ["software engineer", "software developer", "machine learning", "devops"];

// ---------------------------------------------------------------------------
// API companies (41) — direct public JSON endpoints, verified live
// ---------------------------------------------------------------------------

export const API_COMPANIES: ApiCompany[] = [
  // ---- Greenhouse: https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true
  { name: "Anthropic", method: "api", system: "greenhouse", token: "anthropic", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Databricks", method: "api", system: "greenhouse", token: "databricks", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Stripe", method: "api", system: "greenhouse", token: "stripe", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Coinbase", method: "api", system: "greenhouse", token: "coinbase", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "DoorDash", method: "api", system: "greenhouse", token: "doordashusa", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Figma", method: "api", system: "greenhouse", token: "figma", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Robinhood", method: "api", system: "greenhouse", token: "robinhood", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Dropbox", method: "api", system: "greenhouse", token: "dropbox", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Pinterest", method: "api", system: "greenhouse", token: "pinterest", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Cloudflare", method: "api", system: "greenhouse", token: "cloudflare", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Lyft", method: "api", system: "greenhouse", token: "lyft", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Airbnb", method: "api", system: "greenhouse", token: "airbnb", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Roblox", method: "api", system: "greenhouse", token: "roblox", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Discord", method: "api", system: "greenhouse", token: "discord", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "HubSpot", method: "api", system: "greenhouse", token: "hubspotjobs", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Datadog", method: "api", system: "greenhouse", token: "datadog", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "xAI", method: "api", system: "greenhouse", token: "xai", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "SpaceX", method: "api", system: "greenhouse", token: "spacex", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Thinking Machines", method: "api", system: "greenhouse", token: "thinkingmachines", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Nuro", method: "api", system: "greenhouse", token: "nuro", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "DRW", method: "api", system: "greenhouse", token: "drweng", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Jane Street", method: "api", system: "greenhouse", token: "janestreet", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Hudson River Trading", method: "api", system: "greenhouse", token: "wehrtyou", countryFilter: "post", queryTerms: SWE_BROAD },

  // ---- Ashby: https://api.ashbyhq.com/posting-api/job-board/<token>
  { name: "OpenAI", method: "api", system: "ashby", token: "openai", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Notion", method: "api", system: "ashby", token: "notion", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Ramp", method: "api", system: "ashby", token: "ramp", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Cohere", method: "api", system: "ashby", token: "cohere", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "ElevenLabs", method: "api", system: "ashby", token: "elevenlabs", countryFilter: "post", queryTerms: SWE_BROAD },
  { name: "Baseten", method: "api", system: "ashby", token: "baseten", countryFilter: "post", queryTerms: SWE_BROAD },

  // ---- Bespoke public JSON endpoints
  { name: "Amazon", method: "api", system: "amazon", countryFilter: "native", queryTerms: SWE },
  { name: "Microsoft", method: "api", system: "microsoft", countryFilter: "native", queryTerms: SWE },
  { name: "Uber", method: "api", system: "uber", countryFilter: "native", queryTerms: SWE },
  { name: "Netflix", method: "api", system: "netflix", countryFilter: "native", queryTerms: SWE },
  { name: "Snap", method: "api", system: "snap", countryFilter: "post", queryTerms: SWE },
  { name: "GitHub", method: "api", system: "phenom", token: "github.careers", countryFilter: "post", queryTerms: SWE },
  { name: "Spotify", method: "api", system: "spotify", countryFilter: "post", queryTerms: SWE },
  { name: "Intuit", method: "api", system: "talentbrew", countryFilter: "post", queryTerms: SWE, talentbrew: { host: "jobs.intuit.com" } },

  // ---- Workday CXS: POST https://<host>/wday/cxs/<tenant>/<site>/jobs
  { name: "Nvidia", method: "api", system: "workday", countryFilter: "post", queryTerms: SWE, workday: { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" } },
  { name: "Adobe", method: "api", system: "workday", countryFilter: "post", queryTerms: SWE, workday: { host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" } },
  { name: "Salesforce", method: "api", system: "workday", countryFilter: "post", queryTerms: SWE, workday: { host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" } },
  { name: "Zoom", method: "api", system: "workday", countryFilter: "post", queryTerms: SWE, workday: { host: "zoom.wd5.myworkdayjobs.com", tenant: "zoom", site: "Zoom" } },
];

// ---------------------------------------------------------------------------
// Browser companies (8) — no usable public JSON API, need Playwright at scrape
// time. URLs are pinned & confirmable in a browser.
// ---------------------------------------------------------------------------

export const BROWSER_COMPANIES: BrowserCompany[] = [
  {
    name: "Apple", method: "browser", system: "apple",
    searchUrlUS: "https://jobs.apple.com/en-us/search?location=united-states-USA&team=apps-and-frameworks-SFTWR-AF,cloud-and-infrastructure-SFTWR-CLD,core-operating-systems-SFTWR-COS",
    searchUrlCA: "https://jobs.apple.com/en-ca/search?location=canada-CANC&team=apps-and-frameworks-SFTWR-AF,cloud-and-infrastructure-SFTWR-CLD,core-operating-systems-SFTWR-COS",
    reason: "role/search API requires a CSRF token + session cookie; empty on plain fetch.",
  },
  {
    name: "Tesla", method: "browser", system: "tesla",
    searchUrlUS: "https://www.tesla.com/careers/search/?query=software&region=5&type=3",
    searchUrlCA: "https://www.tesla.com/careers/search/?query=software&region=4",
    reason: "cua-api is Akamai-protected (Access Denied to non-browser clients).",
  },
  {
    name: "Google", method: "browser", system: "google",
    searchUrlUS: "https://www.google.com/about/careers/applications/jobs/results/?q=software%20engineer&target_level=EARLY&target_level=INTERN_AND_APPRENTICE&location=United%20States",
    searchUrlCA: "https://www.google.com/about/careers/applications/jobs/results/?q=software%20engineer&target_level=EARLY&target_level=INTERN_AND_APPRENTICE&location=Canada",
    reason: "public Cloud Talent API retired; results are client-rendered behind an internal endpoint.",
  },
  {
    name: "DeepMind", method: "browser", system: "deepmind",
    searchUrlUS: "https://deepmind.google/about/careers/#/?location=United%20States&search=software%20engineer",
    searchUrlCA: "https://deepmind.google/about/careers/#/?location=Canada&search=software%20engineer",
    reason: "careers board is a client-rendered SPA sharing Google's non-public backend.",
  },
  {
    name: "Shopify", method: "browser", system: "shopify",
    searchUrlUS: "https://www.shopify.com/careers/search?keywords=software%20engineer&location=United%20States",
    searchUrlCA: "https://www.shopify.com/careers/search?keywords=software%20engineer&location=Canada",
    reason: "careers search is client-rendered; SmartRecruiters slug returns 0.",
  },
  {
    name: "Meta", method: "browser", system: "meta",
    searchUrlUS: "https://www.metacareers.com/jobs?q=software%20engineer&offices[0]=United%20States&roles[0]=Individual%20Contributor",
    searchUrlCA: "https://www.metacareers.com/jobs?q=software%20engineer&offices[0]=Canada&roles[0]=Individual%20Contributor",
    reason: "metacareers uses a fragile GraphQL backend with request signing; not a stable public API.",
  },
  {
    name: "LinkedIn", method: "browser", system: "linkedin",
    searchUrlUS: "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&f_E=1%2C2&location=United%20States&f_C=1337",
    searchUrlCA: "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&f_E=1%2C2&location=Canada&f_C=1337",
    reason: "guest voyager API is rate-limited & auth-gated; needs a browser session.",
  },
  {
    name: "Mistral", method: "browser", system: "mistral",
    searchUrlUS: "https://jobs.ashbyhq.com/mistral?locationId=&departmentId=",
    searchUrlCA: "https://jobs.ashbyhq.com/mistral?locationId=&departmentId=",
    reason: "Ashby-embedded SPA; public posting-api ('mistral') returns Not Found, so postings only render client-side.",
  },
];

export const ALL_COMPANIES: DiscoveryCompany[] = [...API_COMPANIES, ...BROWSER_COMPANIES];
