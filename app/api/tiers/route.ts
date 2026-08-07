import type { NextRequest } from "next/server";
import { canonicalCompanyName } from "@/lib/company-names";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import {
  isTier,
  latestCompanyTiersByKey,
  normalizeCompanyKey,
} from "@/lib/tiers";
import {
  parseTierEditVersion,
  saveCompanyTier,
} from "@/lib/tier-store";

export const dynamic = "force-dynamic";

export interface TierCompany {
  company: string;
  count: number;
  tier: string | null;
  editVersion: number;
}

// GET /api/tiers — every distinct discovered company with a judged US/CA
// entry-level role, including Workday-backed employers.
export async function GET() {
  const [grouped, tierRows] = await Promise.all([
    prisma.job.groupBy({
      by: ["company"],
      where: { isEntryLevel: true, country: { in: ["US", "CA"] } },
      _count: { _all: true },
    }),
    prisma.companyTier.findMany(),
  ]);

  const tierByKey = new Map<string, { tier: string | null; editVersion: number }>();
  for (const [key, row] of latestCompanyTiersByKey(tierRows)) {
    tierByKey.set(key, {
      tier: isTier(row.tier) ? row.tier : null,
      editVersion: Number(row.editVersion),
    });
  }

  const countsByCompany = new Map<
    string,
    { company: string; count: number; displayCount: number }
  >();
  for (const group of grouped) {
    const company = canonicalCompanyName(group.company);
    const key = normalizeCompanyKey(company);
    const current = countsByCompany.get(key);
    countsByCompany.set(key, {
      company:
        !current || group._count._all > current.displayCount
          ? company
          : current.company,
      count: (current?.count ?? 0) + group._count._all,
      displayCount: Math.max(current?.displayCount ?? 0, group._count._all),
    });
  }

  const companies: TierCompany[] = [...countsByCompany]
    .map(([key, { company, count }]) => {
      const saved = tierByKey.get(key);
      return {
        company,
        count,
        tier: saved?.tier ?? null,
        editVersion: saved?.editVersion ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company));

  return json({ companies });
}

// PUT /api/tiers — assign (or clear) one company's tier. Versioned tombstones
// keep delayed requests from resurrecting an older assignment after a clear.
export async function PUT(req: NextRequest) {
  let body: { company?: unknown; tier?: unknown; editVersion?: unknown };
  try {
    body = (await req.json()) as {
      company?: unknown;
      tier?: unknown;
      editVersion?: unknown;
    };
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const company =
    typeof body.company === "string"
      ? canonicalCompanyName(body.company)
      : "";
  if (!company) return errorResponse("company is required", 400);

  const rawTier = body.tier;
  const clearing = rawTier == null || rawTier === "";
  if (!clearing && !isTier(rawTier)) {
    return errorResponse(`invalid tier: ${String(rawTier)}`, 400);
  }
  const editVersion = parseTierEditVersion(body.editVersion);
  if (editVersion == null) {
    return errorResponse("valid editVersion is required", 400);
  }

  const saved = await saveCompanyTier(
    company,
    clearing ? null : rawTier,
    editVersion,
  );
  return json({ company, ...saved });
}
