import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

const sourceSelect = { select: { id: true, name: true, kind: true } };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "discovery";
  const country = searchParams.get("country"); // US | CA
  const q = searchParams.get("q")?.toLowerCase();
  const sort = searchParams.get("sort") ?? "posted"; // posted | company
  const since = searchParams.get("since") ?? "all"; // 24h | 7d | 30d | all

  if (view === "workday") {
    const jobs = await prisma.job.findMany({
      where: { isWorkday: true },
      orderBy: { lastSeenAt: "desc" },
      take: 1000,
      include: { sightings: { include: { source: sourceSelect } } },
    });
    return json(jobs);
  }

  // Discovery view: entry-level US/CA software roles surfaced by the scraper.
  const jobs = await prisma.job.findMany({
    where: {
      isWorkday: false,
      isEntryLevel: true,
      ...(country ? { country } : { country: { in: ["US", "CA"] } }),
    },
    include: {
      sightings: { include: { source: sourceSelect } },
    },
    take: 3000,
  });

  // Effective posting time: real postedAt when the ATS gives one, else the
  // moment we first saw it. Drives both the date filter and the queue order.
  const posted = (j: (typeof jobs)[number]) => (j.postedAt ?? j.firstSeenAt).getTime();

  const windowMs: Record<string, number> = {
    "24h": 864e5,
    "7d": 7 * 864e5,
    "30d": 30 * 864e5,
  };
  const win = windowMs[since];
  const cutoff = win ? Date.now() - win : 0;

  let result = cutoff ? jobs.filter((j) => posted(j) >= cutoff) : jobs;

  if (sort === "company") {
    result.sort((a, b) => a.company.localeCompare(b.company) || posted(b) - posted(a));
  } else {
    result.sort((a, b) => posted(b) - posted(a) || a.company.localeCompare(b.company));
  }

  if (q) {
    result = result.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q),
    );
  }

  return json(result.slice(0, 1500));
}
