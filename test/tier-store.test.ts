import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import {
  parseTierEditVersion,
  saveCompanyTier,
  saveLocationTier,
} from "../lib/tier-store";

afterEach(async () => {
  await Promise.all([
    prisma.companyTier.deleteMany({
      where: { company: { startsWith: "VersionedTierTest" } },
    }),
    prisma.locationTier.deleteMany({
      where: { location: { startsWith: "VersionedTierTest" } },
    }),
  ]);
});

describe("versioned tier persistence", () => {
  it("rejects stale company writes and keeps clear tombstones", async () => {
    await saveCompanyTier("VersionedTierTest Co", "A", 200);
    expect(
      await saveCompanyTier("VersionedTierTest Co", "B", 100),
    ).toMatchObject({ tier: "A", editVersion: 200, accepted: false });

    expect(
      await saveCompanyTier("VersionedTierTest Co", null, 300),
    ).toMatchObject({ tier: null, editVersion: 300, accepted: true });
    expect(
      await saveCompanyTier("VersionedTierTest Co", "S", 250),
    ).toMatchObject({ tier: null, editVersion: 300, accepted: false });

    const row = await prisma.companyTier.findUniqueOrThrow({
      where: { company: "VersionedTierTest Co" },
    });
    expect(row.tier).toBe("");
  });

  it("rejects stale location writes", async () => {
    await saveLocationTier("VersionedTierTest City", "C", 500);
    expect(
      await saveLocationTier("VersionedTierTest City", "F", 499),
    ).toMatchObject({ tier: "C", editVersion: 500, accepted: false });
  });

  it("accepts only positive safe integer versions", () => {
    expect(parseTierEditVersion(1)).toBe(1);
    expect(parseTierEditVersion(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(parseTierEditVersion(0)).toBeNull();
    expect(parseTierEditVersion(1.5)).toBeNull();
    expect(parseTierEditVersion("100")).toBeNull();
  });
});
