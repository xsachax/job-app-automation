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

// Postal abbreviations that appear as ", CA" style tokens. "CA" (California) is
// included: Canadian locations are resolved FIRST (via city / province / "Canada"
// name / province abbrev), so by the time we test these US abbrevs a bare ", CA"
// is overwhelmingly California — the common case on US-centric job boards, which
// we were previously dropping.
const US_STATE_ABBR = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
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
    "systems engineer", "distributed systems", "cloud engineer", "search relevance",
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

export function isSoftwareRole(title: string, opts?: EntryLevelOptions): boolean {
  if (!title) return false;
  const extraInclude = kwRegex(opts?.extraRoleKeywords ?? []);
  const extraExclude = kwRegex(opts?.extraExcludeKeywords ?? []);
  if (extraExclude?.test(title)) return false;
  const extraHit = extraInclude?.test(title) ?? false;
  if (NON_SOFTWARE.test(title) && !/software|developer|\bswe\b|\bsde\b/i.test(title) && !extraHit) {
    return false;
  }
  return SOFTWARE_TITLE.test(title) || extraHit;
}

// Compile a list of user-supplied keywords into a case-insensitive alternation,
// escaping regex metacharacters. Returns null when the list is empty.
function kwRegex(words: string[]): RegExp | null {
  const parts = words
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
}

// ---------------------------------------------------------------------------
// Seniority / experience / degree filters
// ---------------------------------------------------------------------------

const EXPLICIT_SENIOR_TITLE = new RegExp(
  [
    "senior", "\\bsr\\.?\\b", "staff", "principal", "\\blead\\b", "manager",
    "director", "head of", "architect", "distinguished", "fellow", "vp\\b",
    "vice president",
  ].join("|"),
  "i",
);

const NUMERIC_LEVEL_TITLE = new RegExp(
  [
    "\\bii\\b", "\\biii\\b", "\\biv\\b", "\\bl[4-9]\\b", "\\bl1[0-9]\\b",
    "level [3-9]", "\\be[5-9]\\b", "\\s[2-9]\\b",
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

// Internship / co-op signals. Excluded by default (config.includeInternships).
const INTERN_TITLE = new RegExp(
  [
    "intern\\b", "internship", "co[ -]?op\\b", "\\bcoop\\b",
    "summer\\s+(analyst|20\\d\\d)", "working student", "\\btrainee\\b",
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

// Maximum years-of-experience a role may REQUIRE and still count as entry-level.
// The user wants entry-level roles OR roles with no YoE specified, now widened
// to also include anything asking for up to 2 years. So a posting qualifies on
// experience when the smallest minimum it states is <= 2 years (or it states
// none at all).
export const MAX_YEARS_EXPERIENCE = 2;

// Pulls every "<n> years" style requirement out of the text and returns the
// smallest minimum found (e.g. "3-5 years" -> 3, "2+ years" -> 2), or null when
// no YoE is mentioned. The leading number of each phrase is the minimum, so a
// role wanting "5+ years" reads as 5 while "0-2 years" reads as 0.
export function minRequiredYoE(text: string): number | null {
  const re = /(?:at least\s*|minimum(?:\s*of)?\s*|min\.?\s*)?(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(?:\d{1,2})?\s*(?:years?|yrs?)\b/gi;
  let min: number | null = null;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // Keep requirement words in the same sentence or list item as the year count.
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextLineBreak = text.indexOf("\n", end);
    const lineEnd = nextLineBreak < 0 ? text.length : nextLineBreak;
    const line = text.slice(lineStart, lineEnd);
    const relativeStart = start - lineStart;
    const relativeEnd = end - lineStart;
    const clauseStart =
      Math.max(
        line.lastIndexOf(".", relativeStart - 1),
        line.lastIndexOf(";", relativeStart - 1),
        line.lastIndexOf("!", relativeStart - 1),
        line.lastIndexOf("?", relativeStart - 1),
      ) + 1;
    const followingBoundaries = [".", ";", "!", "?"]
      .map((separator) => line.indexOf(separator, relativeEnd))
      .filter((index) => index >= 0);
    const clauseEnd = followingBoundaries.length
      ? Math.min(...followingBoundaries)
      : line.length;
    const previousLineEnd = Math.max(0, lineStart - 1);
    const previousLineStart = text.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previousLine = text.slice(previousLineStart, previousLineEnd).trim();
    const headingContext =
      /^(?:(?:minimum|basic|required|preferred) )?(?:qualifications?|requirements?|what you bring|you have):?$/i.test(
        previousLine,
      )
        ? previousLine
        : "";
    const context = `${headingContext} ${line.slice(clauseStart, clauseEnd)}`;
    const prefix = line.slice(clauseStart, relativeStart);
    const suffix = line.slice(relativeEnd, clauseEnd);
    const explicitLowerBound =
      /^(?:at least\s*|minimum(?:\s*of)?\s*|min\.?\s*)/i.test(m[0]);
    const workContext =
      /^\s+(?:of\s+(?!service|tenure)\w+|(?:in|with)\s+\w+|working|building|developing|designing|using|leading|managing)\b/i.test(
        suffix,
      );
    const requirementContext =
      /\b(?:experience|experienced|required|requires?|requirements?|qualifications?|minimum|must have|should have|you have|possess)\b/i.test(
        context,
      ) ||
      /\byears?\s+of\s+(?!service|tenure)\w+/i.test(`${m[0]}${suffix}`) ||
      explicitLowerBound ||
      workContext;
    const serviceContext =
      /^\s+of\s+(?:service|tenure)\b/i.test(suffix) ||
      (/\b(?:benefits?|equity awards?|sabbatical|vest(?:s|ed|ing)?|tenure|anniversary|service award)\b/i.test(
        context,
      ) &&
        !/\bexperience\b/i.test(context));
    const upperBound =
      /\b(?:up to|at most|no more than|less than|fewer than|maximum(?: of)?|under)\s*$/i.test(
        prefix,
      );
    if (!requirementContext || serviceContext || upperBound) continue;

    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 40) {
      min = min === null ? n : Math.min(min, n);
    }
  }
  return min;
}

// When a posting offers different experience paths by degree, use the
// bachelor's/undergraduate path. A lower Master's/PhD alternative must not make
// a role appear eligible for a bachelor's-level candidate.
function minBachelorPathYoE(text: string): number | null {
  const re =
    /(?:\bbachelor(?:'?s)?(?:\s+degree)?|\bundergraduate degree|\bb\.?\s*[sa]\.?(?:\s+degree)?(?=\s|[.,;:+/()\-]|$)|\bbsc(?:\s+degree)?(?=\s|[.,;:+/()\-]|$))[^.;\n]{0,160}?(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(?:\d{1,2}\+?)?\s*(?:years?|yrs?)\b/gi;
  let min: number | null = null;
  for (const match of text.matchAll(re)) {
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value >= 0 && value <= 40) {
      min = min === null ? value : Math.min(min, value);
    }
  }
  return min;
}

export function minRequiredBachelorYoE(text: string): number | null {
  return minBachelorPathYoE(text) ?? minRequiredYoE(text);
}

export interface EntryLevelInput {
  title: string;
  description?: string | null;
}

// Runtime-tunable knobs (see lib/discovery/config.ts). All optional; omitting
// any preserves the historical defaults (entry-level SWE, <=2 YoE, no advanced
// degree, no internships), so existing callers/tests are unaffected.
export interface EntryLevelOptions {
  maxYoE?: number;
  includeInternships?: boolean;
  excludeAdvancedDegree?: boolean;
  extraRoleKeywords?: string[];
  extraExcludeKeywords?: string[];
}

function resolveOptions(opts?: EntryLevelOptions) {
  return {
    maxYoE: opts?.maxYoE ?? MAX_YEARS_EXPERIENCE,
    includeInternships: opts?.includeInternships ?? false,
    excludeAdvancedDegree: opts?.excludeAdvancedDegree ?? true,
    extraRoleKeywords: opts?.extraRoleKeywords ?? [],
    extraExcludeKeywords: opts?.extraExcludeKeywords ?? [],
  };
}

export interface EntryLevelVerdict {
  isSoftware: boolean;
  isEntryLevel: boolean;
  isInternship: boolean;
  hasSeniorTitle: boolean;
  hasEntrySignal: boolean;
  requiresAdvancedDegree: boolean;
  hasHighYoE: boolean;
  minYearsExperience: number | null;
  reasons: string[];
}

// The core gate. A posting qualifies when it is a software role (per config)
// that is NOT clearly senior, does NOT require an advanced degree (when the
// config excludes those), is not an internship (unless allowed), and is either
// explicitly entry-level OR requires no more than the configured max years.
export function classifyEntryLevel(
  input: EntryLevelInput,
  opts?: EntryLevelOptions,
): EntryLevelVerdict {
  const o = resolveOptions(opts);
  const title = input.title ?? "";
  const desc = input.description ?? "";
  const blob = `${title}\n${desc}`;

  const isSoftware = isSoftwareRole(title, o);
  const isInternship = INTERN_TITLE.test(title);
  const hasExplicitSeniorTitle = EXPLICIT_SENIOR_TITLE.test(title);
  const hasNumericLevelTitle = NUMERIC_LEVEL_TITLE.test(title);
  const hasSeniorTitle = hasExplicitSeniorTitle || hasNumericLevelTitle;
  const hasEntrySignal = ENTRY_TITLE.test(title);
  const rawAdvanced = ADVANCED_DEGREE_REQUIRED.test(desc) && !BACHELOR_OK.test(desc);
  const blockAdvanced = o.excludeAdvancedDegree && rawAdvanced;
  const minYearsExperience = minRequiredBachelorYoE(blob);
  const hasHighYoE = minYearsExperience !== null && minYearsExperience > o.maxYoE;
  const numericLevelWithinCap =
    hasNumericLevelTitle &&
    !hasExplicitSeniorTitle &&
    minYearsExperience !== null &&
    !hasHighYoE;
  const blockedBySeniority = hasSeniorTitle && !hasEntrySignal && !numericLevelWithinCap;

  const reasons: string[] = [];
  if (!isSoftware) reasons.push("not a software role");
  if (isInternship && !o.includeInternships) reasons.push("internship / co-op");
  if (blockedBySeniority) reasons.push("senior/mid title");
  if (blockAdvanced) reasons.push("advanced degree required");
  if (hasHighYoE && !hasEntrySignal) reasons.push(`requires ${minYearsExperience}+ years`);

  const isEntryLevel =
    isSoftware &&
    !blockAdvanced &&
    (o.includeInternships || !isInternship) &&
    (hasEntrySignal || (!blockedBySeniority && !hasHighYoE));

  return {
    isSoftware,
    isEntryLevel,
    isInternship,
    hasSeniorTitle,
    hasEntrySignal,
    requiresAdvancedDegree: rawAdvanced,
    hasHighYoE,
    minYearsExperience,
    reasons,
  };
}
