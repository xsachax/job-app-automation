import { companyDomain, duckDuckGoIconUrl } from "@/lib/companyDomain";

export const runtime = "nodejs";

// DuckDuckGo serves a decodable placeholder icon (this exact byte length) with
// its 404s. Guard against it in the rare case it's ever returned with a 200 so a
// placeholder never reaches a card.
const DDG_PLACEHOLDER_BYTES = 1478;

// One day; a company's favicon changes rarely and the monogram fallback covers
// any gap. Cached at the edge and in the browser so repeat companies are free.
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

type CacheEntry = { body: ArrayBuffer; contentType: string } | null;
const cache = new Map<string, CacheEntry>();

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  const company = new URL(request.url).searchParams.get("company");
  const domain = companyDomain(company);
  if (!domain) return notFound();

  if (cache.has(domain)) {
    const hit = cache.get(domain)!;
    if (!hit) return notFound();
    return new Response(hit.body, {
      headers: { "Content-Type": hit.contentType, "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const upstream = await fetch(duckDuckGoIconUrl(domain), {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(5000),
    });

    if (!upstream.ok) {
      cache.set(domain, null);
      return notFound();
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength === DDG_PLACEHOLDER_BYTES) {
      cache.set(domain, null);
      return notFound();
    }

    const contentType = upstream.headers.get("content-type") ?? "image/x-icon";
    cache.set(domain, { body, contentType });
    return new Response(body, {
      headers: { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL },
    });
  } catch {
    // Network error/timeout: don't poison the cache, just fall back this time.
    return notFound();
  }
}
