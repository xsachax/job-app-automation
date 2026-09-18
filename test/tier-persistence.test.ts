import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TierPersistenceController } from "../app/components/tierPersistenceController";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function mockSaves(assignments = [{ key: "Community company", tier: "S" }]) {
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    return Response.json(
      options?.method === "POST"
        ? { listEditVersion: body.editVersion, assignments: body.action === "clear" ? [] : assignments }
        : { tier: body.tier, editVersion: body.editVersion, accepted: true },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("whole-board tier persistence", () => {
  it("imports new names, clears personal-only names, and allows a later manual edit", async () => {
    const fetchMock = mockSaves();
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.hydrate([{ key: "Personal company", tier: "F", editVersion: 10 }]);
    const imported = await controller.replace("import-community");
    expect(controller.effective("Community company")).toEqual({
      tier: "S", editVersion: imported.listEditVersion,
    });
    expect(controller.effective("Personal company")).toEqual({
      tier: null, editVersion: imported.listEditVersion,
    });
    expect(controller.rankedRecords()).toEqual([{
      key: "Community company", tier: "S", editVersion: imported.listEditVersion,
    }]);
    controller.assign("Community company", "A");
    await controller.saveNow();
    expect(controller.effective("Community company").tier).toBe("A");
    expect(controller.effective("Community company").editVersion).toBeGreaterThan(imported.listEditVersion);
    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual(["POST", "PUT"]);
  });

  it("waits for an in-flight edit before replacing the board", async () => {
    let release: (response: Response) => void = () => {};
    const held = new Promise<Response>((resolve) => { release = resolve; });
    const fetchMock = mockSaves();
    fetchMock.mockImplementationOnce(() => held);
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.assign("Personal company", "A");
    const replacing = controller.replace("clear");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
    release(Response.json({ tier: sent.tier, editVersion: sent.editVersion }));
    await replacing;
    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual(["PUT", "POST"]);
    expect(controller.effective("Personal company").tier).toBeNull();
    expect(controller.status).toBe("saved");
    expect(localStorage.length).toBe(0);
  });

  it("does not import when pending edits cannot be saved", async () => {
    const fetchMock = mockSaves();
    fetchMock.mockRejectedValue(new Error("offline"));
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.assign("Personal company", "B");
    await expect(controller.replace("import-community")).rejects.toThrow("offline");
    expect(fetchMock.mock.calls.every(([, options]) => options?.method === "PUT")).toBe(true);
    expect(controller.effective("Personal company").tier).toBe("B");
    expect(controller.status).toBe("error");
    expect(localStorage.length).toBeGreaterThan(0);
  });

  it("does not optimistically clear a board when the server rejects the action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ error: "Tiers changed in another tab" }, { status: 409 }),
    ));
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.hydrate([{ key: "Personal company", tier: "S", editVersion: 10 }]);
    await expect(controller.replace("clear")).rejects.toThrow("changed in another tab");
    expect(controller.effective("Personal company")).toEqual({ tier: "S", editVersion: 10 });
  });

  it("rejects malformed replacement responses without discarding saved tiers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ assignments: [] })));
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.hydrate([{ key: "Personal company", tier: "S", editVersion: 10 }]);
    await expect(controller.replace("clear")).rejects.toThrow("invalid tier list response");
    expect(controller.effective("Personal company").tier).toBe("S");
  });

  it("uses observed server versions even when the local clock is behind", async () => {
    const fetchMock = mockSaves();
    const controller = TierPersistenceController.create("/api/tiers", "company");
    const futureVersion = Date.now() * 1000 + 1_000_000;
    controller.hydrate([{ key: "Personal company", tier: "S", editVersion: futureVersion }]);
    controller.assign("Personal company", "A");
    await controller.saveNow();
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.editVersion).toBeGreaterThan(futureVersion);
  });

  it("prunes older drafts for names absent from a cleared board, including after remount", async () => {
    const fetchMock = mockSaves();
    const controller = TierPersistenceController.create("/api/tiers", "company");
    const cleared = await controller.replace("clear");
    localStorage.setItem("job-pipeline-tier-draft-v1:%2Fapi%2Ftiers:old-tab", JSON.stringify({
      edits: { "Previously unrated": { tier: "S", editVersion: cleared.listEditVersion - 1 } },
    }));
    const remounted = TierPersistenceController.create("/api/tiers", "company");
    remounted.hydrate([], cleared.listEditVersion);
    await remounted.saveNow();
    expect(remounted.effective("Previously unrated")).toEqual({
      tier: null, editVersion: cleared.listEditVersion,
    });
    expect(localStorage.length).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a superseded save error when a newer board version is loaded", async () => {
    mockSaves().mockRejectedValue(new Error("offline"));
    const controller = TierPersistenceController.create("/api/tiers", "company");
    controller.assign("Personal company", "A");
    await expect(controller.saveNow()).rejects.toThrow("offline");
    expect(controller.status).toBe("error");
    const newerVersion = controller.effective("Personal company").editVersion + 1;
    controller.hydrate([], newerVersion);
    expect(controller.rankedRecords()).toEqual([]);
    expect(controller.status).toBe("saved");
    expect(controller.error).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
