import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, errorResponse } from "@/lib/http";
import { isTier } from "@/lib/tiers";
import { limitToPopular, MAX_LOCATION_OPTIONS } from "@/lib/tier-options";
import { normalizeLocation, normalizeLocationKey } from "@/lib/locations";

export const dynamic = "force-dynamic";

export interface TierLocation {
  location: string;
  count: number;
  tier: string | null;
}

// GET /api/location-tiers — the most popular canonical locations across the
// discovered (US/CA entry-level) jobs with their open-role count and current
// tier. Locations are messy free text, so counts are aggregated in JS over
// normalizeLocation() rather than a SQL groupBy, matching how the judge buckets
// them. The full set runs to hundreds of one-off cities, so we trim to the
// top-N most popular (plus anything already ranked) to keep the board usable.
export async function GET() {
  const [jobs, tierRows] = await Promise.all([
    prisma.job.findMany({
      where: { isWorkday: false, isEntryLevel: true, country: { in: ["US", "CA"] } },
      select: { location: true },
    }),
    prisma.locationTier.findMany(),
  ]);

  const tierByKey = new Map<string, string>();
  for (const row of tierRows) {
    if (isTier(row.tier)) tierByKey.set(normalizeLocationKey(row.location), row.tier);
  }

  const counts = new Map<string, number>();
  for (const j of jobs) {
    const canonical = normalizeLocation(j.location);
    if (!canonical) continue;
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }

  const all: TierLocation[] = [...counts.entries()].map(([location, count]) => ({
    location,
    count,
    tier: tierByKey.get(normalizeLocationKey(location)) ?? null,
  }));

  const locations = limitToPopular(all, MAX_LOCATION_OPTIONS, (l) => l.location).sort(
    (a, b) => b.count - a.count || a.location.localeCompare(b.location),
  );

  return json({ locations });
}

// PUT /api/location-tiers — assign (or clear) one location's tier. A null/empty
// tier removes the ranking so the location returns to the neutral unrated pool.
export async function PUT(req: NextRequest) {
  let body: { location?: unknown; tier?: unknown };
  try {
    body = (await req.json()) as { location?: unknown; tier?: unknown };
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (!location) return errorResponse("location is required", 400);

  const rawTier = body.tier;
  const clearing = rawTier == null || rawTier === "";
  if (!clearing && !isTier(rawTier)) {
    return errorResponse(`invalid tier: ${String(rawTier)}`, 400);
  }

  if (clearing) {
    await prisma.locationTier.deleteMany({ where: { location } });
    return json({ location, tier: null });
  }

  const tier = rawTier as string;
  await prisma.locationTier.upsert({
    where: { location },
    create: { location, tier },
    update: { tier },
  });
  return json({ location, tier });
}
