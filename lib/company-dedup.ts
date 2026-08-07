import {
  canonicalCompanyKey,
  canonicalCompanyName,
} from "./company-names";
import { prisma } from "./db";

export interface CompanyDedupGroup {
  canonical: string;
  aliases: string[];
  jobsUpdated: number;
  tierRowsMerged: number;
}

export interface CompanyDedupResult {
  groups: CompanyDedupGroup[];
  jobsUpdated: number;
  tierRowsMerged: number;
}

function isNewerTier(
  candidate: { editVersion: bigint; updatedAt: Date },
  current: { editVersion: bigint; updatedAt: Date },
): boolean {
  if (candidate.editVersion !== current.editVersion) {
    return candidate.editVersion > current.editVersion;
  }
  return candidate.updatedAt.getTime() > current.updatedAt.getTime();
}

export async function dedupeStoredCompanyNames(): Promise<CompanyDedupResult> {
  const [jobRows, tierRows] = await Promise.all([
    prisma.job.groupBy({
      by: ["company"],
      _count: { _all: true },
    }),
    prisma.companyTier.findMany(),
  ]);

  const groupsByKey = new Map<
    string,
    { variants: Set<string>; displayCounts: Map<string, number> }
  >();
  for (const row of jobRows) {
    const key = canonicalCompanyKey(row.company);
    const group = groupsByKey.get(key) ?? {
      variants: new Set<string>(),
      displayCounts: new Map<string, number>(),
    };
    const display = canonicalCompanyName(row.company);
    group.variants.add(row.company);
    group.displayCounts.set(
      display,
      (group.displayCounts.get(display) ?? 0) + row._count._all,
    );
    groupsByKey.set(key, group);
  }
  for (const row of tierRows) {
    const key = canonicalCompanyKey(row.company);
    const group = groupsByKey.get(key) ?? {
      variants: new Set<string>(),
      displayCounts: new Map<string, number>(),
    };
    const display = canonicalCompanyName(row.company);
    group.variants.add(row.company);
    if (!group.displayCounts.has(display)) group.displayCounts.set(display, 0);
    groupsByKey.set(key, group);
  }

  const changedGroups = [...groupsByKey]
    .map(([, group]) => {
      const canonical = [...group.displayCounts].sort(
        ([nameA, countA], [nameB, countB]) =>
          countB - countA || nameA.localeCompare(nameB),
      )[0][0];
      return [canonical, group.variants] as const;
    })
    .filter(([canonical, variants]) => [...variants].some((variant) => variant !== canonical))
    .sort(([a], [b]) => a.localeCompare(b));

  const groups = await prisma.$transaction(async (tx) => {
    const results: CompanyDedupGroup[] = [];
    for (const [canonical, variantSet] of changedGroups) {
      const aliases = [...variantSet].sort((a, b) => a.localeCompare(b));
      let jobsUpdated = 0;
      for (const alias of aliases) {
        if (alias === canonical) continue;
        const updated = await tx.job.updateMany({
          where: { company: alias },
          data: { company: canonical },
        });
        jobsUpdated += updated.count;
      }

      const matchingTiers = tierRows.filter(
        (row) =>
          canonicalCompanyKey(row.company) === canonicalCompanyKey(canonical),
      );
      const tierNeedsMerge =
        matchingTiers.length > 1 ||
        (matchingTiers.length === 1 &&
          matchingTiers[0].company !== canonical);
      let tierRowsMerged = 0;
      if (tierNeedsMerge) {
        const winner = matchingTiers.reduce((current, candidate) =>
          isNewerTier(candidate, current) ? candidate : current,
        );
        const deleted = await tx.companyTier.deleteMany({
          where: { company: { in: matchingTiers.map((row) => row.company) } },
        });
        await tx.companyTier.create({
          data: {
            company: canonical,
            tier: winner.tier,
            editVersion: winner.editVersion,
            updatedAt: winner.updatedAt,
          },
        });
        tierRowsMerged = Math.max(0, deleted.count - 1);
      }

      results.push({ canonical, aliases, jobsUpdated, tierRowsMerged });
    }
    return results;
  });

  return {
    groups,
    jobsUpdated: groups.reduce((sum, group) => sum + group.jobsUpdated, 0),
    tierRowsMerged: groups.reduce(
      (sum, group) => sum + group.tierRowsMerged,
      0,
    ),
  };
}
