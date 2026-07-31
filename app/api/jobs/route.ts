import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { shapeJob } from "@/lib/jobs/shape";
import { categorizeCompany, fallbackForSystem } from "@/lib/discovery/categories";
import { getConnectionSet, lookupConnections } from "@/lib/connections/store";

export const dynamic = "force-dynamic";

const sourceSelect = { select: { id: true, name: true, kind: true } };

function parseList(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "discovery";
  const country = searchParams.get("country"); // US | CA
  const q = searchParams.get("q")?.toLowerCase();
  const sort = searchParams.get("sort") ?? "posted"; // posted | company | fit | salary
  const since = searchParams.get("since") ?? "all"; // 24h | 7d | 30d | all
  // Enrichment / pipeline filters (all optional, comma-lists where sensible).
  const skills = parseList(searchParams.get("skills")); // AND — job must have all
  const sponsorship = parseList(searchParams.get("sponsorship")); // offers | none | citizenship
  const status = parseList(searchParams.get("status")); // applicationStatus values
  const employmentType = parseList(searchParams.get("employmentType"));
  const source = parseList(searchParams.get("source")); // discoverySystem
  const category = parseList(searchParams.get("category")); // bigtech | ai | quant | startup | other
  const remoteOnly = searchParams.get("remote") === "1";
  const warmOnly = searchParams.get("connections") === "1"; // only jobs where the user has a connection
  const salaryMin = Number(searchParams.get("salaryMin")) || 0;
  const fitMin = Number(searchParams.get("fitMin")) || 0;

  // Imported LinkedIn connections (empty when none), loaded once per request and
  // matched by normalized company name to tag "warm intro" jobs.
  const connections = await getConnectionSet();

  // Attach derived, non-column fields every job card renders: company category
  // and (when present) the user's connections at that employer.
  const decorate = <
    T extends {
      company: string;
      discoverySystem: string | null;
      skills?: string | null;
      fitReasons?: string | null;
    },
  >(
    j: T,
  ) => {
    const match = lookupConnections(connections, j.company);
    return {
      ...shapeJob(j),
      category: categorizeCompany(j.company, fallbackForSystem(j.discoverySystem)),
      ...(match
        ? { connections: { count: match.count, contacts: match.contacts.slice(0, 6) } }
        : {}),
    };
  };

  if (view === "workday") {
    const jobs = await prisma.job.findMany({
      where: { isWorkday: true },
      orderBy: { lastSeenAt: "desc" },
      take: 1000,
      include: { sightings: { include: { source: sourceSelect } } },
    });
    return json(jobs.map(decorate));
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
    take: 4000,
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

  const result = jobs.filter((j) => {
    if (cutoff && posted(j) < cutoff) return false;
    if (remoteOnly && !j.remote) return false;
    if (sponsorship.length && !sponsorship.includes((j.sponsorship ?? "unknown").toLowerCase())) return false;
    if (status.length && !status.includes(j.applicationStatus.toLowerCase())) return false;
    if (employmentType.length && !employmentType.includes((j.employmentType ?? "").toLowerCase())) return false;
    if (source.length && !source.includes((j.discoverySystem ?? "").toLowerCase())) return false;
    if (category.length && !category.includes(categorizeCompany(j.company, fallbackForSystem(j.discoverySystem)))) return false;
    if (warmOnly && !lookupConnections(connections, j.company)) return false;
    if (fitMin && (j.fitScore ?? -1) < fitMin) return false;
    if (salaryMin) {
      const top = j.salaryMax ?? j.salaryMin ?? 0;
      if (top < salaryMin) return false;
    }
    if (skills.length) {
      const have = (j.skills ?? "").toLowerCase();
      if (!skills.every((s) => have.includes(s))) return false;
    }
    if (q && !(j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });

  const byPosted = (a: (typeof jobs)[number], b: (typeof jobs)[number]) =>
    posted(b) - posted(a) || a.company.localeCompare(b.company);
  if (sort === "company") {
    result.sort((a, b) => a.company.localeCompare(b.company) || posted(b) - posted(a));
  } else if (sort === "fit") {
    result.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1) || byPosted(a, b));
  } else if (sort === "salary") {
    const top = (j: (typeof jobs)[number]) => j.salaryMax ?? j.salaryMin ?? -1;
    result.sort((a, b) => top(b) - top(a) || byPosted(a, b));
  } else {
    result.sort(byPosted);
  }

  return json(result.slice(0, 2000).map(decorate));
}
