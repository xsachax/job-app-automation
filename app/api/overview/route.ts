import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { ACTIVE_JOB_WHERE } from "@/lib/jobs/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  const [sources, enabledSources, totalJobs, workdayJobs, matchGroups, submitted, pending, agentReviewed] =
    await Promise.all([
      prisma.source.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.job.count({ where: { isWorkday: false, ...ACTIVE_JOB_WHERE } }),
      prisma.job.count({ where: { isWorkday: true, ...ACTIVE_JOB_WHERE } }),
      prisma.match.groupBy({
        by: ["status"],
        where: { job: { ...ACTIVE_JOB_WHERE } },
        _count: { _all: true },
      }),
      prisma.application.count({ where: { status: "submitted" } }),
      prisma.application.count({ where: { status: "pending_approval" } }),
      prisma.match.count({
        where: {
          matchProvider: "agent",
          job: { ...ACTIVE_JOB_WHERE },
        },
      }),
    ]);

  const matchesByStatus: Record<string, number> = {};
  for (const g of matchGroups) matchesByStatus[g.status] = g._count._all;

  return json({
    sources,
    enabledSources,
    totalJobs,
    workdayJobs,
    matchesByStatus,
    submitted,
    pending,
    agentReviewed,
  });
}
