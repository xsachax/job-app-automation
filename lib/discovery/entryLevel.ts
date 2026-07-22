// Shared, deterministic classifiers for the discovery pipeline.
//
// The user only wants CURRENTLY-OPEN, ENTRY-LEVEL, software-related roles that
// are bachelor's-degree-or-below (no Masters/PhD *required*) and based in the
// US or Canada — kept as two separate lists.
//
// None of the company career APIs expose a clean "entry level + bachelor's"
// server-side filter, so we fetch a keyword-scoped result set per company and
// then apply these pure heuristics on top. Keeping them here (framework-free)
// means both the verifier script and the runtime scraper share one source of
// truth, and they're trivially unit-testable.

export type Country = "US" | "CA" | "OTHER";

// ---------------------------------------------------------------------------
// Country classification (US vs CA vs everything else)
// ---------------------------------------------------------------------------

const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
];

// Postal abbreviations that appear as ", CA" style tokens. NOTE: "CA" is
// deliberately excluded here because it collides with California — we resolve
// California via the full state name / city list instead.
const US_STATE_ABBR = [
  "AL", "AK", "AZ", "AR", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

const US_CITIES = [
  "san francisco", "new york", "seattle", "los angeles", "los gatos",
  "mountain view", "menlo park", "palo alto", "sunnyvale", "santa clara",
  "san jose", "cupertino", "bellevue", "redmond", "austin", "boston",
  "cambridge", "chicago", "denver", "boulder", "atlanta", "dallas", "houston",
  "san diego", "washington", "arlington", "pittsburgh", "portland",
  "salt lake city", "miami", "culver city", "santa monica", "sunnyvale",
];

const CA_PROVINCES = [
  "ontario", "quebec", "british columbia", "alberta", "manitoba",
  "saskatchewan", "nova scotia", "new brunswick", "newfoundland",
  "prince edward island",
];

const CA_PROVINCE_ABBR = ["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE"];

const CA_CITIES = [
  "toronto", "vancouver", "montreal", "montréal", "waterloo", "ottawa",
  "calgary", "edmonton", "kitchener", "mississauga", "burnaby", "gatineau",
  "victoria", "winnipeg", "halifax", "quebec city",
];

function hasWord(haystack: string, needles: string[]): boolean {
  return needles.some((n) => new RegExp(`(^|[^a-z])${n}([^a-z]|$)`, "i").test(haystack));
}

function hasAbbr(raw: string, abbrs: string[]): boolean {
  // Match ", NY" / " NY " / "NY," style tokens without lowercasing (abbrevs are upper-case).
  return abbrs.some((a) => new RegExp(`(^|[,\\s(])${a}([,\\s)]|$)`).test(raw));
}

export function classifyCountry(rawLocation: string | null | undefined): Country {
  if (!rawLocation) return "OTHER";
  const raw = rawLocation.trim();
  const loc = raw.toLowerCase();

  // Explicit country names first.
  const isCanadaName = /\bcanada\b/.test(loc);
  const isUsaName = /(\bunited states\b|\busa\b|\bus\b|\bu\.s\.a?\.?)/.test(loc);

  // Canada signals.
  if (
    isCanadaName ||
    hasWord(loc, CA_CITIES) ||
    hasWord(loc, CA_PROVINCES) ||
    hasAbbr(raw, CA_PROVINCE_ABBR)
  ) {
    // Guard: some strings contain both (e.g. remote North America) — prefer the
    // more specific city/province match, but if only the USA name is present
    // fall through to US below.
    if (!isUsaName || hasWord(loc, CA_CITIES) || hasWord(loc, CA_PROVINCES)) {
      return "CA";
    }
  }

  // US signals.
  if (
    isUsaName ||
    hasWord(loc, US_CITIES) ||
    hasWord(loc, US_STATES) ||
    hasAbbr(raw, US_STATE_ABBR)
  ) {
    return "US";
  }

  return "OTHER";
}

// ---------------------------------------------------------------------------
// Software-role classification
// ---------------------------------------------------------------------------

const SOFTWARE_TITLE = new RegExp(
  [
    "software", "\\bswe\\b", "\\bsde\\b", "developer", "programmer", "devops",
    "\\bsre\\b", "site reliability", "machine learning", "\\bml\\b",
    "\\bai\\b", "deep learning", "data engineer", "back[ -]?end", "front[ -]?end",
    "full[ -]?stack", "platform engineer", "infrastructure engineer",
    "systems engineer", "distributed systems", "cloud engineer",
    "mobile engineer", "\\bios\\b", "android", "web developer",
    "applied scientist", "research engineer", "research scientist",
    "compiler", "firmware", "embedded software",
  ].join("|"),
  "i",
);

// "engineer" words that are NOT software roles.
const NON_SOFTWARE = new RegExp(
  [
    "sales engineer", "solutions engineer", "solution engineer",
    "customer engineer", "support engineer", "field engineer",
    "network engineer", "hardware engineer", "mechanical", "electrical engineer",
    "manufacturing", "quality engineer", "biomedical", "chemical",
    "civil engineer", "industrial engineer", "optical", "\\brf\\b",
    "analog", "asic", "silicon", "validation engineer", "process engineer",
    "packaging", "thermal", "materials", "recruiter", "account ",
    "marketing", "designer", "\\bux\\b", "product manager", "program manager",
    "technical program", "data analyst", "business analyst", "accountant",
    "controller", "counsel", "attorney", "\\bhr\\b",
  ].join("|"),
  "i",
);

export function isSoftwareRole(title: string): boolean {
  if (!title) return false;
  if (NON_SOFTWARE.test(title) && !/software|developer|\bswe\b|\bsde\b/i.test(title)) {
    return false;
  }
  return SOFTWARE_TITLE.test(title);
}

// ---------------------------------------------------------------------------
// Seniority / experience / degree filters
// ---------------------------------------------------------------------------

const SENIOR_TITLE = new RegExp(
  [
    "senior", "\\bsr\\.?\\b", "staff", "principal", "\\blead\\b", "manager",
    "director", "head of", "architect", "distinguished", "fellow", "vp\\b",
    "vice president", "\\bii\\b", "\\biii\\b", "\\biv\\b", "\\bl[4-9]\\b",
    "\\bl1[0-9]\\b", "level [3-9]", "\\be[5-9]\\b", "\\s[2-9]\\b",
  ].join("|"),
  "i",
);

const ENTRY_TITLE = new RegExp(
  [
    "new ?grad", "university grad", "\\bgrad\\b", "entry[ -]?level", "junior",
    "\\bjr\\.?\\b", "early career", "early[ -]in[ -]career", "campus",
    "apprentice", "rotational", "associate", "\\bi\\b", "\\bl3\\b",
    "\\be3\\b", "\\b1\\b", "graduate program", "emerging talent",
  ].join("|"),
  "i",
);

// Advanced degree explicitly REQUIRED (not merely preferred / "or").
const ADVANCED_DEGREE_REQUIRED = new RegExp(
  [
    "ph\\.?d\\.? (is )?(required|degree required)",
    "requires? a ph\\.?d",
    "must have (a )?(ph\\.?d|master)",
    "master'?s degree (is )?required",
    "master'?s (is )?required",
    "requires? a master",
    "phd or equivalent required",
  ].join("|"),
  "i",
);

// Any wording that shows the role is happy with a bachelor's (or less).
const BACHELOR_OK = /(bachelor|\bb\.?s\.?\b|\bb\.?a\.?\b|undergraduate|associate'?s|high school|no degree|equivalent (practical )?experience|or equivalent)/i;

// High years-of-experience requirement (>= 3 years).
const HIGH_YOE = /(\b([3-9]|1[0-9])\s*\+?\s*(?:years|yrs)\b)|(\b([3-9]|1[0-9])\s*(?:-|to)\s*\d+\s*(?:years|yrs)\b)/i;

// Low / entry YoE ("0-2 years", "1+ years", "at least 1 year").
const LOW_YOE = /\b(0|1|2)\s*\+?\s*(?:-|to)?\s*\d*\s*(?:years|yrs)\b/i;

export interface EntryLevelInput {
  title: string;
  description?: string | null;
}

export interface EntryLevelVerdict {
  isSoftware: boolean;
  isEntryLevel: boolean;
  hasSeniorTitle: boolean;
  hasEntrySignal: boolean;
  requiresAdvancedDegree: boolean;
  hasHighYoE: boolean;
  reasons: string[];
}

// The core gate. A posting qualifies when it is a software role that is NOT
// clearly senior, does NOT require an advanced degree, and is either explicitly
// entry-level OR specifies no high years-of-experience requirement.
export function classifyEntryLevel(input: EntryLevelInput): EntryLevelVerdict {
  const title = input.title ?? "";
  const desc = input.description ?? "";
  const blob = `${title}\n${desc}`;

  const isSoftware = isSoftwareRole(title);
  const hasSeniorTitle = SENIOR_TITLE.test(title);
  const hasEntrySignal = ENTRY_TITLE.test(title);
  const requiresAdvancedDegree = ADVANCED_DEGREE_REQUIRED.test(desc) && !BACHELOR_OK.test(desc);
  const hasHighYoE = HIGH_YOE.test(blob) && !LOW_YOE.test(blob);

  const reasons: string[] = [];
  if (!isSoftware) reasons.push("not a software role");
  if (hasSeniorTitle && !hasEntrySignal) reasons.push("senior/mid title");
  if (requiresAdvancedDegree) reasons.push("advanced degree required");
  if (hasHighYoE && !hasEntrySignal) reasons.push("high YoE required");

  const isEntryLevel =
    isSoftware &&
    !requiresAdvancedDegree &&
    (hasEntrySignal || (!hasSeniorTitle && !hasHighYoE));

  return {
    isSoftware,
    isEntryLevel,
    hasSeniorTitle,
    hasEntrySignal,
    requiresAdvancedDegree,
    hasHighYoE,
    reasons,
  };
}
