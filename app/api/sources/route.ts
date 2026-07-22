import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAdapter } from "@/lib/sources/registry";
import { json, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sightings: true } } },
  });
  return json(sources);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const kind = String(body?.kind ?? "").trim();
    const config = body?.config ?? {};
    if (!name || !kind) return errorResponse("name and kind are required", 400);
    if (!getAdapter(kind)) return errorResponse(`unknown source kind: ${kind}`, 400);
    const source = await prisma.source.create({
      data: {
        name,
        kind,
        config: JSON.stringify(config),
        enabled: typeof body?.enabled === "boolean" ? body.enabled : true,
      },
    });
    return json(source, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
