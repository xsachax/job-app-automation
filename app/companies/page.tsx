import { prisma } from "@/lib/db";
import { API_COMPANIES, BOARD_SOURCES, BROWSER_COMPANIES, SCRAPABLE_BROWSER_SYSTEMS } from "@/lib/discovery/companies";
import { getDiscoveryConfig } from "@/lib/discovery/config";
import { cls, PageHeader } from "../components/ui";
import { CompanyLogo } from "../components/CompanyLogo";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const grouped = await prisma.job.groupBy({
    by: ["company", "country"],
    where: { isWorkday: false, isEntryLevel: true, country: { in: ["US", "CA"] } },
    _count: { _all: true },
  });

  const counts = new Map<string, { us: number; ca: number }>();
  for (const g of grouped) {
    const c = counts.get(g.company) ?? { us: 0, ca: 0 };
    if (g.country === "US") c.us += g._count._all;
    else if (g.country === "CA") c.ca += g._count._all;
    counts.set(g.company, c);
  }
  const get = (name: string) => counts.get(name) ?? { us: 0, ca: 0 };

  // Board-sourced roles keep discoverySystem = "githubboard" only when they were
  // NOT already found on a company's own site (cross-source dedup lets the native
  // card win), so this is the long-tail of employers beyond our named list.
  const boardAgg = await prisma.job.groupBy({
    by: ["country"],
    where: {
      discoverySystem: "githubboard",
      isWorkday: false,
      isEntryLevel: true,
      country: { in: ["US", "CA"] },
    },
    _count: { _all: true },
  });
  const boardUs = boardAgg.find((g) => g.country === "US")?._count._all ?? 0;
  const boardCa = boardAgg.find((g) => g.country === "CA")?._count._all ?? 0;

  // Y Combinator expansion: how many hiring YC companies we've resolved to a
  // public ATS (cached), grouped by backend. Nulls are companies with no public
  // board found. Zero rows = the YC source hasn't run yet.
  const [ycConfig, ycResolved, ycWithBoard, ycBySystem] = await Promise.all([
    getDiscoveryConfig(),
    prisma.ycAtsCache.count(),
    prisma.ycAtsCache.count({ where: { system: { not: null } } }),
    prisma.ycAtsCache.groupBy({ by: ["system"], where: { system: { not: null } }, _count: { _all: true } }),
  ]);
  const ycSystemLine = ycBySystem
    .map((g) => `${g._count._all} ${g.system}`)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${API_COMPANIES.length} companies scraped via public APIs, ${BROWSER_COMPANIES.length} via headless browser, plus ${BOARD_SOURCES.length} community job boards (long tail of employers). Counts are current open entry-level roles.`}
      />

      <h2 className="mb-3 text-lg font-semibold">API sources</h2>
      <div className={cls.card + " mb-8 overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">System</th>
              <th className="px-4 py-2 font-medium">US</th>
              <th className="px-4 py-2 font-medium">CA</th>
            </tr>
          </thead>
          <tbody>
            {API_COMPANIES.map((c) => {
              const n = get(c.name);
              return (
                <tr key={c.name} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <td className="px-4 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <CompanyLogo company={c.name} size={22} />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{c.system}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{n.us}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{n.ca}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Browser-scraped sources</h2>
      <p className="mb-3 text-xs text-gray-400">
        These sites render postings client-side. Run <code className="rounded bg-gray-100 px-1 dark:bg-gray-800 dark:text-gray-200">npm run discover:browser</code>{" "}
        (Playwright) to scrape the supported ones; the rest are bot-gated, so their pinned search URL is
        surfaced instead.
      </p>
      <div className={cls.card + " overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Scraper</th>
              <th className="px-4 py-2 font-medium">Why browser</th>
              <th className="px-4 py-2 font-medium">Search</th>
            </tr>
          </thead>
          <tbody>
            {BROWSER_COMPANIES.map((b) => {
              const scrapable = SCRAPABLE_BROWSER_SYSTEMS.includes(b.system);
              return (
                <tr key={b.name} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <td className="px-4 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <CompanyLogo company={b.name} size={22} />
                      {b.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (scrapable
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400")
                      }
                    >
                      {scrapable ? "supported" : "manual"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{b.reason}</td>
                  <td className="px-4 py-2">
                    <a href={b.searchUrlUS} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
                      US
                    </a>
                    {" · "}
                    <a href={b.searchUrlCA} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
                      CA
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Community job boards</h2>
      <p className="mb-3 text-xs text-gray-400">
        Aggregator feeds (a raw <code className="rounded bg-gray-100 px-1 dark:bg-gray-800 dark:text-gray-200">listings.json</code>) that
        cover hundreds of employers beyond the named list. Their roles are merged into the US/CA lists
        and deduped against company-site postings (the native listing wins). Currently{" "}
        <strong>{boardUs}</strong> US + <strong>{boardCa}</strong> CA roles surfaced <em>only</em> via
        boards.
      </p>
      <div className={cls.card + " overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">Board</th>
              <th className="px-4 py-2 font-medium">System</th>
              <th className="px-4 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {BOARD_SOURCES.map((b) => (
              <tr key={b.name} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{b.system}</span>
                </td>
                <td className="px-4 py-2">
                  {b.board ? (
                    <a
                      href={`https://github.com/${b.board.owner}/${b.board.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {b.board.owner}/{b.board.repo}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Y Combinator expansion</h2>
      <p className="mb-3 text-xs text-gray-400">
        Any hiring YC company from the last <strong>{ycConfig.yc.yearsBack}</strong> years with a team
        of <strong>{ycConfig.yc.minTeamSize}+</strong> is pulled from the live YC directory; we resolve
        each one&apos;s public ATS (Greenhouse / Lever / Ashby) from its own site and merge the roles
        into the US/CA lists (deduped against the named companies above). Resolved boards are cached.
      </p>
      <div className={cls.card + " flex flex-wrap gap-x-8 gap-y-2 text-sm"}>
        {ycResolved === 0 ? (
          <span className="text-gray-500 dark:text-gray-400">
            Not resolved yet — runs on the next <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">npm run discover</code>.
          </span>
        ) : (
          <>
            <span>
              <strong>{ycWithBoard}</strong> of <strong>{ycResolved}</strong> companies resolved to a
              public board
            </span>
            {ycSystemLine && <span className="text-gray-500 dark:text-gray-400">{ycSystemLine}</span>}
          </>
        )}
      </div>
    </div>
  );
}
