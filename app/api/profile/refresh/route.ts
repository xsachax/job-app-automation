import type { NextRequest } from "next/server";
import { refreshProfile } from "@/lib/profile/refresh";
import { json, errorResponse } from "@/lib/http";

// "Refresh Profile": re-read the resume, parse it, and fill blank profile fields.
export async function POST(req: NextRequest) {
  try {
    let source: string | undefined;
    try {
      const body = await req.json();
      source = body?.source ? String(body.source) : undefined;
    } catch {
      // no body provided; use configured resumeSource
    }
    const result = await refreshProfile(source);
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
