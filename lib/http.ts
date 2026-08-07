import { NextResponse, type NextRequest } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  try {
    const origin = new URL(originHeader);
    const host = request.headers.get("host");
    if (!host) return origin.origin === request.nextUrl.origin;

    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      ?.trim();
    const protocol = forwardedProtocol || request.nextUrl.protocol.replace(/:$/, "");
    return (
      origin.host.toLowerCase() === host.trim().toLowerCase() &&
      origin.protocol === `${protocol.toLowerCase()}:`
    );
  } catch {
    return false;
  }
}
