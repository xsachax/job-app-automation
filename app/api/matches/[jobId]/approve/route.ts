import type { NextRequest } from "next/server";
import { approveAndSubmit } from "@/lib/applications/service";
import { json, errorResponse } from "@/lib/http";

type Ctx = { params: Promise<{ jobId: string }> };

// The human approval gate: confirm & send (DRY-RUN unless APPLY_MODE=live).
export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { jobId } = await params;
    const outcome = await approveAndSubmit(jobId);
    return json(outcome);
  } catch (e) {
    return errorResponse(e);
  }
}
