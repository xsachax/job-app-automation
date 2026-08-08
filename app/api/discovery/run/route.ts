import type { NextRequest } from "next/server";
import {
  DiscoveryRefreshCooldownError,
  DiscoveryRefreshInProgressError,
  getDiscoveryRefreshProgress,
  runDiscoveryRefresh,
} from "@/lib/discovery/refresh";
import { errorResponse, isSameOriginRequest, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getDiscoveryRefreshProgress());
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("same-origin request required", 403);
  }

  try {
    return json(await runDiscoveryRefresh());
  } catch (error) {
    if (error instanceof DiscoveryRefreshCooldownError) {
      const response = errorResponse(error, 429);
      response.headers.set(
        "Retry-After",
        String(Math.max(1, Math.ceil(error.retryAfterMs / 1_000))),
      );
      return response;
    }
    return errorResponse(
      error,
      error instanceof DiscoveryRefreshInProgressError ? 409 : 500,
    );
  }
}
