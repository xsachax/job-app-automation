import { createHash } from "node:crypto";
import type { AtsType, NormalizedJob } from "./types";

// Detect the ATS platform from an apply URL hostname.
export function detectAts(url: string): AtsType {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host.includes("greenhouse.io") || host.includes("grnh.se")) return "greenhouse";
  if (host.includes("lever.co")) return "lever";
  if (host.includes("ashbyhq.com")) return "ashby";
  if (host.includes("myworkdayjobs.com") || host.includes("workday")) return "workday";
  if (host.includes("icims.com")) return "icims";
  if (host.includes("workable.com")) return "workable";
  if (host.includes("teamtailor.com")) return "teamtailor";
  return "unknown";
}

const TRACKING_QUERY_PARAMS = new Set([
  "bga",
  "gh_src",
  "height",
  "iis",
  "iisn",
  "jan1offset",
  "jun1offset",
  "mobile",
  "needsredirect",
  "ref",
  "referrer",
  "source",
  "src",
  "width",
]);

function isTrackingQueryParam(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(normalized);
}

// Strip tracking params + fragments while preserving parameters that identify a job.
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const name of [...u.searchParams.keys()]) {
      if (isTrackingQueryParam(name)) u.searchParams.delete(name);
    }
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url.trim();
  }
}

// Lowercase, strip accents/punctuation, collapse whitespace.
function slug(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Drop seniority markers + roman numerals so reposts collapse in the fuzzy fingerprint.
function normalizeTitle(title: string): string {
  return slug(title)
    .replace(/\b(senior|sr|junior|jr|staff|principal|lead|i{1,3}|iv|vi{0,3}|ix|x)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Pull a stable external id out of an apply URL when the source didn't provide one.
export function extractExternalId(
  atsType: AtsType,
  applyUrl: string,
  provided?: string | null,
): string | null {
  if (atsType === "icims") {
    try {
      const match = new URL(applyUrl).pathname.match(/\/jobs\/(\d+)\b/i);
      if (match) return match[1];
    } catch {
      // Fall through to a source-provided ID when the URL is malformed.
    }
  }
  if (provided != null && String(provided).length > 0) return String(provided);
  let path = "";
  try {
    path = new URL(applyUrl).pathname;
  } catch {
    return null;
  }
  if (atsType === "greenhouse") {
    const m = path.match(/jobs\/(\d+)/);
    if (m) return m[1];
  }
  if (atsType === "lever" || atsType === "ashby") {
    const m = path.match(UUID_RE);
    if (m) return m[1];
  }
  if (atsType === "icims") {
    const m = path.match(/\/jobs\/(\d+)\b/i);
    if (m) return m[1];
  }
  return null;
}

export interface Canonical {
  dedupeKey: string; // atsType:externalId when possible, else the fingerprint
  atsType: AtsType;
  externalId: string | null;
  applyUrl: string;
  fingerprint: string; // fp:<hash of company|title|location>
}

// Compute the canonical identity used for dedup + the fuzzy repost guard.
export function canonicalize(n: NormalizedJob): Canonical {
  const applyUrl = normalizeUrl(n.applyUrl);
  const atsType = n.atsType ?? detectAts(applyUrl);
  const externalId = extractExternalId(atsType, applyUrl, n.externalId ?? null);
  const fpHash = createHash("sha1")
    .update([slug(n.company), normalizeTitle(n.title), slug(n.location || "")].join("|"))
    .digest("hex");
  const fingerprint = `fp:${fpHash}`;
  const dedupeKey =
    atsType !== "unknown" && externalId ? `${atsType}:${externalId}` : fingerprint;
  return { dedupeKey, atsType, externalId, applyUrl, fingerprint };
}
