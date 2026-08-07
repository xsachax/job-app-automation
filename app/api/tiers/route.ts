import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import { isTier, normalizeCompanyKey } from "@/lib/tiers";
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

  const tierByKey = new Map<
    string,
    { tier: string | null; editVersion: number }
  >();
  for (const row of tierRows) {
    tierByKey.set(normalizeCompanyKey(row.company), {
      tier: isTier(row.tier) ? row.tier : null,
      editVersion: Number(row.editVersion),
    });
  }

  const companies: TierCompany[] = grouped
    .map((g) => {
      const saved = tierByKey.get(normalizeCompanyKey(g.company));
      return {
        company: g.company,
        count: g._count._all,
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

  const company = typeof body.company === "string" ? body.company.trim() : "";
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
