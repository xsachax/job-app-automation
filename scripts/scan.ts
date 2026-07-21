import { runScan } from "../lib/scan";
import { prisma } from "../lib/db";

// One-off scan: run every enabled source through the dedup + scoring pipeline.
async function main() {
  const summary = await runScan();
  console.log("Scan complete:");
  console.log(`  sources : ${summary.totals.sources}`);
  console.log(`  fetched : ${summary.totals.fetched}`);
  console.log(`  created : ${summary.totals.created}`);
  console.log(`  updated : ${summary.totals.updated} (deduped)`);
  console.log(`  workday : ${summary.totals.workday} (flagged)`);
  console.log(`  skipped : ${summary.totals.skipped}`);
  console.log(`  errors  : ${summary.totals.errors}`);
  for (const r of summary.sources) {
    const tag = r.error ? `ERROR: ${r.error}` : `+${r.created} new, ${r.updated} dedup`;
    console.log(`   - ${r.sourceName ?? r.sourceId}: ${tag}`);
  }
  console.log(`  took ${summary.durationMs}ms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
