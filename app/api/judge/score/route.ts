import type { NextRequest } from "next/server";
import {
  getJudgeRunProgress,
  JudgeRunInProgressError,
  runJudgeScoring,
  ExternalJudgeProviderError,
} from "@/lib/judge/server";
import {
  json,
  errorResponse,
  isSameOriginRequest,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return json(getJudgeRunProgress());
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return errorResponse("same-origin request required", 403);
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const result = await runJudgeScoring({
      onlyUnscored: body.onlyUnscored === true,
      country: typeof body.country === "string" && body.country.trim() ? body.country.trim() : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      force: body.force === true,
    });
    return json(result);
  } catch (e) {
    return errorResponse(
      e,
      e instanceof JudgeRunInProgressError
        ? 409
        : e instanceof ExternalJudgeProviderError
          ? 502
          : 500,
    );
  }
}
