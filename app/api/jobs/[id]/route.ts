import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import { shapeJob } from "@/lib/jobs/shape";

export const dynamic = "force-dynamic";

// The user-facing pipeline states a discovered job can move through. This is a
// link-out flow — we never submit anything — so "applied" just records that the
// user opened and applied on the employer's site themselves.
export const APPLICATION_STATUSES = [
  "none",
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "dismissed",
] as const;

// PATCH /api/jobs/:id — update the user's pipeline status for a discovered job.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { applicationStatus?: string };
  try {
    body = (await req.json()) as { applicationStatus?: string };
  } catch {
    return errorResponse("invalid JSON body", 400);
  }
  const status = String(body.applicationStatus ?? "");
  if (!APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    return errorResponse(`invalid applicationStatus: ${status}`, 400);
  }

  const existing = await prisma.job.findUnique({
    where: { id },
    select: { appliedAt: true },
  });
  if (!existing) return errorResponse("job not found", 404);

  // Stamp appliedAt the first time a job is marked applied; keep it thereafter.
  const appliedAt =
    status === "applied" ? existing.appliedAt ?? new Date() : existing.appliedAt;

  const job = await prisma.job.update({
    where: { id },
    data: { applicationStatus: status, appliedAt },
    include: { sightings: { include: { source: { select: { id: true, name: true, kind: true } } } } },
  });
  return json(shapeJob(job));
}
