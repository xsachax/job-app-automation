import { prisma } from "@/lib/db";
import { API_COMPANIES, BOARD_SOURCES, BROWSER_COMPANIES, SCRAPABLE_BROWSER_SYSTEMS } from "@/lib/discovery/companies";
import { cls, PageHeader } from "../components/ui";

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

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${API_COMPANIES.length} companies scraped via public APIs, ${BROWSER_COMPANIES.length} via headless browser, plus ${BOARD_SOURCES.length} community job boards (long tail of employers). Counts are current open entry-level roles.`}
      />

      <h2 className="mb-3 text-lg font-semibold">API sources</h2>
      <div className={cls.card + " mb-8 overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500">
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
                <tr key={c.name} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{c.system}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{n.us}</td>
                  <td className="px-4 py-2 text-gray-600">{n.ca}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Browser-scraped sources</h2>
      <p className="mb-3 text-xs text-gray-400">
        These sites render postings client-side. Run <code className="rounded bg-gray-100 px-1">npm run discover:browser</code>{" "}
        (Playwright) to scrape the supported ones; the rest are bot-gated, so their pinned search URL is
        surfaced instead.
      </p>
      <div className={cls.card + " overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500">
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
                <tr key={b.name} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (scrapable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")
                      }
                    >
                      {scrapable ? "supported" : "manual"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{b.reason}</td>
                  <td className="px-4 py-2">
                    <a href={b.searchUrlUS} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      US
                    </a>
                    {" · "}
                    <a href={b.searchUrlCA} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
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
        Aggregator feeds (a raw <code className="rounded bg-gray-100 px-1">listings.json</code>) that
        cover hundreds of employers beyond the named list. Their roles are merged into the US/CA lists
        and deduped against company-site postings (the native listing wins). Currently{" "}
        <strong>{boardUs}</strong> US + <strong>{boardCa}</strong> CA roles surfaced <em>only</em> via
        boards.
      </p>
      <div className={cls.card + " overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Board</th>
              <th className="px-4 py-2 font-medium">System</th>
              <th className="px-4 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {BOARD_SOURCES.map((b) => (
              <tr key={b.name} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2 text-gray-500">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{b.system}</span>
                </td>
                <td className="px-4 py-2">
                  {b.board ? (
                    <a
                      href={`https://github.com/${b.board.owner}/${b.board.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline"
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
    </div>
  );
}
