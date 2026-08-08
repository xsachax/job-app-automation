import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import {
  calculateDiscoveryRefreshAvailability,
  DISCOVERY_REFRESH_COOLDOWN_MS,
  DiscoveryRefreshCooldownError,
  getDiscoveryRefreshAvailability,
  reserveDiscoveryRefreshStart,
} from "../lib/discovery/refresh";

beforeEach(async () => {
  await prisma.discoveryRunState.deleteMany();
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
