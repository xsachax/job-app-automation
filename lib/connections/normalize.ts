// ---------------------------------------------------------------------------
// Company-name matching for LinkedIn connections
// ---------------------------------------------------------------------------
//
// LinkedIn's "Company" field is free text a member typed for their own job
// ("Jane Street Capital", "Amazon Web Services (AWS)", "Google LLC"), so it
// rarely equals our catalog name verbatim. `companyMatchKey` reduces both sides
// to a comparable key: lowercase, strip accents/punctuation, drop generic
// corporate + industry suffix words, then collapse whitespace. The same key is
// applied to a connection's employer and to a job's company, so a match is a
// plain key equality — cheap and order-independent.
//
// A small ALIASES map resolves the handful of cases suffix stripping can't
// (parent/brand vs. legal entity, acronyms) to the catalog's canonical key.

import { canonicalCompanyName } from "../company-names";

// Generic tokens dropped from a company name before comparison. Corporate
// suffixes plus a few finance/industry words that differ between a firm's
// colloquial and legal names (so "Jane Street" == "Jane Street Capital"). All
// applied symmetrically to both sides, so the only risk is two *different*
// firms colliding to one key — rare within a bounded job catalog, and we log
// unmatched employers so it stays tunable.
const STOP_WORDS = new Set([
  "the", "and",
  // corporate forms
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp",
  "corporation", "co", "company", "plc", "gmbh", "sa", "ag", "nv", "bv",
  "pty", "pvt", "srl", "spa",
  // generic descriptors
  "group", "holdings", "holding", "global", "international", "worldwide",
  "technologies", "technology", "tech", "labs", "laboratories",
  "solutions", "systems", "services", "software", "digital",
  // finance / trading descriptors
  "capital", "partners", "management", "securities", "trading", "ventures",
  "advisors", "asset", "investments", "investment", "fund", "funds",
]);

function stripAccents(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

// Canonical keys for employers whose LinkedIn spelling won't reduce to the
// catalog key via suffix stripping alone (parent brands, acronyms, rebrands).
// Keys here are already post-normalization (lowercased, suffixes stripped).
const ALIASES: Record<string, string> = {
  "amazon web": "amazon", // "Amazon Web Services (AWS)"
  aws: "amazon",
  facebook: "meta",
  instagram: "meta",
  "meta platforms": "meta",
  alphabet: "google",
  youtube: "google",
  hrt: "hudson river",
  anysphere: "cursor",
  "google deepmind": "deepmind",
};

// Reduce a raw company string to a comparison key. Returns "" for empty input.
export function companyMatchKey(raw: string | null | undefined): string {
  if (!raw) return "";
  // Drop parentheticals like "(AWS)" and collapse punctuation to spaces.
  const base = stripAccents(canonicalCompanyName(String(raw)))
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!base) return "";

  const tokens = base.split(/\s+/).filter((t) => t && !STOP_WORDS.has(t));
  // If stripping removed everything (e.g. "Capital Group"), fall back to the
  // raw alphanumerics so we still produce a stable, non-empty key.
  const key = (tokens.length ? tokens.join(" ") : base.replace(/\s+/g, " ")).trim();

  return ALIASES[key] ?? key;
}
