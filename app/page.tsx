import { prisma } from "@/lib/db";
import { applyMode } from "@/lib/applications/submit";
import { ScanButton } from "./components/ScanButton";
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

export default async function OverviewPage() {
  const [sources, enabledSources, totalJobs, workdayJobs, groups, submitted, pending, agentReviewed, recent] =
    await Promise.all([
      prisma.source.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.job.count({ where: { isWorkday: false } }),
      prisma.job.count({ where: { isWorkday: true } }),
      prisma.match.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.application.count({ where: { status: "submitted" } }),
      prisma.application.count({ where: { status: "pending_approval" } }),
      prisma.match.count({ where: { matchProvider: "agent" } }),
      prisma.source.findMany({ orderBy: { updatedAt: "desc" }, take: 8 }),
    ]);

  const byStatus: Record<string, number> = {};
  for (const g of groups) byStatus[g.status] = g._count._all;
  const mode = applyMode();

  return (
    <div>
      <PageHeader title="Overview" subtitle="Your job application pipeline at a glance.">
        <ScanButton />
      </PageHeader>

      <div
        className={
          "mb-6 rounded-xl border p-4 text-sm " +
          (mode === "live"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-green-200 bg-green-50 text-green-800")
        }
      >
        {mode === "live" ? (
          <>
            <b>LIVE mode.</b> Approved applications will be submitted to real ATS forms via Playwright.
          </>
        ) : (
          <>
            <b>DRY-RUN mode (safe).</b> Applications are fully prepared and gated for your approval, but
            nothing is submitted. Set <code>APPLY_MODE=live</code> to enable real submission.
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Sources" value={sources} hint={`${enabledSources} enabled`} />
        <Stat label="Jobs tracked" value={totalJobs} hint="deduped across sources" />
        <Stat label="New matches" value={byStatus["new"] ?? 0} />
        <Stat label="Agent-reviewed" value={agentReviewed} hint="resume fit by Copilot" />
        <Stat label="Pending approval" value={pending} hint="awaiting your gate" />
        <Stat label="Submitted" value={submitted} />
        <Stat label="Workday flagged" value={workdayJobs} hint="never auto-applied" />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent source activity</h2>
        <div className={cls.card + " overflow-x-auto p-0"}>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-gray-400" colSpan={5}>
                    No sources yet — add some on the Sources page.
                  </td>
                </tr>
              )}
              {recent.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-gray-500">{s.kind}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {s.lastStatus ? (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (s.lastStatus === "ok"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700")
                        }
                      >
                        {s.lastStatus}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{s.lastMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Statuses tracked: {Object.entries(byStatus).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("  ·  ") || "none yet"}
        </p>
      </div>
    </div>
  );
}
