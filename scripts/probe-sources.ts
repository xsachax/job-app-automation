import { setTimeout as sleep } from "node:timers/promises";

// One-off catalog verifier. Probes a wide list of candidate ATS boards and
// prints the ones that resolve (with a live job count), so we only seed boards
// that actually work. Not part of the app runtime.

type Kind = "greenhouse" | "lever" | "ashby";
interface Cand {
  kind: Kind;
  token: string;
  name: string;
  tags: string[];
}

function u(kind: Kind, token: string): string {
  if (kind === "greenhouse")
    return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`;
  if (kind === "lever") return `https://api.lever.co/v0/postings/${token}?mode=json`;
  return `https://api.ashbyhq.com/posting-api/job-board/${token}`;
}

async function count(c: Cand): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(u(c.kind, c.token), {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (c.kind === "lever") return Array.isArray(data) ? data.length : null;
    const jobs = (data as { jobs?: unknown[] }).jobs;
    return Array.isArray(jobs) ? jobs.length : null;
  } catch {
    return null;
  }
}

const GH = (token: string, name: string, tags: string[]): Cand => ({ kind: "greenhouse", token, name, tags });
const LV = (token: string, name: string, tags: string[]): Cand => ({ kind: "lever", token, name, tags });
const AS = (token: string, name: string, tags: string[]): Cand => ({ kind: "ashby", token, name, tags });

const CANDIDATES: Cand[] = [
  // ---- Greenhouse ----
  GH("figma", "Figma", ["known"]),
  GH("gitlab", "GitLab", ["known"]),
  GH("stripe", "Stripe", ["known"]),
  GH("airbnb", "Airbnb", ["bigtech"]),
  GH("dropbox", "Dropbox", ["known"]),
  GH("coinbase", "Coinbase", ["known"]),
  GH("robinhood", "Robinhood", ["known"]),
  GH("databricks", "Databricks", ["known"]),
  GH("cloudflare", "Cloudflare", ["known"]),
  GH("doordash", "DoorDash", ["known"]),
  GH("instacart", "Instacart", ["known"]),
  GH("pinterest", "Pinterest", ["known"]),
  GH("reddit", "Reddit", ["known"]),
  GH("lyft", "Lyft", ["known"]),
  GH("twitch", "Twitch", ["known"]),
  GH("sofi", "SoFi", ["known"]),
  GH("affirm", "Affirm", ["known"]),
  GH("chime", "Chime", ["known"]),
  GH("samsara", "Samsara", ["known"]),
  GH("hashicorp", "HashiCorp", ["known"]),
  GH("confluent", "Confluent", ["known"]),
  GH("elastic", "Elastic", ["known"]),
  GH("mongodb", "MongoDB", ["known"]),
  GH("snyk", "Snyk", ["greylock"]),
  GH("asana", "Asana", ["known"]),
  GH("box", "Box", ["known"]),
  GH("docker", "Docker", ["known"]),
  GH("retool", "Retool", ["yc", "a16z"]),
  GH("gusto", "Gusto", ["known"]),
  GH("brex", "Brex", ["yc", "greylock"]),
  GH("plaid", "Plaid", ["a16z"]),
  GH("benchling", "Benchling", ["a16z", "greylock"]),
  GH("discord", "Discord", ["greylock"]),
  GH("faire", "Faire", ["yc", "greylock"]),
  GH("flexport", "Flexport", ["yc"]),
  GH("gopuff", "Gopuff", ["known"]),
  GH("rippling", "Rippling", ["a16z", "greylock"]),
  GH("roblox", "Roblox", ["bigtech"]),
  GH("unity", "Unity", ["known"]),
  GH("wayfair", "Wayfair", ["known"]),
  GH("betterment", "Betterment", ["known"]),
  GH("oscarhealth", "Oscar Health", ["known"]),
  GH("thumbtack", "Thumbtack", ["known"]),
  GH("nextdoor", "Nextdoor", ["greylock"]),
  GH("getcruise", "Cruise", ["known"]),
  GH("cockroachlabs", "Cockroach Labs", ["greylock"]),
  GH("grafanalabs", "Grafana Labs", ["known"]),
  GH("dbtlabs", "dbt Labs", ["a16z"]),
  GH("temporaltechnologies", "Temporal", ["a16z"]),
  GH("appliedintuition", "Applied Intuition", ["a16z"]),
  GH("openai", "OpenAI", ["known"]),
  GH("anthropic", "Anthropic", ["known"]),
  GH("scaleai", "Scale AI", ["yc", "a16z"]),
  GH("airtable", "Airtable", ["known"]),
  GH("notion", "Notion", ["known"]),
  GH("verkada", "Verkada", ["known"]),
  GH("nuro", "Nuro", ["greylock"]),
  GH("addepar", "Addepar", ["a16z"]),
  GH("gemini", "Gemini", ["known"]),
  GH("webflow", "Webflow", ["known"]),
  GH("checkr", "Checkr", ["yc", "a16z"]),
  GH("gustocom", "Gusto Inc", ["known"]),
  GH("mozilla", "Mozilla", ["known"]),
  GH("squarespace", "Squarespace", ["known"]),
  GH("niantic", "Niantic", ["known"]),
  GH("crypto", "Crypto.com", ["known"]),
  GH("waymo", "Waymo", ["bigtech"]),
  GH("2u", "2U", ["known"]),
  // ---- Lever ----
  LV("netflix", "Netflix", ["bigtech"]),
  LV("palantir", "Palantir", ["known"]),
  LV("kayak", "KAYAK", ["known"]),
  LV("nutanix", "Nutanix", ["known"]),
  LV("attentive", "Attentive", ["a16z"]),
  LV("ripple", "Ripple", ["a16z", "greylock"]),
  LV("mixpanel", "Mixpanel", ["a16z"]),
  LV("plaid", "Plaid (Lever)", ["a16z"]),
  LV("voleon", "Voleon", ["known"]),
  LV("veeva", "Veeva", ["known"]),
  LV("upstart", "Upstart", ["known"]),
  LV("brex", "Brex (Lever)", ["yc"]),
  LV("semgrep", "Semgrep", ["yc", "greylock"]),
  LV("wealthsimple", "Wealthsimple", ["known"]),
  LV("clearbit", "Clearbit", ["yc"]),
  LV("benchling", "Benchling (Lever)", ["greylock"]),
  LV("cohere", "Cohere", ["known"]),
  // ---- Ashby ----
  AS("ramp", "Ramp", ["yc", "a16z"]),
  AS("linear", "Linear", ["known"]),
  GH("vercel", "Vercel", ["a16z", "greylock"]),
  AS("mistral", "Mistral AI", ["a16z"]),
  AS("runwayml", "Runway", ["greylock"]),
  AS("replit", "Replit", ["a16z", "yc"]),
  AS("clerk", "Clerk", ["yc"]),
  AS("posthog", "PostHog", ["yc"]),
  AS("deel", "Deel", ["yc", "a16z"]),
  AS("hex", "Hex", ["a16z"]),
  AS("watershed", "Watershed", ["greylock"]),
  AS("openstore", "OpenStore", ["a16z"]),
  AS("modal", "Modal", ["known"]),
  AS("baseten", "Baseten", ["greylock"]),
  AS("together", "Together AI", ["known"]),
  AS("perplexity-ai", "Perplexity", ["a16z"]),
  AS("substack", "Substack", ["a16z"]),
  AS("whatnot", "Whatnot", ["a16z"]),
  AS("vanta", "Vanta", ["yc", "greylock"]),
  AS("sardine", "Sardine", ["a16z"]),
  AS("census", "Census", ["a16z"]),
  AS("gem", "Gem", ["greylock"]),
  AS("neon", "Neon", ["known"]),
  AS("supabase", "Supabase", ["yc"]),
  AS("zip", "Zip", ["yc"]),
  AS("ashby", "Ashby", ["yc", "a16z"]),
  AS("crusoe", "Crusoe", ["a16z"]),
  AS("cursor", "Cursor (Anysphere)", ["a16z"]),
  AS("decagon", "Decagon", ["a16z"]),
  AS("sierra", "Sierra", ["greylock"]),
  AS("harvey", "Harvey", ["greylock", "a16z"]),
  AS("glean", "Glean", ["greylock"]),
  AS("abnormal", "Abnormal Security", ["greylock"]),
  AS("rilla", "Rilla", ["yc"]),
  AS("mercor", "Mercor", ["yc"]),
];

async function run() {
  const valid: (Cand & { count: number })[] = [];
  const dead: Cand[] = [];
  const pool = 8;
  for (let i = 0; i < CANDIDATES.length; i += pool) {
    const batch = CANDIDATES.slice(i, i + pool);
    const results = await Promise.all(
      batch.map(async (c) => ({ c, n: await count(c) })),
    );
    for (const { c, n } of results) {
      if (n && n > 0) valid.push({ ...c, count: n });
      else dead.push(c);
    }
    await sleep(150);
  }
  valid.sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count);
  console.log("\n=== VALID (" + valid.length + ") ===");
  for (const v of valid) console.log(`${v.kind}\t${v.token}\t${v.count}\t${v.name}\t[${v.tags.join(",")}]`);
  console.log("\n=== DEAD (" + dead.length + ") ===");
  for (const d of dead) console.log(`${d.kind}\t${d.token}\t${d.name}`);
  console.log("\nJSON_VALID=" + JSON.stringify(valid.map(({ kind, token, name, tags }) => ({ kind, token, name, tags }))));
}

run();
