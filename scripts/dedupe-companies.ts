import { dedupeStoredCompanyNames } from "../lib/company-dedup";
import { prisma } from "../lib/db";

async function main() {
  const result = await dedupeStoredCompanyNames();
  for (const group of result.groups) {
    console.log(
      `${group.aliases.join(" | ")} -> ${group.canonical} ` +
        `(${group.jobsUpdated} jobs, ${group.tierRowsMerged} duplicate tiers removed)`,
    );
  }
  console.log(
    `Done. ${result.jobsUpdated} jobs canonicalized across ${result.groups.length} groups; ` +
      `${result.tierRowsMerged} duplicate tier rows removed.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
