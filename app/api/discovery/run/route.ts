import type { NextRequest } from "next/server";
import {
  DiscoveryRefreshInProgressError,
  runDiscoveryRefresh,
} from "@/lib/discovery/refresh";
import { errorResponse, isSameOriginRequest, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("same-origin request required", 403);
  }

  try {
    return json(await runDiscoveryRefresh());
  } catch (error) {
    return errorResponse(
      error,
      error instanceof DiscoveryRefreshInProgressError ? 409 : 500,
    );
  }
}
