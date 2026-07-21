import type { NextRequest } from "next/server";
import { rejectMatch } from "@/lib/applications/service";
import { json, errorResponse } from "@/lib/http";

type Ctx = { params: Promise<{ jobId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { jobId } = await params;
    const outcome = await rejectMatch(jobId);
    return json(outcome);
  } catch (e) {
    return errorResponse(e);
  }
}
