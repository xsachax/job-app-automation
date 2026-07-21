import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

const sourceSelect = { select: { id: true, name: true, kind: true } };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "matches";
  const status = searchParams.get("status") ?? undefined;
  const q = searchParams.get("q")?.toLowerCase();

  if (view === "workday") {
    const jobs = await prisma.job.findMany({
      where: { isWorkday: true },
      orderBy: { lastSeenAt: "desc" },
      take: 1000,
      include: { sightings: { include: { source: sourceSelect } } },
    });
    return json(jobs);
  }

  const jobs = await prisma.job.findMany({
    where: {
      isWorkday: false,
      ...(status ? { match: { is: { status } } } : {}),
    },
    include: {
      match: true,
      application: true,
      sightings: { include: { source: sourceSelect } },
    },
    take: 1000,
  });

  jobs.sort(
    (a, b) =>
      (b.match?.score ?? 0) - (a.match?.score ?? 0) ||
      b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );

  const filtered = q
    ? jobs.filter(
        (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q),
      )
    : jobs;

  return json(filtered);
}
