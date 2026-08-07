import type { NextRequest } from "next/server";
import { getProfile, saveProfile } from "@/lib/settings";
import { json, errorResponse } from "@/lib/http";
import {
  PROFILE_FIELD_VERSIONS_KEY,
  parseProfileFieldVersions,
} from "@/lib/profile/versioning";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getProfile());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const fieldVersions = parseProfileFieldVersions(
      body?.[PROFILE_FIELD_VERSIONS_KEY],
    );
    if (body && typeof body === "object") {
      delete body[PROFILE_FIELD_VERSIONS_KEY];
    }
    const saved = await saveProfile(body ?? {}, { fieldVersions });
    return json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  return PUT(req);
}
