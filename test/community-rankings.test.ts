import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as community from "../lib/community-rankings";
import { prisma } from "../lib/db";
import { normalizeLocationKey } from "../lib/locations";
import {
  replaceTierList,
  saveCompanyTier,
  saveLocationTier,
} from "../lib/tier-store";
import { normalizeCompanyKey, TIERS } from "../lib/tiers";
import * as companyRoute from "../app/api/tiers/route";
import * as locationRoute from "../app/api/location-tiers/route";
import { resetDb } from "./helpers";

const boards = [
  {
    kind: "companies",
    field: "company",
    route: companyRoute,
    save: saveCompanyTier,
    sample: "Airbnb",
    count: 220,
  },
  {
    kind: "locations",
    field: "location",
    route: locationRoute,
    save: saveLocationTier,
    sample: "Vancouver, BC",
    count: 60,
  },
] as const;

function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/tiers", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

async function clearTiers() {
  await prisma.companyTier.deleteMany();
  await prisma.locationTier.deleteMany();
  await prisma.tierListState.deleteMany();
}

beforeEach(async () => {
  await resetDb();
  await clearTiers();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await clearTiers();
});

describe("bundled community rankings", () => {
  it("contains only a versioned, dated ranking snapshot", () => {
    expect(Object.keys(community.COMMUNITY_RANKINGS).sort()).toEqual([
      "capturedAt", "companies", "formatVersion", "label", "locations",
    ]);
    expect(community.COMMUNITY_RANKINGS.formatVersion).toBe(1);
    expect(community.COMMUNITY_RANKINGS.label).toBe("Community rankings");
    expect(community.COMMUNITY_RANKINGS.capturedAt).toMatch(/^2026-09-18T/);
    for (const { kind, count } of boards) {
      expect(Object.keys(community.COMMUNITY_RANKINGS[kind])).toEqual(TIERS);
      const assignments = community.communityTierAssignments(kind);
      expect(assignments).toHaveLength(count);
      const normalize = kind === "companies" ? normalizeCompanyKey : normalizeLocationKey;
      expect(new Set(assignments.map(({ key }) => normalize(key))).size).toBe(count);
      expect(assignments.every(({ key }) => key.trim() === key && key.length > 0)).toBe(true);
    }
  });
});

for (const board of boards) {
  describe(`${board.kind} community import and clearing`, () => {
    it("replaces the selected board and displays every preset entry before discovery", async () => {
      await saveCompanyTier("Personal company", "F", 10);
      await saveLocationTier("Personal location", "F", 10);
      const response = await board.route.POST(
        request({ action: "import-community", editVersion: 20 }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        listEditVersion: 20,
        assignments: community.communityTierAssignments(board.kind),
      });

      const data = await (await board.route.GET()).json();
      expect(data.listEditVersion).toBe(20);
      expect(data[board.kind]).toHaveLength(board.count);
      expect(data[board.kind]).toContainEqual({
        [board.field]: board.sample,
        tier: "S",
        count: 0,
        editVersion: 20,
      });
      expect(data[board.kind].every((row: { count: number }) => row.count === 0)).toBe(true);

      const other =
        board.kind === "companies"
          ? await prisma.locationTier.findMany()
          : await prisma.companyTier.findMany();
      expect(other).toHaveLength(1);
      expect(other[0]).toMatchObject({ tier: "F", editVersion: BigInt(10) });
    });

    it("clears saved rankings without deleting jobs, profiles, or the other board", async () => {
      await replaceTierList("companies", "import-community", 10);
      await replaceTierList("locations", "import-community", 10);
      await board.save("No current jobs", "S", 15);
      const job = await prisma.job.create({
        data: {
          dedupeKey: "community-rankings-retained-job",
          title: "Software Engineer",
          company: "Airbnb",
          location: "Vancouver, BC",
          country: "CA",
          isEntryLevel: true,
          applicationStatus: "applied",
          applyUrl: "https://example.test/job",
        },
      });
      await prisma.profile.create({ data: { id: "me", data: '{"name":"Local user"}' } });

      const response = await board.route.POST(
        request({ action: "clear", editVersion: 20 }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ listEditVersion: 20, assignments: [] });
      const data = await (await board.route.GET()).json();
      expect(data[board.kind]).toEqual([{
        [board.field]: board.sample,
        count: 1,
        tier: null,
        editVersion: 20,
      }]);
      expect(
        board.kind === "companies"
          ? await prisma.companyTier.count()
          : await prisma.locationTier.count(),
      ).toBe(0);
      expect(
        board.kind === "companies"
          ? await prisma.locationTier.count()
          : await prisma.companyTier.count(),
      ).toBe(board.kind === "companies" ? 60 : 220);
      expect(await prisma.job.findUnique({ where: { id: job.id } })).toMatchObject({
        applicationStatus: "applied",
      });
      expect(await prisma.profile.findUnique({ where: { id: "me" } })).toMatchObject({
        data: '{"name":"Local user"}',
      });
      expect(community.communityTierAssignments(board.kind)).toHaveLength(board.count);
    });

    it("blocks delayed edits, even for names with no saved row before the clear", async () => {
      await board.save(board.sample, "A", 10);
      await replaceTierList(board.kind, "clear", 30);
      expect(await board.save(board.sample, "S", 20)).toEqual({
        tier: null, editVersion: 30, accepted: false,
      });
      expect(await board.save("Previously unrated", "F", 25)).toEqual({
        tier: null, editVersion: 30, accepted: false,
      });
      expect(await board.save("Previously unrated", "B", 31)).toEqual({
        tier: "B", editVersion: 31, accepted: true,
      });
    });

    it("blocks old edits after import but accepts subsequent personal changes", async () => {
      await replaceTierList(board.kind, "import-community", 30);
      expect(await board.save(board.sample, "F", 20)).toEqual({
        tier: "S", editVersion: 30, accepted: false,
      });
      expect(await board.save(board.sample, "C", 31)).toEqual({
        tier: "C", editVersion: 31, accepted: true,
      });
      await replaceTierList(board.kind, "import-community", 40);
      const data = await (await board.route.GET()).json();
      expect(data[board.kind]).toHaveLength(board.count);
      expect(data[board.kind]).toContainEqual({
        [board.field]: board.sample, tier: "S", count: 0, editVersion: 40,
      });
    });

    it("rejects stale whole-board actions without partially modifying any rankings", async () => {
      await replaceTierList(board.kind, "import-community", 20);
      await board.save(board.sample, "F", 40);
      const before = await (await board.route.GET()).json();
      for (const action of ["clear", "import-community"]) {
        const response = await board.route.POST(request({ action, editVersion: 30 }));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          error: expect.stringContaining("changed in another tab"),
        });
        expect(await (await board.route.GET()).json()).toEqual(before);
      }
    });

    it("retains the board version even when an empty board is cleared again", async () => {
      await replaceTierList(board.kind, "clear", 20);
      await replaceTierList(board.kind, "clear", 30);
      const response = await board.route.POST(
        request({ action: "import-community", editVersion: 25 }),
      );
      expect(response.status).toBe(409);
      expect(await (await board.route.GET()).json()).toEqual({
        [board.kind]: [], listEditVersion: 30,
      });
    });

    it.each([
      null,
      [],
      {},
      { action: "unknown", editVersion: 20 },
      ...[0, -1, 1.5, "20", null, Number.MAX_SAFE_INTEGER + 1].map((editVersion) => ({
        action: "clear", editVersion,
      })),
    ])("rejects invalid input without clearing tiers: %j", async (body) => {
      await board.save(board.sample, "S", 10);
      const response = await board.route.POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
      expect((await (await board.route.GET()).json())[board.kind]).toHaveLength(1);
    });

    it("rejects malformed JSON and cross-origin actions", async () => {
      const malformed = new NextRequest("http://localhost:3000/api/tiers", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: "{",
      });
      expect((await board.route.POST(malformed)).status).toBe(400);
      expect((await board.route.POST(request(
        { action: "clear", editVersion: 20 },
        "https://unrelated.example",
      ))).status).toBe(403);
    });
  });
}

it("rolls back the whole import if saving the snapshot fails", async () => {
  await saveCompanyTier("Personal company", "A", 10);
  vi.spyOn(community, "communityTierAssignments").mockReturnValueOnce([
    { key: "Duplicate", tier: "S" },
    { key: "Duplicate", tier: "F" },
  ]);
  const response = await companyRoute.POST(
    request({ action: "import-community", editVersion: 20 }),
  );
  expect(response.status).toBe(500);
  expect(await prisma.companyTier.findMany()).toEqual([
    expect.objectContaining({ company: "Personal company", tier: "A", editVersion: BigInt(10) }),
  ]);
  expect(await prisma.tierListState.count()).toBe(0);
});
