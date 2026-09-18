import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Tier } from "../lib/tiers";

const boards = [
  {
    kind: "companies",
    field: "company",
    path: "/tiers",
    endpoint: "/api/tiers",
    anchor: "OpenAI",
    newEntry: "Airbnb",
    count: 220,
  },
  {
    kind: "locations",
    field: "location",
    path: "/location-tiers",
    endpoint: "/api/location-tiers",
    anchor: "San Francisco, CA",
    newEntry: "Vancouver, BC",
    count: 60,
  },
] as const;
type Board = (typeof boards)[number];

interface Row {
  company?: string;
  location?: string;
  tier: Tier | null;
  editVersion: number;
  count: number;
}

async function readBoard(request: APIRequestContext, board: Board) {
  const response = await request.get(board.endpoint);
  expect(response.ok()).toBe(true);
  const data: { companies?: Row[]; locations?: Row[]; listEditVersion: number } =
    await response.json();
  const rows = data[board.kind];
  if (!rows) throw new Error(`Missing ${board.kind} response`);
  return { rows, listEditVersion: data.listEditVersion };
}

async function nextVersion(request: APIRequestContext, board: Board) {
  const data = await readBoard(request, board);
  return Math.max(
    Date.now() * 1000,
    data.listEditVersion,
    ...data.rows.map((row) => row.editVersion),
  ) + 1000;
}

function chip(page: Page, key: string) {
  return page.locator(`[data-testid="tier-chip"][data-key="${key}"]`);
}

let original: { board: Board; rows: Row[] }[];

test.beforeEach(async ({ request }) => {
  original = [];
  for (const board of boards) {
    original.push({
      board,
      rows: (await readBoard(request, board)).rows.filter((row) => row.tier),
    });
  }
});

test.afterEach(async ({ request, baseURL }) => {
  if (!baseURL) throw new Error("A local test server is required");
  for (const { board, rows } of original) {
    let editVersion = await nextVersion(request, board);
    const cleared = await request.post(board.endpoint, {
      headers: { origin: new URL(baseURL).origin },
      data: { action: "clear", editVersion },
    });
    expect(cleared.ok()).toBe(true);
    for (const row of rows) {
      const restored = await request.put(board.endpoint, {
        data: { [board.field]: row[board.field], tier: row.tier, editVersion: ++editVersion },
      });
      expect(restored.ok()).toBe(true);
      expect(await restored.json()).toMatchObject({ accepted: true });
    }
  }
});

for (const board of boards) {
  test.describe(`${board.kind} community controls`, () => {
    test("canceling either confirmation leaves saved rankings unchanged", async ({ page, request }) => {
      const before = await readBoard(request, board);
      await page.goto(board.path);
      await expect(page.getByRole("region", { name: "Community rankings" })).toBeVisible();
      page.on("dialog", (dialog) => void dialog.dismiss());
      await page.getByRole("button", { name: "Import community rankings" }).click();
      await page.getByRole("button", { name: "Clear tier list" }).click();
      expect(await readBoard(request, board)).toEqual(before);
    });

    test("confirmed import replaces just this board, survives reload, and remains editable", async ({ page, request }) => {
      const other = boards.find((candidate) => candidate.kind !== board.kind)!;
      const otherBefore = await readBoard(request, other);
      let editVersion = await nextVersion(request, board);
      await request.put(board.endpoint, {
        data: { [board.field]: board.anchor, tier: "F", editVersion },
      });
      await request.put(board.endpoint, {
        data: { [board.field]: "Personal-only entry", tier: "A", editVersion: ++editVersion },
      });
      await page.goto(board.path);
      await expect(chip(page, board.anchor).getByTestId("tier-select")).toHaveValue("F");
      page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("Replace all rankings");
        void dialog.accept();
      });
      await page.getByRole("button", { name: "Import community rankings" }).click();
      await expect(page.getByRole("status")).toContainText(
        `Imported Community rankings: ${board.count} ${board.kind} ranked.`,
      );
      await page.reload();
      await expect(chip(page, "Personal-only entry")).toHaveCount(0);
      await expect(chip(page, board.anchor).getByTestId("tier-select")).toHaveValue("S");
      await expect(chip(page, board.newEntry)).toHaveAttribute("title", "0 open roles");
      expect((await readBoard(request, board)).rows.filter((row) => row.tier)).toHaveLength(board.count);
      expect(await readBoard(request, other)).toEqual(otherBefore);

      await chip(page, board.anchor).getByTestId("tier-select").selectOption("C");
      await expect(page.getByTestId("tier-save-status")).toHaveText("All tiers saved");
      await page.reload();
      await expect(chip(page, board.anchor).getByTestId("tier-select")).toHaveValue("C");
    });

    test("confirmed clearing persists and leaves the other board alone", async ({ page, request }) => {
      const other = boards.find((candidate) => candidate.kind !== board.kind)!;
      const otherBefore = await readBoard(request, other);
      await page.goto(board.path);
      page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("Clear all rankings");
        void dialog.accept();
      });
      await page.getByRole("button", { name: "Clear tier list" }).click();
      await expect(page.getByRole("status")).toContainText("cleared.");
      await page.reload();
      for (const tier of ["S", "A", "B", "C", "D", "E", "F"]) {
        await expect(page.getByTestId(`tier-row-${tier}`).getByTestId("tier-chip")).toHaveCount(0);
      }
      await expect(chip(page, board.anchor).getByTestId("tier-select")).toHaveValue("");
      await expect(page.getByRole("button", { name: "Clear tier list" })).toBeDisabled();
      expect(await readBoard(request, other)).toEqual(otherBefore);
    });
  });
}

test("a failed import reports the error without clearing the visible board", async ({ page }) => {
  await page.route("**/api/tiers", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, json: { error: "Storage is unavailable" } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/tiers");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Import community rankings" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not import community rankings" }),
  ).toContainText("Storage is unavailable");
  await expect(chip(page, "OpenAI").getByTestId("tier-select")).toHaveValue("S");
  await expect(page.getByRole("button", { name: "Import community rankings" })).toBeEnabled();
});

test("an import finishing after navigation adds its new entries to the remounted board", async ({ page }) => {
  let release = () => {};
  let markStarted = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  await page.route("**/api/tiers", async (route) => {
    if (route.request().method() === "POST") {
      markStarted();
      await held;
    }
    await route.continue();
  });
  try {
    await page.goto("/tiers");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Import community rankings" }).click();
    await started;
    await page.getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await page.getByRole("link", { name: "Company tiers", exact: true }).click();
    await expect(page.getByTestId("tier-save-status")).toHaveText("Saving tiers\u2026");
    release();
    await expect(chip(page, "Airbnb").getByTestId("tier-select")).toHaveValue("S");
    await expect(page.getByTestId("tier-save-status")).toHaveText("All tiers saved");
  } finally {
    release();
  }
});

test("an old in-flight edit cannot resurrect a ranking after another tab clears the board", async ({ page, context }) => {
  let release = () => {};
  let markStarted = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let heldOnce = false;
  await page.route("**/api/tiers", async (route) => {
    if (route.request().method() === "PUT" && !heldOnce) {
      heldOnce = true;
      markStarted();
      await held;
    }
    await route.continue();
  });
  const newerTab = await context.newPage();
  try {
    await page.goto("/tiers");
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("B");
    await started;
    await newerTab.goto("/tiers");
    newerTab.once("dialog", (dialog) => void dialog.accept());
    await newerTab.getByRole("button", { name: "Clear tier list" }).click();
    await expect(newerTab.getByRole("status")).toContainText("cleared.");
    release();
    await expect(page.getByTestId("tier-save-status")).toHaveText("All tiers saved");
    await page.reload();
    await expect(chip(page, "AcmeE2E").getByTestId("tier-select")).toHaveValue("");
    await chip(page, "AcmeE2E").getByTestId("tier-select").selectOption("A");
    await expect(page.getByTestId("tier-save-status")).toHaveText("All tiers saved");
    await page.reload();
    await expect(chip(page, "AcmeE2E").getByTestId("tier-select")).toHaveValue("A");
  } finally {
    release();
    await newerTab.close();
  }
});
