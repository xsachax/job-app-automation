import type { NextRequest } from "next/server";
import { buildReviewBatch } from "@/lib/matching/agent";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// The shortlist of jobs awaiting agent resume-review, plus the resume context.
// Handy for copying into a Copilot session, or for a future in-app review UI.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || undefined;
    const minScore = searchParams.get("min") != null ? Number(searchParams.get("min")) : undefined;
    const includeAgentScored = searchParams.get("all") === "1";
    const batch = await buildReviewBatch({ limit, minScore, includeAgentScored });
    return json(batch);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
