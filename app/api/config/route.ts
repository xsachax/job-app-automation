import type { NextRequest } from "next/server";
import { DISCOVERY_SOURCES } from "@/lib/discovery/companies";
import {
  getDiscoveryConfig,
  saveDiscoveryConfig,
  type DiscoveryConfigData,
} from "@/lib/discovery/config";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const sources = Array.from(new Set(DISCOVERY_SOURCES.map((source) => source.name))).sort((a, b) =>
  a.localeCompare(b),
);

export async function GET() {
  return json({ config: await getDiscoveryConfig(), sources });
}

async function saveRequestConfig(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("JSON body must be an object", 400);
  }

  try {
    const saved = await saveDiscoveryConfig(body as Partial<DiscoveryConfigData>);
    return json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  return saveRequestConfig(req);
}

export async function POST(req: NextRequest) {
  return saveRequestConfig(req);
}
