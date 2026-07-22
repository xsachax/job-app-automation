import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { enabled?: boolean; name?: string; config?: string } = {};
    if (typeof body?.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body?.name === "string") data.name = body.name;
    if (body?.config !== undefined) data.config = JSON.stringify(body.config);
    const source = await prisma.source.update({ where: { id }, data });
    return json(source);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.source.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
