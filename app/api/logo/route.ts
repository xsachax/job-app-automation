import { companyDomain, duckDuckGoIconUrl, googleIconUrl } from "@/lib/companyDomain";

export const runtime = "nodejs";

// Byte lengths of the known "no real icon" placeholders each upstream serves.
// DuckDuckGo returns a decodable placeholder icon (this exact length) with its
// 404s, and sometimes an empty 200. Google's favicon service returns a fixed
// generic-globe PNG (this length at sz=64) for domains it doesn't recognize.
// Matching on length lets us treat these as "missing" so the card falls back to
// a monogram instead of rendering a meaningless placeholder.
const DDG_PLACEHOLDER_BYTES = 1478;
const GOOGLE_GLOBE_BYTES = 726;

// One day; a company's favicon changes rarely and the monogram fallback covers
// any gap. Cached at the edge and in the browser so repeat companies are free.
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

type Icon = { body: ArrayBuffer; contentType: string };
const cache = new Map<string, Icon | null>();

function notFound(): Response {
  return new Response(null, { status: 404 });
}

// Fetch one icon source and reject the known placeholder byte lengths. Returns
// null for any miss (bad status, empty body, placeholder, or network error) so
// the caller can try the next source.
async function fetchIcon(url: string, placeholderBytes: number[]): Promise<Icon | null> {
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) return null;
    const body = await upstream.arrayBuffer();
    if (body.byteLength === 0 || placeholderBytes.includes(body.byteLength)) return null;
    const contentType = upstream.headers.get("content-type") ?? "image/x-icon";
    return { body, contentType };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const company = new URL(request.url).searchParams.get("company");
  const domain = companyDomain(company);
  if (!domain) return notFound();

  if (cache.has(domain)) {
    const hit = cache.get(domain)!;
    return hit
      ? new Response(hit.body, {
          headers: { "Content-Type": hit.contentType, "Cache-Control": CACHE_CONTROL },
        })
      : notFound();
  }

  // DuckDuckGo first (higher-resolution icons when present), then Google as a
  // fallback for the domains DDG blanks on (e.g. adobe.com).
  const icon =
    (await fetchIcon(duckDuckGoIconUrl(domain), [DDG_PLACEHOLDER_BYTES])) ??
    (await fetchIcon(googleIconUrl(domain), [GOOGLE_GLOBE_BYTES]));

  cache.set(domain, icon);
  if (!icon) return notFound();
  return new Response(icon.body, {
    headers: { "Content-Type": icon.contentType, "Cache-Control": CACHE_CONTROL },
  });
}
