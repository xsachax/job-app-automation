// Location normalization for the location tier list + judge location axis.
//
// Discovery locations are extremely messy: "San Francisco", "San Francisco, CA",
// "San Francisco | San Francisco, California, United States", "United States,
// Washington, Redmond", "Remote in USA", etc. To rank locations and match a job
// against a ranked location, every raw string is collapsed to a single canonical
// form — "City, ST" | "Remote" | null — so obvious variants of the same place
// share one bucket. The same function normalizes both the tier keys and each
// job's location so exact-string matching lines up (mirrors normalizeCompanyKey).

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "washington dc": "DC", "washington, d.c.": "DC",
};

const CA_PROVINCES: Record<string, string> = {
  ontario: "ON", quebec: "QC", "québec": "QC", "british columbia": "BC",
  alberta: "AB", manitoba: "MB", saskatchewan: "SK", "nova scotia": "NS",
  "new brunswick": "NB", "newfoundland and labrador": "NL",
  "prince edward island": "PE", "northwest territories": "NT",
  nunavut: "NU", yukon: "YT",
};

// District of Columbia tokens; matched before the state loop so "Washington, DC"
// is read as the city Washington in DC, not the state Washington (WA).
const DC_TOKENS = new Set(["dc", "d.c.", "d.c", "district of columbia", "washington dc"]);

const STATE_CODES = new Set([
  ...Object.values(US_STATES),
  ...Object.values(CA_PROVINCES),
]);

// Cities that commonly appear WITHOUT a state; inferred to their region so
// "San Francisco" and "San Francisco, CA" collapse to one bucket.
const CITY_STATE: Record<string, string> = {
  "san francisco": "CA", sf: "CA", "san jose": "CA", "palo alto": "CA",
  "mountain view": "CA", sunnyvale: "CA", "san diego": "CA", "los angeles": "CA",
  la: "CA", "santa clara": "CA", "san mateo": "CA", fremont: "CA",
  cupertino: "CA", oakland: "CA", "menlo park": "CA", berkeley: "CA",
  irvine: "CA", pasadena: "CA", burlingame: "CA", "redwood city": "CA",
  "culver city": "CA", "santa monica": "CA", "west athens": "CA", "el segundo": "CA",
  "new york": "NY", "new york city": "NY", nyc: "NY", ny: "NY", manhattan: "NY", brooklyn: "NY",
  seattle: "WA", redmond: "WA", bellevue: "WA", kirkland: "WA",
  chicago: "IL", austin: "TX", dallas: "TX", houston: "TX", bastrop: "TX",
  brownsville: "TX", starbase: "TX", boston: "MA", cambridge: "MA",
  denver: "CO", boulder: "CO", atlanta: "GA", miami: "FL", portland: "OR",
  phoenix: "AZ", tempe: "AZ", scottsdale: "AZ", pittsburgh: "PA",
  philadelphia: "PA", nashville: "TN", "salt lake city": "UT", detroit: "MI",
  "ann arbor": "MI", minneapolis: "MN", raleigh: "NC", durham: "NC",
  charlotte: "NC", toronto: "ON", ottawa: "ON", waterloo: "ON", montreal: "QC",
  vancouver: "BC", calgary: "AB", edmonton: "AB",
};

// Abbreviations / nicknames rewritten to a single canonical city name so
// "NYC", "NY, NY", and "New York City" all land on "New York".
const CITY_ALIAS: Record<string, string> = {
  nyc: "New York", ny: "New York", "new york city": "New York",
  manhattan: "New York", brooklyn: "New York", sf: "San Francisco", la: "Los Angeles",
};

const COUNTRY_TOKENS = new Set([
  "united states", "usa", "us", "u.s.", "u.s.a.", "america",
  "united states of america",
  "canada", "can", "ca canada", "remote", "onsite", "hybrid",
  "multiple locations", "various", "various locations", "flexible",
  "north america", "worldwide", "global", "anywhere",
]);

// Phrases that join two or more countries ("USA or Canada") are not a place.
const MULTI_COUNTRY = /\b(usa?|united states|canada|north america|emea|apac|europe)\b.*(?:\bor\b|\band\b|&|\/).*\b(usa?|united states|canada|europe|apac|emea|remote)\b/i;

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Prefer a canonical alias ("nyc" -> "New York") over raw title-casing.
function cityName(raw: string): string {
  return CITY_ALIAS[raw.trim().toLowerCase()] ?? titleCase(raw.trim());
}

function regionForCity(raw: string): string | null {
  return CITY_STATE[raw.trim().toLowerCase()] ?? null;
}

function isRegionName(low: string, code: string): boolean {
  return STATE_CODES.has(code) || Boolean(US_STATES[low]) || Boolean(CA_PROVINCES[low]);
}

// Strip parentheticals, "HQ", leading "Company - " prefixes, and surrounding junk.
function cleanSegment(seg: string): string {
  return seg
    .replace(/\([^)]*\)/g, " ") // (HQ), (Remote), ...
    .replace(/\b(hq|headquarters)\b/gi, " ")
    .replace(/^[^-]*\bHQ\b\s*-\s*/i, "") // "Nuro HQ - Mountain View, CA"
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse a raw posting location to a canonical "City, ST" / "Remote" / null.
 */
export function normalizeLocation(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Many strings are "A | A, United States" duplicates or multi-city lists;
  // take the first segment (split on | or ;), which is usually the cleanest place.
  const first = raw.split(/[|;]/)[0] ?? raw;
  const seg = cleanSegment(first);
  if (!seg) return null;

  // Remote is a flag, not a place. Strip remote/onsite/hybrid/"in" filler and
  // dashes from every comma part; if nothing but a country is left, it's Remote.
  const remoteFlag = /\bremote/i.test(seg);
  const parts = seg
    .split(",")
    .map((p) =>
      p
        .replace(/\b(remote(ly)?|onsite|hybrid|in)\b/gi, " ")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((p) => p && !COUNTRY_TOKENS.has(p.toLowerCase()) && !MULTI_COUNTRY.test(p));
  if (parts.length === 0) return remoteFlag ? "Remote" : null;

  // District of Columbia: "Washington, DC" / "DC" -> city Washington in DC,
  // handled before the state loop so "Washington" isn't read as the state WA.
  const dcIdx = parts.findIndex((p) => DC_TOKENS.has(p.toLowerCase()));
  if (dcIdx >= 0 || parts.every((p) => p.toLowerCase() === "washington")) {
    return "Washington, DC";
  }

  // A single part is a city unless it's purely a region name.
  if (parts.length === 1) {
    const only = parts[0];
    const low = only.toLowerCase();
    const reg = regionForCity(only);
    if (reg) return `${cityName(only)}, ${reg}`;
    if (isRegionName(low, only.toUpperCase())) return null; // state/province only — too vague
    return cityName(only);
  }

  // Find a region (state/province) among the parts, by code or full name.
  let region: string | null = null;
  let regionIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const low = parts[i].toLowerCase();
    const code = parts[i].toUpperCase();
    if (STATE_CODES.has(code)) {
      region = code;
      regionIdx = i;
      break;
    }
    if (US_STATES[low]) {
      region = US_STATES[low];
      regionIdx = i;
      break;
    }
    if (CA_PROVINCES[low]) {
      region = CA_PROVINCES[low];
      regionIdx = i;
      break;
    }
  }

  // City = the most specific non-region part. When parts are ordered
  // country→region→city (e.g. "United States, Washington, Redmond"), the city is
  // the last part; otherwise it's the first remaining part.
  let city: string | null = null;
  if (regionIdx >= 0) {
    const candidates = parts.filter((_, i) => i !== regionIdx);
    city = candidates.length ? candidates[candidates.length - 1] : null;
  } else {
    city = parts[0];
  }
  if (!city) return null;

  if (!region) region = regionForCity(city);
  return region ? `${cityName(city)}, ${region}` : cityName(city);
}

// Case-insensitive key for matching a job's canonical location against a ranked
// location (mirrors normalizeCompanyKey).
export function normalizeLocationKey(canonical: string): string {
  return canonical.trim().toLowerCase();
}
