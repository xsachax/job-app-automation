import type { NextRequest } from "next/server";
import {
  getJudgeProviderPublicSettings,
  JudgeProviderSettingsValidationError,
  saveJudgeProviderSettings,
} from "@/lib/judge/server";
import { errorResponse, isSameOriginRequest, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getJudgeProviderPublicSettings());
  } catch {
    return errorResponse("Unable to load Judge provider settings.", 500);
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("same-origin request required", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  try {
    return json(await saveJudgeProviderSettings(body));
  } catch (error) {
    if (error instanceof JudgeProviderSettingsValidationError) {
      return errorResponse(error, 400);
    }
    return errorResponse("Unable to save Judge provider settings.", 500);
  }
}
