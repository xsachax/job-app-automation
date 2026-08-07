// ---------------------------------------------------------------------------
// Company category classifier (dashboard grouping)
// ---------------------------------------------------------------------------
//
// Every discovered job belongs to exactly one company category so the dashboard
// can filter and label by kind: Big Tech, AI Lab, Quant, Startup (or Other for
// unknown employers surfaced by aggregator boards).
//
// This is a *derive-on-read* classifier — a pure function of the company name,
// not a stored column. The name is the single source of truth, so re-labelling
// a company (or adding one to the catalog) takes effect immediately for every
// existing row with no migration or backfill. The API filters in memory, so a
// denormalized column would add stale-data risk for no query benefit.
//
// The name Sets below are intentionally hard-coded (normalized) rather than
// imported from companies.ts: it keeps the client bundle from pulling in the
// whole catalog, and it decouples the taxonomy from catalog structure. A drift
// guard in test/categories.test.ts asserts every catalog company still resolves
// to a real (non-"other") category, so the two never silently diverge.

export type JobCategory = "bigtech" | "ai" | "quant" | "defense" | "startup" | "other";

export const CATEGORY_LABELS: Record<JobCategory, string> = {
  bigtech: "Big Tech",
  ai: "AI Lab",
  quant: "Quant",
  defense: "Defense",
  startup: "Startup",
  other: "Other",
};

// Display / facet order: broadest and most-recognizable buckets first.
export const CATEGORY_ORDER: JobCategory[] = ["bigtech", "ai", "quant", "defense", "startup", "other"];

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Public / mega-cap tech and its subsidiaries.
const BIGTECH = new Set(
  [
    "Amazon", "Microsoft", "Uber", "Netflix", "Snap", "GitHub", "Spotify",
    "Intuit", "NVIDIA", "Adobe", "Salesforce", "Zoom", "Coinbase", "DoorDash",
    "Robinhood", "Dropbox", "Pinterest", "Cloudflare", "Lyft", "Airbnb",
    "Roblox", "HubSpot", "Datadog", "Waymo", "Apple", "Tesla", "Google",
    "Shopify", "Meta", "LinkedIn", "Rivian", "Cisco",
  ].map(norm),
);

// AI-first labs and applied-AI product companies.
const AI = new Set(
  [
    "Anthropic", "xAI", "Thinking Machines", "Thinking Machines Lab", "Together AI",
    "Scale AI", "OpenAI", "Cohere", "ElevenLabs", "Baseten", "Cursor", "Cognition",
    "Lovable", "Granola", "Mercor", "Sierra", "Harvey", "DeepMind", "Mistral",
    // Well-known AI labs / applied-AI companies (many surface via YC + boards).
    "Perplexity", "Perplexity AI", "Hugging Face", "Runway", "Runway ML",
    "Character AI", "Character.AI", "Glean", "Writer", "Adept", "Inflection",
    "Inflection AI", "Suno", "Luma AI", "Luma Labs", "Physical Intelligence",
    "Figure", "Figure AI", "Codeium", "Windsurf", "Poolside", "Magic",
    "Contextual AI", "Decagon", "Cresta", "Abridge", "OpenEvidence", "World Labs",
    "Skild AI", "Cerebras", "Cerebras Systems", "Retell AI", "SafetyKit",
    "Sierra AI", "Anysphere", "Groq", "Sakana AI", "Liquid AI", "Reka",
    "Imbue", "Cartesia", "Suno AI",
  ].map(norm),
);

// Quantitative / high-frequency trading firms.
const QUANT = new Set(
  [
    "Jane Street", "Hudson River Trading", "DRW", "Point72", "Optiver",
    "IMC Trading", "Jump Trading", "Tower Research Capital", "Squarepoint Capital",
    "Qube Research & Technologies", "WorldQuant", "AQR Capital", "Schonfeld",
    "Virtu Financial", "Akuna Capital", "Five Rings", "Old Mission Capital",
    "PDT Partners", "Vatic Labs", "Chicago Trading Company", "DV Trading",
    "Geneva Trading", "Flow Traders", "TransMarket Group", "Belvedere Trading",
    "Valkyrie Trading", "Maven Securities",
  ].map(norm),
);

// Defense / aerospace primes and defense-tech companies. Names include the
// legal-entity and subsidiary variants that turn up on career sites, Workday
// and the aggregator boards (e.g. "L3Harris Technologies", the two General
// Dynamics units) so each classifies without an extra alias.
const DEFENSE = new Set(
  [
    "Lockheed Martin", "RTX", "Raytheon", "Raytheon Technologies",
    "Northrop Grumman", "General Dynamics", "General Dynamics Information Technology",
    "General Dynamics Mission Systems", "Boeing", "The Boeing Company",
    "L3Harris", "L3Harris Technologies", "Leidos", "Collins Aerospace",
    "BAE Systems", "Booz Allen Hamilton", "Booz Allen", "SAIC", "Peraton",
    "Anduril", "Anduril Industries", "Palantir", "Palantir Technologies",
    "Huntington Ingalls", "Huntington Ingalls Industries", "Textron",
    "Sierra Nevada Corporation", "Sierra Space", "Shield AI", "Applied Intuition",
    "Draper", "MITRE", "Parsons", "CACI", "CACI International", "Textron Systems",
    "Ball Aerospace", "L3 Technologies",
  ].map(norm),
);

// Privately-held scale-ups / venture-backed companies.
const STARTUP = new Set(
  [
    "Databricks", "Stripe", "Figma", "Discord", "SpaceX", "Nuro", "Notion",
    "Ramp", "Wealthsimple",
  ].map(norm),
);

// Common alternate names / legal entities for employers that turn up on the
// aggregator boards (SimplifyJobs, vanshb03) under a different label than our
// catalog uses. Keeps board-sourced cards classified instead of "Other".
const ALIASES: Record<string, JobCategory> = {
  hrt: "quant",
  citadel: "quant",
  citadelsecurities: "quant",
  twosigma: "quant",
  susquehanna: "quant",
  sig: "quant",
  millennium: "quant",
  deshaw: "quant",
  balyasny: "quant",
  anysphere: "ai", // Cursor
  googledeepmind: "ai",
  deepmindtechnologies: "ai",
  characterai: "ai",
  huggingface: "ai",
  facebook: "bigtech",
  metaplatforms: "bigtech",
  alphabet: "bigtech",
  googlellc: "bigtech",
  aws: "bigtech",
  amazonwebservices: "bigtech",
  // Defense / aerospace short forms and board variants.
  gdit: "defense",
  gdms: "defense",
  hii: "defense",
  snc: "defense",
  l3: "defense",
  l3technologies: "defense",
  baesystemsinc: "defense",
};

// Resolve a company name to its category. `fallback` is used only when the name
// matches no known bucket — callers pass "startup" for named/native employers
// (a resolved company we simply haven't tagged) and "other" for anonymous
// aggregator-board listings. See fallbackForSystem().
export function categorizeCompany(name: string, fallback: JobCategory = "startup"): JobCategory {
  const key = norm(name);
  if (!key) return fallback;
  if (BIGTECH.has(key)) return "bigtech";
  if (AI.has(key)) return "ai";
  if (QUANT.has(key)) return "quant";
  if (DEFENSE.has(key)) return "defense";
  if (STARTUP.has(key)) return "startup";
  if (ALIASES[key]) return ALIASES[key];
  return fallback;
}

// Fallback bucket for a job whose employer isn't in any Set, chosen by the
// discovery system: aggregator boards ("githubboard") list arbitrary employers
// we can't vouch for → "other"; everything else (native career sites, YC) is a
// real company we resolved → "startup".
export function fallbackForSystem(system: string | null | undefined): JobCategory {
  return system === "githubboard" ? "other" : "startup";
}

// Convenience: classify straight from a job's stored fields.
export function categorizeJob(job: { company: string; discoverySystem?: string | null }): JobCategory {
  return categorizeCompany(job.company, fallbackForSystem(job.discoverySystem));
}
