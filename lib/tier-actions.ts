import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, isSameOriginRequest, json } from "./http";
import { replaceTierList, TierListConflictError } from "./tier-store";
import type { TierListKind } from "./tiers";

const actionSchema = z.object({
  action: z.enum(["import-community", "clear"]),
  editVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function handleTierListAction(req: NextRequest, kind: TierListKind) {
  if (!isSameOriginRequest(req)) {
    return errorResponse("same-origin request required", 403);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("valid action and editVersion are required", 400);
  }
  try {
    return json(
      await replaceTierList(kind, parsed.data.action, parsed.data.editVersion),
    );
  } catch (error) {
    return errorResponse(error, error instanceof TierListConflictError ? 409 : 500);
  }
}
