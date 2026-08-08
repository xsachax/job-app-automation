export type AvailabilityStatus = "available" | "unavailable" | "unknown";

export type DetectorReason =
  | "actionable_apply_link"
  | "ambiguous_apply_control"
  | "blocked_response"
  | "disabled_apply_control"
  | "malformed_response"
  | "missing_page_markers"
  | "no_apply_control"
  | "unexpected_job_page";

export interface DetectionResult {
  status: AvailabilityStatus;
  reason: DetectorReason;
  actionUrl?: string;
}

interface ParsedTag {
  name: string;
  attributes: Map<string, string | null>;
  inert: boolean;
}

interface ParsedStartTag {
  name: string;
  attributes: Map<string, string | null>;
}

interface ElementFrame {
  name: string;
  inert: boolean;
}

const GOOGLE_CAREERS_ORIGIN = "https://www.google.com";
const GOOGLE_CAREERS_BASE_PATH = "/about/careers/applications/";
const GOOGLE_CAREERS_APPLY_PATH = "/about/careers/applications/apply";
const APPLY_CONTROL_ID = "apply-action-button";
const JOB_PATH_PATTERN =
  /^\/about\/careers\/applications\/jobs\/results\/(\d+)(?:-[^/?#]+)?\/?$/;
const HTML_TOKEN_PATTERN =
  /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][a-z0-9:-]*\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE_PATTERN =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const RELEVANT_TAGS = new Set(["a", "base", "button", "link"]);
const INERT_CONTAINERS = new Set(["noscript", "script", "style", "template"]);
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const BLOCK_MARKERS = [
  "before you continue to google",
  "our systems have detected unusual traffic",
  "automated queries",
  "captcha",
  "consent.google",
  "/sorry/",
];

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseStartTag(source: string): ParsedStartTag | null {
  const nameMatch = /^<([a-z][a-z0-9:-]*)\b/i.exec(source);
  if (!nameMatch) return null;

  const attributes = new Map<string, string | null>();
  const attributeSource = source.slice(nameMatch[0].length, -1);
  for (const match of attributeSource.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4];
    attributes.set(name, rawValue === undefined ? null : decodeAttribute(rawValue));
  }

  return { name: nameMatch[1].toLowerCase(), attributes };
}

function hasHiddenInlineStyle(
  attributes: Map<string, string | null>,
): boolean {
  const style = attributes.get("style");
  return Boolean(
    style &&
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/i.test(
        style,
      ),
  );
}

function isInertElement(tag: ParsedStartTag): boolean {
  return (
    INERT_CONTAINERS.has(tag.name) ||
    tag.attributes.has("hidden") ||
    tag.attributes.has("inert") ||
    tag.attributes.get("aria-hidden")?.toLowerCase() === "true" ||
    hasHiddenInlineStyle(tag.attributes)
  );
}

function collectTags(html: string): ParsedTag[] {
  const tags: ParsedTag[] = [];
  const stack: ElementFrame[] = [];

  for (const match of html.matchAll(HTML_TOKEN_PATTERN)) {
    const source = match[0];
    if (source.startsWith("<!")) continue;

    const closingMatch = /^<\/([a-z][a-z0-9:-]*)/i.exec(source);
    if (closingMatch) {
      const closingName = closingMatch[1].toLowerCase();
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === closingName) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const parsed = parseStartTag(source);
    if (!parsed) continue;

    const ancestorInert = stack.at(-1)?.inert ?? false;
    const inert = ancestorInert || isInertElement(parsed);
    if (RELEVANT_TAGS.has(parsed.name)) {
      tags.push({ ...parsed, inert });
    }

    const selfClosing = /\/\s*>$/.test(source);
    if (!selfClosing && !VOID_ELEMENTS.has(parsed.name)) {
      stack.push({ name: parsed.name, inert });
    }
  }

  return tags;
}

function parseUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

export function getGoogleCareersJobId(value: string): string | null {
  const url = parseUrl(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.hostname !== "www.google.com" ||
    url.port ||
    url.username ||
    url.password
  ) {
    return null;
  }

  return JOB_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
}

function isExpectedJobUrl(value: string, expectedJobId: string): boolean {
  return getGoogleCareersJobId(value) === expectedJobId;
}

function isExpectedBaseUrl(url: URL): boolean {
  return (
    url.origin === GOOGLE_CAREERS_ORIGIN &&
    url.pathname === GOOGLE_CAREERS_BASE_PATH &&
    !url.search &&
    !url.hash
  );
}

function isApplyUrl(url: URL): boolean {
  return (
    url.origin === GOOGLE_CAREERS_ORIGIN &&
    url.pathname === GOOGLE_CAREERS_APPLY_PATH &&
    !url.hash &&
    Boolean(url.searchParams.get("jobId")?.trim())
  );
}

function isDisabled(tag: ParsedTag): boolean {
  return (
    tag.inert ||
    tag.attributes.has("disabled") ||
    tag.attributes.has("hidden") ||
    tag.attributes.has("inert") ||
    tag.attributes.get("aria-disabled")?.toLowerCase() === "true" ||
    tag.attributes.get("aria-hidden")?.toLowerCase() === "true"
  );
}

export function detectApplyAvailability(
  html: string,
  requestedUrl: string,
  responseUrl: string,
): DetectionResult {
  const requestedJobId = getGoogleCareersJobId(requestedUrl);
  if (!requestedJobId || !isExpectedJobUrl(responseUrl, requestedJobId)) {
    return { status: "unknown", reason: "unexpected_job_page" };
  }

  const lowerHtml = html.toLowerCase();
  if (BLOCK_MARKERS.some((marker) => lowerHtml.includes(marker))) {
    return { status: "unknown", reason: "blocked_response" };
  }

  if (
    !/<!doctype\s+html\b/i.test(html) ||
    !/<html\b/i.test(html) ||
    !/<\/html\s*>/i.test(html)
  ) {
    return { status: "unknown", reason: "malformed_response" };
  }

  const tags = collectTags(html);
  const baseTags = tags.filter((tag) => tag.name === "base" && !tag.inert);
  const canonicalTags = tags.filter((tag) => {
    if (tag.name !== "link" || tag.inert) return false;
    return (
      tag.attributes
        .get("rel")
        ?.toLowerCase()
        .split(/\s+/)
        .includes("canonical") ?? false
    );
  });

  if (baseTags.length !== 1 || canonicalTags.length !== 1) {
    return { status: "unknown", reason: "missing_page_markers" };
  }

  const baseHref = baseTags[0].attributes.get("href");
  const canonicalHref = canonicalTags[0].attributes.get("href");
  if (!baseHref || !canonicalHref) {
    return { status: "unknown", reason: "missing_page_markers" };
  }

  const baseUrl = parseUrl(baseHref, responseUrl);
  const canonicalUrl = parseUrl(canonicalHref, responseUrl);
  if (
    !baseUrl ||
    !canonicalUrl ||
    !isExpectedBaseUrl(baseUrl) ||
    !isExpectedJobUrl(canonicalUrl.href, requestedJobId)
  ) {
    return { status: "unknown", reason: "unexpected_job_page" };
  }

  let sawDisabledControl = false;
  let sawAmbiguousControl = false;

  for (const tag of tags) {
    const isNamedApplyControl =
      tag.attributes.get("id")?.toLowerCase() === APPLY_CONTROL_ID;

    if (tag.name === "button" && isNamedApplyControl) {
      sawAmbiguousControl = true;
      continue;
    }

    if (tag.name !== "a") continue;

    const href = tag.attributes.get("href");
    const resolvedHref = href ? parseUrl(href, baseUrl.href) : null;
    const pointsToApply = Boolean(resolvedHref && isApplyUrl(resolvedHref));

    if (pointsToApply && !isNamedApplyControl) {
      sawAmbiguousControl = true;
      continue;
    }

    if (!isNamedApplyControl) continue;
    if (!resolvedHref || !pointsToApply) {
      sawAmbiguousControl = true;
      continue;
    }

    const ariaLabel = tag.attributes.get("aria-label")?.trim().toLowerCase();
    if (ariaLabel && ariaLabel !== "apply" && ariaLabel !== "apply now") {
      sawAmbiguousControl = true;
      continue;
    }

    if (isDisabled(tag)) {
      sawDisabledControl = true;
      continue;
    }

    return {
      status: "available",
      reason: "actionable_apply_link",
      actionUrl: resolvedHref.href,
    };
  }

  if (sawAmbiguousControl) {
    return { status: "unknown", reason: "ambiguous_apply_control" };
  }
  if (sawDisabledControl) {
    return { status: "unavailable", reason: "disabled_apply_control" };
  }
  return { status: "unavailable", reason: "no_apply_control" };
}
