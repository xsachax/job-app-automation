// Curated catalog of companies that use easy-apply ATSes (Greenhouse / Lever /
// Ashby) and hire in the US/Canada. Every token here was verified live against
// its public job-board API (see scripts/probe-sources.ts) so the seed never
// wires up a dead board.
//
// `tags` groups each company so you can seed a focused slice:
//   bigtech  — large US tech employers
//   known    — well-known scale-ups / public companies
//   yc       — Y Combinator-affiliated
//   a16z     — Andreessen Horowitz portfolio
//   greylock — Greylock Partners portfolio
//
// Add more with `npm run sources:probe` (validates tokens) then drop the
// winners in below.

export type AtsKind = "greenhouse" | "lever" | "ashby";
export type CatalogTag = "bigtech" | "known" | "yc" | "a16z" | "greylock";

export interface CatalogCompany {
  name: string;
  kind: AtsKind;
  token: string;
  tags: CatalogTag[];
  region: "US" | "CA";
}

export const COMPANY_CATALOG: CatalogCompany[] = [
  // ---------------- Greenhouse ----------------
  { name: "Databricks", kind: "greenhouse", token: "databricks", tags: ["known"], region: "US" },
  { name: "Stripe", kind: "greenhouse", token: "stripe", tags: ["known"], region: "US" },
  { name: "Anthropic", kind: "greenhouse", token: "anthropic", tags: ["known"], region: "US" },
  { name: "Waymo", kind: "greenhouse", token: "waymo", tags: ["bigtech"], region: "US" },
  { name: "MongoDB", kind: "greenhouse", token: "mongodb", tags: ["known"], region: "US" },
  { name: "Samsara", kind: "greenhouse", token: "samsara", tags: ["known"], region: "US" },
  { name: "Verkada", kind: "greenhouse", token: "verkada", tags: ["known"], region: "US" },
  { name: "Brex", kind: "greenhouse", token: "brex", tags: ["yc", "greylock"], region: "US" },
  { name: "Cloudflare", kind: "greenhouse", token: "cloudflare", tags: ["known"], region: "US" },
  { name: "Roblox", kind: "greenhouse", token: "roblox", tags: ["bigtech"], region: "US" },
  { name: "Airbnb", kind: "greenhouse", token: "airbnb", tags: ["bigtech"], region: "US" },
  { name: "Elastic", kind: "greenhouse", token: "elastic", tags: ["known"], region: "US" },
  { name: "Reddit", kind: "greenhouse", token: "reddit", tags: ["known"], region: "US" },
  { name: "Scale AI", kind: "greenhouse", token: "scaleai", tags: ["yc", "a16z"], region: "US" },
  { name: "Pinterest", kind: "greenhouse", token: "pinterest", tags: ["known"], region: "US" },
  { name: "Affirm", kind: "greenhouse", token: "affirm", tags: ["known"], region: "US" },
  { name: "Figma", kind: "greenhouse", token: "figma", tags: ["known"], region: "US" },
  { name: "GitLab", kind: "greenhouse", token: "gitlab", tags: ["known"], region: "US" },
  { name: "Flexport", kind: "greenhouse", token: "flexport", tags: ["yc"], region: "US" },
  { name: "Coinbase", kind: "greenhouse", token: "coinbase", tags: ["known"], region: "US" },
  { name: "Lyft", kind: "greenhouse", token: "lyft", tags: ["known"], region: "US" },
  { name: "Asana", kind: "greenhouse", token: "asana", tags: ["known"], region: "US" },
  { name: "Instacart", kind: "greenhouse", token: "instacart", tags: ["known"], region: "US" },
  { name: "Robinhood", kind: "greenhouse", token: "robinhood", tags: ["known"], region: "US" },
  { name: "Grafana Labs", kind: "greenhouse", token: "grafanalabs", tags: ["known"], region: "US" },
  { name: "Nuro", kind: "greenhouse", token: "nuro", tags: ["greylock"], region: "US" },
  { name: "Mozilla", kind: "greenhouse", token: "mozilla", tags: ["known"], region: "US" },
  { name: "Gusto", kind: "greenhouse", token: "gusto", tags: ["known"], region: "US" },
  { name: "Faire", kind: "greenhouse", token: "faire", tags: ["yc", "greylock"], region: "US" },
  { name: "Chime", kind: "greenhouse", token: "chime", tags: ["known"], region: "US" },
  { name: "SoFi", kind: "greenhouse", token: "sofi", tags: ["known"], region: "US" },
  { name: "Twitch", kind: "greenhouse", token: "twitch", tags: ["known"], region: "US" },
  { name: "Temporal", kind: "greenhouse", token: "temporaltechnologies", tags: ["a16z"], region: "US" },
  { name: "Checkr", kind: "greenhouse", token: "checkr", tags: ["yc", "a16z"], region: "US" },
  { name: "Discord", kind: "greenhouse", token: "discord", tags: ["greylock"], region: "US" },
  { name: "Gemini", kind: "greenhouse", token: "gemini", tags: ["known"], region: "US" },
  { name: "Betterment", kind: "greenhouse", token: "betterment", tags: ["known"], region: "US" },
  { name: "Airtable", kind: "greenhouse", token: "airtable", tags: ["known"], region: "US" },
  { name: "Cockroach Labs", kind: "greenhouse", token: "cockroachlabs", tags: ["greylock"], region: "US" },
  { name: "Dropbox", kind: "greenhouse", token: "dropbox", tags: ["known"], region: "US" },
  { name: "Webflow", kind: "greenhouse", token: "webflow", tags: ["known"], region: "US" },
  { name: "Nextdoor", kind: "greenhouse", token: "nextdoor", tags: ["greylock"], region: "US" },
  { name: "Squarespace", kind: "greenhouse", token: "squarespace", tags: ["known"], region: "US" },
  { name: "2U", kind: "greenhouse", token: "2u", tags: ["known"], region: "US" },
  { name: "DoorDash", kind: "greenhouse", token: "doordashusa", tags: ["known"], region: "US" },
  { name: "Vercel", kind: "greenhouse", token: "vercel", tags: ["a16z", "greylock"], region: "US" },
  { name: "Zipline", kind: "greenhouse", token: "flyzipline", tags: ["known"], region: "US" },

  // ---------------- Lever ----------------
  { name: "Veeva", kind: "lever", token: "veeva", tags: ["known"], region: "US" },
  { name: "Palantir", kind: "lever", token: "palantir", tags: ["known"], region: "US" },

  // ---------------- Ashby ----------------
  { name: "OpenAI", kind: "ashby", token: "openai", tags: ["known"], region: "US" },
  { name: "Crusoe", kind: "ashby", token: "crusoe", tags: ["a16z"], region: "US" },
  { name: "Harvey", kind: "ashby", token: "harvey", tags: ["greylock", "a16z"], region: "US" },
  { name: "Sierra", kind: "ashby", token: "sierra", tags: ["greylock"], region: "US" },
  { name: "Zip", kind: "ashby", token: "zip", tags: ["yc"], region: "US" },
  { name: "Ramp", kind: "ashby", token: "ramp", tags: ["yc", "a16z"], region: "US" },
  { name: "Cursor (Anysphere)", kind: "ashby", token: "cursor", tags: ["a16z"], region: "US" },
  { name: "Decagon", kind: "ashby", token: "decagon", tags: ["a16z"], region: "US" },
  { name: "Vanta", kind: "ashby", token: "vanta", tags: ["yc", "greylock"], region: "US" },
  { name: "Replit", kind: "ashby", token: "replit", tags: ["a16z", "yc"], region: "US" },
  { name: "Baseten", kind: "ashby", token: "baseten", tags: ["greylock"], region: "US" },
  { name: "Mercor", kind: "ashby", token: "mercor", tags: ["yc"], region: "US" },
  { name: "Ashby", kind: "ashby", token: "ashby", tags: ["yc", "a16z"], region: "US" },
  { name: "Supabase", kind: "ashby", token: "supabase", tags: ["yc"], region: "US" },
  { name: "Watershed", kind: "ashby", token: "watershed", tags: ["greylock"], region: "US" },
  { name: "Sardine", kind: "ashby", token: "sardine", tags: ["a16z"], region: "US" },
  { name: "Modal", kind: "ashby", token: "modal", tags: ["known"], region: "US" },
  { name: "Rilla", kind: "ashby", token: "rilla", tags: ["yc"], region: "US" },
  { name: "Linear", kind: "ashby", token: "linear", tags: ["known"], region: "US" },
  { name: "PostHog", kind: "ashby", token: "posthog", tags: ["yc"], region: "US" },
  { name: "Substack", kind: "ashby", token: "substack", tags: ["a16z"], region: "US" },
  { name: "Neon", kind: "ashby", token: "neon", tags: ["known"], region: "US" },
  { name: "Notion", kind: "ashby", token: "notion", tags: ["known"], region: "US" },
  { name: "Perplexity", kind: "ashby", token: "perplexity", tags: ["a16z"], region: "US" },
  { name: "Runway", kind: "ashby", token: "runway", tags: ["greylock"], region: "US" },
];

export interface SeedSource {
  name: string;
  kind: AtsKind;
  config: { company: string; companyName: string; tags: CatalogTag[]; region: string };
}

const KIND_LABEL: Record<AtsKind, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

// Expand the catalog into Source rows. Optionally filter by tag.
export function catalogSources(filterTags?: CatalogTag[]): SeedSource[] {
  const wanted = filterTags && filterTags.length ? new Set(filterTags) : null;
  return COMPANY_CATALOG.filter(
    (c) => !wanted || c.tags.some((t) => wanted.has(t)),
  ).map((c) => ({
    name: `${c.name} (${KIND_LABEL[c.kind]})`,
    kind: c.kind,
    config: { company: c.token, companyName: c.name, tags: c.tags, region: c.region },
  }));
}
