import { vi } from "vitest";
import { prisma } from "../lib/db";

// Wipe all data between DB-backed tests (FK-safe order).
export async function resetDb() {
  await prisma.discoveryJobSighting.deleteMany();
  await prisma.discoverySourceRun.deleteMany();
  await prisma.discoverySource.deleteMany();
  await prisma.jobSighting.deleteMany();
  await prisma.application.deleteMany();
  await prisma.match.deleteMany();
  await prisma.job.deleteMany();
  await prisma.source.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.resumeAsset.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.criteria.deleteMany();
}

// Build a minimal Response-like object for a mocked fetch.
export function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

// Replace global.fetch with a stub that returns `body` for any URL.
export function mockFetchJson(body: unknown) {
  const fn = vi.fn(async () => jsonResponse(body));
  vi.stubGlobal("fetch", fn);
  return fn;
}
