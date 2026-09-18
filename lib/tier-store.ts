import { Prisma } from "@prisma/client";
import { canonicalCompanyName } from "./company-names";
import { communityTierAssignments } from "./community-rankings";
import { prisma } from "./db";
import {
  isTier,
  type Tier,
  type TierListAction,
  type TierListKind,
  type TierListReplacement,
} from "./tiers";

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
  company = canonicalCompanyName(company);
  const version = BigInt(editVersion);
  const storedTier = tier ?? "";
  return prisma.$transaction(async (tx) => {
    const list = await tx.tierListState.findUnique({
      where: { id: "companies" },
    });
    if (list && version <= list.editVersion) {
      const current = await tx.companyTier.findUnique({ where: { company } });
      return {
        tier: isTier(current?.tier) ? current.tier : null,
        editVersion: Number(current?.editVersion ?? list.editVersion),
        accepted: false,
      };
    }
    const update = {
      where: { company, editVersion: { lt: version } },
      data: { tier: storedTier, editVersion: version },
    };

    const updated = await tx.companyTier.updateMany(update);
    if (updated.count === 0) {
      const existing = await tx.companyTier.findUnique({ where: { company } });
      if (!existing) {
        try {
          await tx.companyTier.create({
            data: { company, tier: storedTier, editVersion: version },
          });
        } catch (error) {
          if (!isUniqueConstraint(error)) throw error;
          await tx.companyTier.updateMany(update);
        }
      }
    }

    const current = await tx.companyTier.findUniqueOrThrow({
      where: { company },
    });
    return {
      tier: isTier(current.tier) ? current.tier : null,
      editVersion: Number(current.editVersion),
      accepted:
        current.editVersion === version && current.tier === storedTier,
    };
  });
}

export async function saveLocationTier(
  location: string,
  tier: Tier | null,
  editVersion: number,
): Promise<VersionedTierResult> {
  const version = BigInt(editVersion);
  const storedTier = tier ?? "";
  return prisma.$transaction(async (tx) => {
    const list = await tx.tierListState.findUnique({
      where: { id: "locations" },
    });
    if (list && version <= list.editVersion) {
      const current = await tx.locationTier.findUnique({ where: { location } });
      return {
        tier: isTier(current?.tier) ? current.tier : null,
        editVersion: Number(current?.editVersion ?? list.editVersion),
        accepted: false,
      };
    }
    const update = {
      where: { location, editVersion: { lt: version } },
      data: { tier: storedTier, editVersion: version },
    };

    const updated = await tx.locationTier.updateMany(update);
    if (updated.count === 0) {
      const existing = await tx.locationTier.findUnique({
        where: { location },
      });
      if (!existing) {
        try {
          await tx.locationTier.create({
            data: { location, tier: storedTier, editVersion: version },
          });
        } catch (error) {
          if (!isUniqueConstraint(error)) throw error;
          await tx.locationTier.updateMany(update);
        }
      }
    }

    const current = await tx.locationTier.findUniqueOrThrow({
      where: { location },
    });
    return {
      tier: isTier(current.tier) ? current.tier : null,
      editVersion: Number(current.editVersion),
      accepted:
        current.editVersion === version && current.tier === storedTier,
    };
  });
}

export class TierListConflictError extends Error {
  constructor() {
    super("This tier list changed in another tab. Reload it and try again.");
  }
}

export async function replaceTierList(
  kind: TierListKind,
  action: TierListAction,
  editVersion: number,
): Promise<TierListReplacement> {
  const version = BigInt(editVersion);
  const assignments =
    action === "import-community" ? communityTierAssignments(kind) : [];

  return prisma.$transaction(async (tx) => {
    const list = await tx.tierListState.findUnique({ where: { id: kind } });
    const latest =
      kind === "companies"
        ? await tx.companyTier.aggregate({ _max: { editVersion: true } })
        : await tx.locationTier.aggregate({ _max: { editVersion: true } });
    if (
      version <= (list?.editVersion ?? BigInt(0)) ||
      version <= (latest._max.editVersion ?? BigInt(0))
    ) {
      throw new TierListConflictError();
    }

    if (kind === "companies") {
      await tx.companyTier.deleteMany();
      if (assignments.length) {
        await tx.companyTier.createMany({
          data: assignments.map(({ key, tier }) => ({
            company: canonicalCompanyName(key),
            tier,
            editVersion: version,
          })),
        });
      }
    } else {
      await tx.locationTier.deleteMany();
      if (assignments.length) {
        await tx.locationTier.createMany({
          data: assignments.map(({ key, tier }) => ({
            location: key,
            tier,
            editVersion: version,
          })),
        });
      }
    }
    await tx.tierListState.upsert({
      where: { id: kind },
      create: { id: kind, editVersion: version },
      update: { editVersion: version },
    });

    return { listEditVersion: editVersion, assignments };
  });
}
