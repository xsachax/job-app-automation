import type { NextRequest } from "next/server";
import { getCriteria, saveCriteria } from "@/lib/settings";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getCriteria());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const saved = await saveCriteria(body ?? {});
    return json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}
