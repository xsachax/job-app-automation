import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import { isTier, normalizeCompanyKey } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export interface TierCompany {
  company: string;
  count: number;
  tier: string | null;
}

// GET /api/tiers — every distinct discovered company (US/CA entry-level) with its
// open-role count and current tier assignment, heaviest first so the pool leads
// with the employers that actually have roles.
export async function GET() {
  const [grouped, tierRows] = await Promise.all([
    prisma.job.groupBy({
      by: ["company"],
      where: { isWorkday: false, isEntryLevel: true, country: { in: ["US", "CA"] } },
      _count: { _all: true },
    }),
    prisma.companyTier.findMany(),
  ]);

  const tierByKey = new Map<string, string>();
  for (const row of tierRows) {
    if (isTier(row.tier)) tierByKey.set(normalizeCompanyKey(row.company), row.tier);
  }

  const companies: TierCompany[] = grouped
    .map((g) => ({
      company: g.company,
      count: g._count._all,
      tier: tierByKey.get(normalizeCompanyKey(g.company)) ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company));

  return json({ companies });
}

// PUT /api/tiers — assign (or clear) one company's tier. A null/empty tier
// removes the ranking so the company returns to the unranked pool.
export async function PUT(req: NextRequest) {
  let body: { company?: unknown; tier?: unknown };
  try {
    body = (await req.json()) as { company?: unknown; tier?: unknown };
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) return errorResponse("company is required", 400);

  const rawTier = body.tier;
  const clearing = rawTier == null || rawTier === "";
  if (!clearing && !isTier(rawTier)) {
    return errorResponse(`invalid tier: ${String(rawTier)}`, 400);
  }

  if (clearing) {
    await prisma.companyTier.deleteMany({ where: { company } });
    return json({ company, tier: null });
  }

  const tier = rawTier as string;
  await prisma.companyTier.upsert({
    where: { company },
    create: { company, tier },
    update: { tier },
  });
  return json({ company, tier });
}
