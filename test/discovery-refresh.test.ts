import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/db";
import { saveProfile } from "../lib/settings";
import { saveJudgeProviderSettings } from "../lib/judge/provider-settings";
import {
  calculateDiscoveryRefreshAvailability,
  DISCOVERY_REFRESH_COOLDOWN_MS,
  DiscoveryRefreshCooldownError,
  getDiscoveryRefreshAvailability,
  reserveDiscoveryRefreshStart,
  scoreNewDiscoveryJobs,
} from "../lib/discovery/refresh";

beforeEach(async () => {
  await prisma.discoveryJobSighting.deleteMany();
  await prisma.job.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.judgeProviderSettings.deleteMany();
  await prisma.discoveryRunState.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discovery refresh cooldown", () => {
  it("allows the first run and unlocks exactly two hours after the last start", () => {
    const startedAt = new Date("2026-08-08T01:00:00.000Z");
    expect(
      calculateDiscoveryRefreshAvailability(
        startedAt,
        startedAt.getTime() + DISCOVERY_REFRESH_COOLDOWN_MS - 1,
      ),
    ).toMatchObject({
      canRun: false,
      cooldownRemainingMs: 1,
      lastStartedAt: startedAt.toISOString(),
      nextAllowedAt: "2026-08-08T03:00:00.000Z",
    });

    expect(
      calculateDiscoveryRefreshAvailability(
        startedAt,
        startedAt.getTime() + DISCOVERY_REFRESH_COOLDOWN_MS,
      ).canRun,
    ).toBe(true);
    expect(calculateDiscoveryRefreshAvailability(null).canRun).toBe(true);
  });

  it("persists the reservation and rejects another start during the cooldown", async () => {
    const startedAt = new Date("2026-08-08T01:00:00.000Z");
    await reserveDiscoveryRefreshStart(startedAt);

    await expect(
      reserveDiscoveryRefreshStart(new Date("2026-08-08T02:59:59.999Z")),
    ).rejects.toBeInstanceOf(DiscoveryRefreshCooldownError);
    await expect(
      getDiscoveryRefreshAvailability(
        startedAt.getTime() + DISCOVERY_REFRESH_COOLDOWN_MS - 1,
      ),
    ).resolves.toMatchObject({
      canRun: false,
      cooldownRemainingMs: 1,
      nextAllowedAt: "2026-08-08T03:00:00.000Z",
    });

    await expect(
      reserveDiscoveryRefreshStart(new Date("2026-08-08T03:00:00.000Z")),
    ).resolves.toMatchObject({
      canRun: false,
      cooldownRemainingMs: DISCOVERY_REFRESH_COOLDOWN_MS,
    });
  });
});

describe("discovery refresh Judge mode", () => {
  it("scores new jobs deterministically without calling a configured external provider", async () => {
    await saveProfile({
      skills: ["TypeScript"],
      targetRoles: ["Software Engineer"],
    });
    await saveJudgeProviderSettings({
      provider: "openai",
      model: "gpt-test",
      apiKey: "sk-openai-discovery-test",
    });
    const job = await prisma.job.create({
      data: {
        dedupeKey: "discovery-judge-mode",
        title: "Software Engineer I",
        company: "Acme",
        applyUrl: "https://example.test/jobs/1",
        description: "Build TypeScript services.",
        skills: JSON.stringify(["TypeScript"]),
        country: "US",
        isEntryLevel: true,
      },
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("external provider should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoreNewDiscoveryJobs();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: "deterministic",
      scored: 1,
      enhancedScored: 0,
    });
    expect(
      await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      fitProvider: "deterministic",
    });
  });
});
