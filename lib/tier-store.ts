import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isTier, type Tier } from "./tiers";

export interface VersionedTierResult {
  tier: Tier | null;
  editVersion: number;
  accepted: boolean;
}

export function parseTierEditVersion(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function saveCompanyTier(
  company: string,
  tier: Tier | null,
  editVersion: number,
): Promise<VersionedTierResult> {
  const version = BigInt(editVersion);
  const storedTier = tier ?? "";
  const update = {
    where: { company, editVersion: { lt: version } },
    data: { tier: storedTier, editVersion: version },
  };

  const updated = await prisma.companyTier.updateMany(update);
  if (updated.count === 0) {
    const existing = await prisma.companyTier.findUnique({ where: { company } });
    if (!existing) {
      try {
        await prisma.companyTier.create({
          data: { company, tier: storedTier, editVersion: version },
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        await prisma.companyTier.updateMany(update);
      }
    }
  }

  const current = await prisma.companyTier.findUniqueOrThrow({
    where: { company },
  });
  return {
    tier: isTier(current.tier) ? current.tier : null,
    editVersion: Number(current.editVersion),
    accepted:
      current.editVersion === version && current.tier === storedTier,
  };
}

export async function saveLocationTier(
  location: string,
  tier: Tier | null,
  editVersion: number,
): Promise<VersionedTierResult> {
  const version = BigInt(editVersion);
  const storedTier = tier ?? "";
  const update = {
    where: { location, editVersion: { lt: version } },
    data: { tier: storedTier, editVersion: version },
  };

  const updated = await prisma.locationTier.updateMany(update);
  if (updated.count === 0) {
    const existing = await prisma.locationTier.findUnique({
      where: { location },
    });
    if (!existing) {
      try {
        await prisma.locationTier.create({
          data: { location, tier: storedTier, editVersion: version },
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        await prisma.locationTier.updateMany(update);
      }
    }
  }

  const current = await prisma.locationTier.findUniqueOrThrow({
    where: { location },
  });
  return {
    tier: isTier(current.tier) ? current.tier : null,
    editVersion: Number(current.editVersion),
    accepted:
      current.editVersion === version && current.tier === storedTier,
  };
}
