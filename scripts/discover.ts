import { runDiscovery } from "../lib/discovery/run";
import { prisma } from "../lib/db";

// CLI: fetch fresh entry-level US/CA software roles from every API company and
// persist them. Usage:
//   npm run discover                 # all companies, entry-level only
//   npm run discover -- --all-levels # keep every software role (no YoE gate)
//   npm run discover -- Amazon Stripe OpenAI   # only these companies

async function main() {
  const args = process.argv.slice(2);
  const onlyEntryLevel = !args.includes("--all-levels");
  const companies = args.filter((a) => !a.startsWith("--"));

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
