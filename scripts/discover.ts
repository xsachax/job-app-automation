import { runDiscovery, ingestPostings } from "../lib/discovery/run";
import { scrapeBrowserCompanies } from "../lib/discovery/browser";
import { prisma } from "../lib/db";

// CLI entry point for the discovery pipeline. Fetches fresh entry-level US/CA
// software roles and persists them (deduped) into the Job table.
//
//   npm run discover                       # all API companies, entry-level only
//   npm run discover -- --all-levels       # keep every software role (no YoE gate)
//   npm run discover -- Amazon Stripe      # only these API companies
//   npm run discover:browser               # Playwright scrape the client-rendered sites
//   npm run discover:browser -- Apple      # only this browser company

async function runApi(companies: string[], onlyEntryLevel: boolean) {
  console.log(
    `Discovering ${companies.length ? companies.join(", ") : "all API companies"} ` +
      `(${onlyEntryLevel ? "entry-level only" : "all levels"})…\n`,
  );
  const result = await runDiscovery({
    companies: companies.length ? companies : undefined,
    onlyEntryLevel,
    onProgress: (r) => {
      const flag = r.error ? `✗ ${r.error}` : `US ${r.usEntry}/${r.usTotal} · CA ${r.caEntry}/${r.caTotal}`;
      console.log(`  ${r.error ? "✗" : "✓"} ${r.company.padEnd(18)} ${flag}`);
    },
  });
  console.log(
    `\nDone. ${result.created} new, ${result.updated} updated · ` +
      `${result.usEntry} US + ${result.caEntry} CA entry-level roles · ${result.errors} errors.`,
  );
}

async function runBrowser(companies: string[], onlyEntryLevel: boolean) {
  console.log(
    `Browser-scraping ${companies.length ? companies.join(", ") : "all browser companies"} ` +
      `(Playwright)…\n`,
  );
  let created = 0;
  let updated = 0;
  let usEntry = 0;
  let caEntry = 0;
  const results = await scrapeBrowserCompanies({
    companies: companies.length ? companies : undefined,
    onResult: () => {},
  });
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.company.padEnd(14)} ${r.error}`);
      continue;
    }
    const counts = await ingestPostings(r.postings, onlyEntryLevel);
    created += counts.created;
    updated += counts.updated;
    usEntry += counts.usEntry;
    caEntry += counts.caEntry;
    console.log(
      `  ✓ ${r.company.padEnd(14)} scraped US ${r.usFound} / CA ${r.caFound} → ` +
        `kept US ${counts.usEntry} · CA ${counts.caEntry}`,
    );
  }
  console.log(
    `\nDone. ${created} new, ${updated} updated · ${usEntry} US + ${caEntry} CA entry-level roles.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const browser = args.includes("--browser");
  const onlyEntryLevel = !args.includes("--all-levels");
  const companies = args.filter((a) => !a.startsWith("--"));

  if (browser) await runBrowser(companies, onlyEntryLevel);
  else await runApi(companies, onlyEntryLevel);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
