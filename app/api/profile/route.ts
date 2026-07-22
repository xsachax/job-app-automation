import type { NextRequest } from "next/server";
import { getProfile, saveProfile } from "@/lib/settings";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getProfile());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const saved = await saveProfile(body ?? {});
    return json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  return PUT(req);
}
