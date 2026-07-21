import type { NextRequest } from "next/server";
import { runSource } from "@/lib/sources/run";
import { json, errorResponse } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const result = await runSource(id);
    const status = result.error ? 502 : 200;
    return json(result, status);
  } catch (e) {
    return errorResponse(e);
  }
}
