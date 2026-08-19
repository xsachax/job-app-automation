import { beforeEach, describe, expect, it } from "vitest";
import { dedupeStoredCompanyNames } from "../lib/company-dedup";
import { canonicalCompanyName } from "../lib/company-names";
import { prisma } from "../lib/db";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("canonicalCompanyName", () => {
  it("collapses curated brand and legal-entity aliases", () => {
    expect(canonicalCompanyName("Nvidia")).toBe("NVIDIA");
    expect(canonicalCompanyName("Cursor (Anysphere)")).toBe("Cursor");
    expect(canonicalCompanyName("Uber Technologies, Inc.")).toBe("Uber");
    expect(canonicalCompanyName("Citadel Securities")).toBe("Citadel");
    expect(canonicalCompanyName("Twitch Interactive, Inc.")).toBe("Twitch");
    expect(canonicalCompanyName("General Dynamics Mission Systems")).toBe(
      "General Dynamics",
    );
    expect(canonicalCompanyName("Akuna Capital University")).toBe(
      "Akuna Capital",
    );
  });

  it("does not merge similar but distinct companies", () => {
    expect(canonicalCompanyName("Artera Technologies")).toBe(
      "Artera Technologies",
    );
    expect(canonicalCompanyName("Toyota Research Institute")).toBe(
      "Toyota Research Institute",
    );
    expect(canonicalCompanyName("Hewlett Packard Enterprise")).toBe(
      "Hewlett Packard Enterprise",
    );
  });
});

describe("dedupeStoredCompanyNames", () => {
  it("canonicalizes jobs and keeps the newest conflicting tier", async () => {
    await prisma.job.createMany({
      data: [
        {
          dedupeKey: "alias-nvidia",
          title: "Software Engineer",
          company: "Nvidia",
          applyUrl: "https://example.com/nvidia-1",
        },
        {
          dedupeKey: "canonical-nvidia",
          title: "Systems Engineer",
          company: "NVIDIA",
          applyUrl: "https://example.com/nvidia-2",
        },
      ],
    });
    await prisma.companyTier.createMany({
      data: [
        {
          company: "Citadel",
          tier: "E",
          editVersion: 10,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          company: "Citadel Securities",
          tier: "C",
          editVersion: 20,
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        },
      ],
    });

    const result = await dedupeStoredCompanyNames();

    expect(result.jobsUpdated).toBe(1);
    expect(
      await prisma.job.groupBy({
        by: ["company"],
        _count: { _all: true },
      }),
    ).toEqual([
      expect.objectContaining({
        company: "NVIDIA",
        _count: { _all: 2 },
      }),
    ]);
    expect(await prisma.companyTier.findMany()).toEqual([
      expect.objectContaining({
        company: "Citadel",
        tier: "C",
        editVersion: BigInt(20),
      }),
    ]);
  });
});
