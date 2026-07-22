import type { NextRequest } from "next/server";
import { scoreAllJobs } from "@/lib/judge/judge";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const result = await scoreAllJobs({
      onlyUnscored: body.onlyUnscored === true,
      country: typeof body.country === "string" && body.country.trim() ? body.country.trim() : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      force: body.force === true,
    });
    return json(result);
  } catch (e) {
    return errorResponse(e, 500);
  }
}
