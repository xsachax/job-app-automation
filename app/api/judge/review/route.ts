import type { NextRequest } from "next/server";
import { buildJudgeBatch } from "@/lib/judge/agent";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const topN = Number(searchParams.get("topN") ?? searchParams.get("limit")) || undefined;
    const country = searchParams.get("country") || undefined;
    const batch = await buildJudgeBatch({ topN, country });
    return json(batch);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
