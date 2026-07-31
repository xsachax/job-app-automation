import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { categorizeCompany, fallbackForSystem, CATEGORY_ORDER } from "@/lib/discovery/categories";
import { getConnectionSet, lookupConnections } from "@/lib/connections/store";

export const dynamic = "force-dynamic";

// Facets power the Jobs filter bar: the distinct skills, sources, sponsorship
// values and salary ceiling actually present in the current dataset, so the UI
// only ever offers filters that can match something. Computed in-memory over the
// entry-level discovery rows (skills live in a JSON column SQLite can't group).
export async function GET() {
  const jobs = await prisma.job.findMany({
    where: { isEntryLevel: true, country: { in: ["US", "CA"] } },
    select: {
      skills: true,
      discoverySystem: true,
      atsType: true,
      company: true,
      sponsorship: true,
      employmentType: true,
      salaryMax: true,
      salaryMin: true,
      applicationStatus: true,
    },
    take: 8000,
  });

  const skillCounts = new Map<string, number>();
  const sources = new Map<string, number>();
  const platforms = new Map<string, number>();
  const categories = new Map<string, number>();
  const sponsorship = new Map<string, number>();
  const employmentType = new Map<string, number>();
  const statuses = new Map<string, number>();
  let maxSalary = 0;
  let withConnections = 0;

  const connections = await getConnectionSet();

  const bump = (m: Map<string, number>, k: string | null | undefined) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  };

  for (const j of jobs) {
    bump(sources, j.discoverySystem);
    bump(platforms, j.atsType || "unknown");
    bump(categories, categorizeCompany(j.company, fallbackForSystem(j.discoverySystem)));
    bump(sponsorship, j.sponsorship ?? "unknown");
    bump(employmentType, j.employmentType);
    bump(statuses, j.applicationStatus);
    maxSalary = Math.max(maxSalary, j.salaryMax ?? j.salaryMin ?? 0);
    if (lookupConnections(connections, j.company)) withConnections += 1;
    if (j.skills) {
      try {
        for (const s of JSON.parse(j.skills) as string[]) bump(skillCounts, s);
      } catch {
        /* ignore malformed */
      }
    }
  }

  const sorted = (m: Map<string, number>, limit?: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));

  return json({
    skills: sorted(skillCounts, 60),
    sources: sorted(sources),
    categories: CATEGORY_ORDER.filter((c) => categories.has(c)).map((c) => ({
      value: c,
      count: categories.get(c) ?? 0,
    })),
    sponsorship: sorted(sponsorship),
    employmentType: sorted(employmentType),
    platforms: sorted(platforms),
    statuses: sorted(statuses),
    maxSalary,
    withConnections,
    total: jobs.length,
  });
}
