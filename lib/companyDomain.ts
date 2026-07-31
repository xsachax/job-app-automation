// Best-effort resolution of a company display name to a web domain, used to
// fetch a favicon-style logo for job cards. There is no per-job domain in our
// data (apply URLs point at ATS hosts like greenhouse.io, not the employer), so
// we derive one from the company name: a curated override for names where a
// naive guess is wrong, otherwise a slug + ".com". Anything that resolves to a
// wrong/absent logo simply 404s and the UI falls back to a monogram, so this is
// allowed to be approximate.

// Curated, high-signal overrides (keyed by lower-cased company name). Focused on
// the companies that appear most in discovery and whose real domain isn't just
// "<slug>.com".
const DOMAIN_OVERRIDES: Record<string, string> = {
  xai: "x.ai",
  zoom: "zoom.us",
  nuro: "nuro.ai",
  baseten: "baseten.co",
  cursor: "cursor.com",
  anysphere: "cursor.com",
  notion: "notion.so",
  twitch: "twitch.tv",
  "scale ai": "scale.com",
  "thinking machines": "thinkingmachines.ai",
  "thinking machines lab": "thinkingmachines.ai",
  "hudson river trading": "hudson-trading.com",
  "imc trading": "imc.com",
  "squarepoint capital": "squarepoint-capital.com",
  "jump trading": "jumptrading.com",
  "london stock exchange group (lseg)": "lseg.com",
  "london stock exchange group": "lseg.com",
  lseg: "lseg.com",
  "collins aerospace": "collinsaerospace.com",
  "u.s. bank": "usbank.com",
  "us bank": "usbank.com",
  rtx: "rtx.com",
  "the boeing company": "boeing.com",
  boeing: "boeing.com",
  "wealthsimple technologies": "wealthsimple.com",
  "cognition ai": "cognition.ai",
  cognition: "cognition.ai",
  "together ai": "together.ai",
  "harvey ai": "harvey.ai",
  harvey: "harvey.ai",
  sierra: "sierra.ai",
  mercor: "mercor.com",
  loveable: "lovable.dev",
  lovable: "lovable.dev",
  granola: "granola.ai",
  perplexity: "perplexity.ai",
  "perplexity ai": "perplexity.ai",
};

// TLDs we accept when a company name already looks like a bare domain (e.g.
// "Credal.ai", "Lovable.dev"). Kept tight so a normal name with a dot in it
// (an initial, "St. Louis") doesn't get mistaken for a domain.
const DOMAIN_LIKE_TLDS = new Set([
  "ai",
  "io",
  "dev",
  "com",
  "co",
  "so",
  "app",
  "net",
  "org",
  "xyz",
  "gg",
  "tv",
]);

// Legal/entity words stripped from the tail (and "the" from the head) before
// slugifying, so "The Boeing Company" → "boeing". Deliberately conservative:
// words like "trading" or "capital" are part of real domains and are kept.
const ENTITY_WORDS = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "company",
  "plc",
]);

export function companyDomain(company: string | null | undefined): string | null {
  if (!company) return null;
  const key = company.trim().toLowerCase();
  if (!key) return null;
  if (DOMAIN_OVERRIDES[key]) return DOMAIN_OVERRIDES[key];

  // A name that already looks like a domain (common for AI startups, e.g.
  // "Credal.ai", "Lovable.dev", "Booking.com") is its own best answer.
  if (/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(key)) {
    const tld = key.slice(key.lastIndexOf(".") + 1);
    if (DOMAIN_LIKE_TLDS.has(tld)) return key;
  }

  // Drop parenthetical asides, e.g. "London Stock Exchange Group (LSEG)".
  const withoutParens = key.replace(/\([^)]*\)/g, " ");

  let words = withoutParens
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((w) => !ENTITY_WORDS.has(w));
  if (words[0] === "the" && words.length > 1) words = words.slice(1);

  const slug = words.join("");
  if (!slug) return null;
  return `${slug}.com`;
}

// The icon service we proxy. DuckDuckGo returns a real favicon for known domains
// and an HTTP 404 for unknown ones. We can't rely on that 404 in the browser
// though: its body is still a decodable placeholder image, so an <img> renders it
// happily and onError never fires. The /api/logo proxy inspects the real status
// server-side and returns a true 404, which lets the client fall back to a
// monogram. (Clearbit is defunct; Google returns a generic globe.)
export function duckDuckGoIconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

// The URL the CompanyLogo <img> points at: our own proxy, so a genuinely missing
// logo produces an onError → monogram instead of DuckDuckGo's placeholder icon.
export function companyLogoUrl(company: string | null | undefined): string | null {
  if (!companyDomain(company)) return null;
  return `/api/logo?company=${encodeURIComponent(company!.trim())}`;
}

// 1–2 letter monogram for the fallback avatar.
export function companyInitials(company: string | null | undefined): string {
  if (!company) return "?";
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
