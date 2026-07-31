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

  // Defense / aerospace primes and defense-tech. Their full legal names slugify
  // to the wrong host ("L3Harris Technologies" -> l3harristechnologies.com), so
  // pin the real corporate domain.
  "l3harris technologies": "l3harris.com",
  l3harris: "l3harris.com",
  "anduril industries": "anduril.com",
  anduril: "anduril.com",
  "general dynamics": "gd.com",
  "general dynamics information technology": "gdit.com",
  "general dynamics mission systems": "gdmissionsystems.com",
  "booz allen hamilton": "boozallen.com",
  "booz allen": "boozallen.com",
  "bae systems": "baesystems.com",
  "raytheon technologies": "rtx.com",
  raytheon: "rtx.com",
  "lockheed martin": "lockheedmartin.com",
  "northrop grumman": "northropgrumman.com",
  "huntington ingalls": "hii.com",
  "huntington ingalls industries": "hii.com",
  "sierra nevada corporation": "sncorp.com",
  "sierra space": "sierraspace.com",
  "shield ai": "shield.ai",
  "applied intuition": "appliedintuition.com",

  // --- Additional curated overrides (each verified to return a real favicon via
  // the DDG/Google icon probe, 2026-07). These are companies whose full legal
  // name slugified to a dead host, or that use a short brand domain or a
  // non-.com TLD. Ambiguous single-word names (Revel, N1) are intentionally
  // left to the monogram rather than risk a wrong company's logo. ---

  // Tech / AI startups (name != <slug>.com, or a .ai/.io/.dev/.co brand)
  elevenlabs: "elevenlabs.io",
  campfire: "meetcampfire.com",
  "bland ai": "bland.ai",
  "bot auto": "bot.auto",
  "invisible technologies": "invisible.co",
  "invisible technologies ai": "invisible.co",
  kong: "konghq.com",
  socket: "socket.dev",
  quadric: "quadric.io",
  "built technologies": "getbuilt.com",
  coalition: "coalitioninc.com",
  flashpoint: "flashpoint.io",
  eluvio: "eluv.io",
  feathery: "feathery.io",
  sentra: "sentra.io",
  strac: "strac.io",
  ploy: "ploy.io",
  porter: "porter.run",
  offdeal: "offdeal.io",
  taro: "jointaro.com",
  mem0: "mem0.ai",
  epsilon3: "epsilon3.io",
  "pattern data": "patterndata.ai",
  "sixtyfour (x25)": "sixtyfour.ai",
  youlearn: "youlearn.ai",
  "proximate technologies": "proximate.tech",

  // Semiconductors / hardware / industrials (short brand domains)
  "texas instruments": "ti.com",
  "cadence design systems": "cadence.com",
  "analog devices": "analog.com",
  "nxp semiconductors": "nxp.com",
  "microchip technology": "microchip.com",
  "keysight technologies": "keysight.com",
  "zebra technologies": "zebra.com",
  zebra: "zebra.com",
  "akamai technologies": "akamai.com",
  "illinois tool works": "itw.com",
  "steel dynamics": "sdi.com",
  "ford motor company": "ford.com",
  "smith+nephew": "smith-nephew.com",
  "zoll medical corporation": "zoll.com",
  "uber technologies, inc.": "uber.com",
  "qualcomm canada ulc": "qualcomm.com",
  "qualcomm innovation center, inc.": "qualcomm.com",
  "qualcomm technologies, inc.": "qualcomm.com",
  "lynx software technologies, inc.": "lynx.com",
  "alkami technology": "alkami.com",
  alkami: "alkami.com",
  "dat freight & analytics": "dat.com",
  "spot & tango": "spotandtango.com",
  infojini: "infojiniconsulting.com",
  isoftstone: "isoftstoneinc.com",
  "usm business systems": "usmsystems.com",
  "krg technologies": "krgtech.com",
  "ritchie bros.": "rbauction.com",
  "ensemble health partners": "ensemblehp.com",

  // Finance / trading / consulting (short brand or legal-name domains)
  "royal bank of canada": "rbc.com",
  "pnc financial services": "pnc.com",
  "truist bank": "truist.com",
  "ss&c": "ssctech.com",
  "renaissance technologies": "rentec.com",
  "qube research & technologies": "qube-rt.com",
  "balyasny asset management": "bam.com",
  "old mission": "oldmissioncapital.com",
  "aquatic capital management": "aquatic.com",
  "headlands tech holdings": "headlandstech.com",
  "cetera financial group": "cetera.com",
  "ima financial group": "imacorp.com",
  spiderrock: "spiderrock.net",
  "western & southern financial group": "westernsouthern.com",
  "blackhawk network holdings": "blackhawknetwork.com",
  "the brattle group": "brattle.com",
  "akuna capital university": "akunacapital.com",
  "robert bosch venture capital": "bosch.com",

  // Defense / aerospace / space / energy (additional to the block above)
  aerovironment: "avinc.com",
  "nightwing intelligence solutions": "nightwing.us",
  "katalyst space technologies": "katalystspace.com",
  leolabs: "leolabs.space",
  "schweitzer engineering laboratories": "selinc.com",
  "the nuclear company": "thenuclearcompany.com",
  "westinghouse electric company": "westinghouse.com",

  // Public sector / education / health
  wgu: "wgu.edu",
  "university of arkansas": "uark.edu",
  "cornell university": "cornell.edu",
  "the federal reserve system": "federalreserve.gov",
  "metropolitan transportation authority": "mta.info",
  "cincinnati children’s hospital and medical center": "cincinnatichildrens.org",
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

// The primary icon service we proxy. DuckDuckGo returns a real favicon for known
// domains and an HTTP 404 for unknown ones. We can't rely on that 404 in the
// browser though: its body is still a decodable placeholder image, so an <img>
// renders it happily and onError never fires. The /api/logo proxy inspects the
// real status server-side and returns a true 404, which lets the client fall
// back to a monogram. When DDG blanks on a valid domain the proxy retries via
// googleIconUrl() below. (Clearbit is defunct.)
export function duckDuckGoIconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

// Fallback icon source. DuckDuckGo occasionally serves an empty 200 or a tiny
// placeholder for a perfectly valid domain (e.g. adobe.com comes back 0 bytes),
// which would otherwise fall through to a monogram. Google's favicon service
// returns a real 64px icon for those. For a genuinely unknown domain it returns
// a fixed generic-globe PNG (a stable byte length the /api/logo proxy detects),
// so the monogram fallback still fires when there's truly no logo.
export function googleIconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
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
