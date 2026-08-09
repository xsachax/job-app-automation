import { runDiscovery, ingestSourcePostings } from "../lib/discovery/run";
import { scrapeBrowserCompanies } from "../lib/discovery/browser";
import { prisma } from "../lib/db";
import { BROWSER_COMPANIES } from "../lib/discovery/companies";
import {
  countDiscoverySourceOutcomes,
  describeBrowserSource,
  recordDiscoverySourceFailure,
  type DiscoverySourceOutcome,
} from "../lib/discovery/lifecycle";

// CLI entry point for the discovery pipeline. Fetches fresh entry-level US/CA
// software roles and persists them (deduped) into the Job table.
//
//   npm run discover                       # all API companies, entry-level only
//   npm run discover -- --all-levels       # keep every software role (no YoE gate)
//   npm run discover -- Amazon Stripe      # only these API companies
//   npm run discover:browser               # Playwright scrape the client-rendered sites
//   npm run discover:browser -- Apple      # only this browser company

function outcomeIcon(outcome: DiscoverySourceOutcome): string {
  switch (outcome) {
    case "complete":
      return "✓";
    case "degraded":
      return "⚠";
    case "limited":
      return "○";
    case "failed":
      return "✗";
  }
}

async function runApi(companies: string[], onlyEntryLevel: boolean) {
  console.log(
    `Discovering ${companies.length ? companies.join(", ") : "all API companies"} ` +
      `(${onlyEntryLevel ? "entry-level only" : "all levels"})…\n`,
  );
  const result = await runDiscovery({
    companies: companies.length ? companies : undefined,
    onlyEntryLevel,
    onProgress: (r) => {
      const outcome =
        r.outcome === "complete"
          ? ""
          : `${r.outcome}: ${r.reason} · `;
      console.log(
        `  ${outcomeIcon(r.outcome)} ${r.company.padEnd(18)} ${outcome}` +
          `US ${r.usEntry}/${r.usTotal} · CA ${r.caEntry}/${r.caTotal}`,
      );
    },
  });
  console.log(
    `\nDone. ${result.created} new, ${result.updated} updated · ` +
      `${result.usEntry} US + ${result.caEntry} CA entry-level roles · ` +
      `${result.outcomes.complete} complete, ${result.outcomes.failed} failed, ` +
      `${result.outcomes.degraded} degraded, ` +
      `${result.outcomes.limited} limited · ` +
      `${result.lifecycle.closed} closed, ${result.lifecycle.suspect} rechecking.`,
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
  const outcomes: DiscoverySourceOutcome[] = [];
  const results = await scrapeBrowserCompanies({
    companies: companies.length ? companies : undefined,
    onResult: () => {},
  });
  for (const r of results) {
    const company = BROWSER_COMPANIES.find((candidate) => candidate.name === r.company);
    if (!company) throw new Error(`Unknown browser source result: ${r.company}`);
    const descriptor = describeBrowserSource(company);
    if (r.error) {
      await recordDiscoverySourceFailure(descriptor, r.error);
      outcomes.push("failed");
      console.log(`  ✗ ${r.company.padEnd(14)} ${r.error}`);
      continue;
    }
    const { counts, sourceRun } = await ingestSourcePostings(
      descriptor,
      r.postings,
      onlyEntryLevel,
      undefined,
      { sourceWarning: r.warning },
    );
    created += counts.created;
    updated += counts.updated;
    usEntry += counts.usEntry;
    caEntry += counts.caEntry;
    outcomes.push(sourceRun.outcome);
    console.log(
      `  ${outcomeIcon(sourceRun.outcome)} ${r.company.padEnd(14)} scraped US ${r.usFound} / CA ${r.caFound} → ` +
        `kept US ${counts.usEntry} · CA ${counts.caEntry}`,
    );
    if (sourceRun.outcome !== "complete") {
      console.log(`    ${sourceRun.outcome}: ${sourceRun.reason}`);
    }
  }
  const outcomeCounts = countDiscoverySourceOutcomes(outcomes);
  console.log(
    `\nDone. ${created} new, ${updated} updated · ${usEntry} US + ${caEntry} CA entry-level roles · ` +
      `${outcomeCounts.complete} complete, ${outcomeCounts.failed} failed, ` +
      `${outcomeCounts.degraded} degraded, ` +
      `${outcomeCounts.limited} limited.`,
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
