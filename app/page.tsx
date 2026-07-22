import { prisma } from "@/lib/db";
import { API_COMPANIES, BROWSER_COMPANIES } from "@/lib/discovery/companies";
import { cls, PageHeader } from "./components/ui";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className={cls.card}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function timeAgo(d: Date | null): string {
  if (!d) return "never";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function OverviewPage() {
  const entryWhere = { isWorkday: false, isEntryLevel: true } as const;
  const [usEntry, caEntry, workdayJobs, lastJob, byCompany] = await Promise.all([
    prisma.job.count({ where: { ...entryWhere, country: "US" } }),
    prisma.job.count({ where: { ...entryWhere, country: "CA" } }),
    prisma.job.count({ where: { isWorkday: true } }),
    prisma.job.findFirst({ where: entryWhere, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
    prisma.job.groupBy({
      by: ["company"],
      where: { ...entryWhere, country: { in: ["US", "CA"] } },
      _count: { _all: true },
      orderBy: { _count: { company: "desc" } },
      take: 12,
    }),
  ]);

  const companiesCovered = API_COMPANIES.length + BROWSER_COMPANIES.length;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Fresh entry-level software roles across US & Canada, scraped from company career sites."
      />

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <b>Discovery mode.</b> This pipeline finds currently-open entry-level roles (SWE, DevOps, ML and
        related) requiring ≤ 2 years of experience and a bachelor&apos;s degree or below. Auto-apply and
        resume matching are paused — run <code>npm run discover</code> to refresh the queue.
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="US entry-level" value={usEntry} hint="open roles in queue" />
        <Stat label="CA entry-level" value={caEntry} hint="open roles in queue" />
        <Stat label="Companies covered" value={companiesCovered} hint={`${API_COMPANIES.length} API · ${BROWSER_COMPANIES.length} browser`} />
        <Stat label="Last discovery" value={timeAgo(lastJob?.lastSeenAt ?? null)} hint="most recent scrape" />
        <Stat label="Workday flagged" value={workdayJobs} hint="tracked separately" />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Entry-level roles by company</h2>
        <div className={cls.card + " overflow-x-auto p-0"}>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Open entry-level roles</th>
              </tr>
            </thead>
            <tbody>
              {byCompany.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-gray-400" colSpan={2}>
                    No roles yet — run <code>npm run discover</code> to populate the queue.
                  </td>
                </tr>
              )}
              {byCompany.map((c) => (
                <tr key={c.company} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.company}</td>
                  <td className="px-4 py-2 text-gray-600">{c._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
