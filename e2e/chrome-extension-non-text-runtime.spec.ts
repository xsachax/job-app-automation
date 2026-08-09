import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  launchUnpackedExtension,
  openPopupForPage,
  type UnpackedExtensionRuntime,
} from "./helpers/unpacked-extension-harness";

const dashboardUrl = "http://127.0.0.1:3210/jobs";

interface RuntimeProgress {
  filledByExtension: number;
  needsAttention: number;
  unknownFields: {
    label: string;
    reason: string;
    status?: string;
  }[];
}

interface RuntimeState {
  session?: {
    progress: RuntimeProgress;
  };
}

interface FixtureState {
  documentShadowOptionClicks: number;
  events: { type: string; target: string; value: string }[];
  identityOptionClicks: number;
  model: Record<string, string | boolean>;
  replacements: Record<string, number>;
  searchQueries: Record<string, string[]>;
  unrelatedOptionClicks: number;
  shadowOptionClicks: number;
  staleOptionClicks: number;
  submitClicks: number;
}

const profile = {
  firstName: "Runtime",
  lastName: "Applicant",
  email: "runtime@example.com",
  homeCity: "New York",
  homeRegion: "NY",
  homeCountry: "United States",
  usCountry: "United States",
  usLocation: "New York, NY",
  school: "University of Ottawa",
  degree: "Bachelor's degree",
  fieldOfStudy: "Computer Science",
  educationStartDate: "2017-09",
  graduationDate: "2021-05",
  workExperiences: [
    {
      company: "Example",
      title: "Engineer",
      location: "New York",
      startDate: "2023-07",
      endDate: "",
      currentRole: true,
      description: "",
    },
  ],
  heardAboutJob: "LinkedIn",
  availableStartDate: "2026-09-15",
  usWorkAuthorized: true,
  usRequiresSponsorship: false,
  isAtLeast18: true,
  canPerformEssentialFunctions: true,
  gender: "",
  raceEthnicity: "White",
  veteranStatus: "Not a protected veteran",
};

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The reactive ATS fixture did not return a port."));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

async function startFixtureServer(): Promise<{
  server: Server;
  origin: string;
}> {
  const html = await readFile(
    resolve(process.cwd(), "e2e/fixtures/runtime/reactive-ats.html"),
    "utf8",
  );
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(html);
  });
  const port = await listen(server);
  return { server, origin: `http://ats.test:${port}` };
}

function runtimeJob(applicationUrl: string) {
  const timestamp = "2026-08-08T12:00:00.000Z";
  return {
    id: "offline-reactive-ats",
    title: "Offline Reactive ATS Engineer",
    company: "Offline ATS",
    location: "New York, NY",
    applyUrl: applicationUrl,
    atsType: "ashby",
    isWorkday: false,
    remote: false,
    country: "US",
    category: "software-engineering",
    minYoE: 0,
    discoverySystem: "fixture",
    postedAt: timestamp,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    availabilityStatus: "open",
    consecutiveMisses: 0,
    lastVerifiedAt: timestamp,
    lastVerificationResult: "open",
    closedAt: null,
    closureReason: null,
    applicationStatus: "none",
    appliedAt: null,
    fitScore: 100,
    fitProvider: "deterministic",
    fitSummary: "Offline extension fixture",
    fitReasons: [],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryRaw: null,
    sponsorship: "offers",
    skills: ["JavaScript"],
    employmentType: "fulltime",
    connections: { count: 0, contacts: [] },
    sightings: [],
  };
}

async function installDashboardRoutes(
  context: BrowserContext,
  applicationUrl: string,
  savedProfile: Record<string, unknown> = profile,
) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        brands: [
          { brand: "Chromium", version: "140" },
          { brand: "Google Chrome", version: "140" },
        ],
      },
    });
  });
  await context.route("http://127.0.0.1:3210/api/jobs?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([runtimeJob(applicationUrl)]),
    }),
  );
  await context.route("http://127.0.0.1:3210/api/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(savedProfile),
    }),
  );
  await context.route(
    "http://127.0.0.1:3210/api/profile/resume",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "X-Resume-Filename": "runtime-resume.pdf" },
        body: Buffer.from("%PDF-1.4\n%%EOF\n"),
      }),
  );
  await context.route(
    "http://127.0.0.1:3210/api/location-tiers",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          locations: [
            { location: "New York, NY", tier: "A" },
            { location: "Toronto, ON", tier: "B" },
          ],
        }),
      }),
  );
}

async function launchFromDashboard(
  runtime: UnpackedExtensionRuntime,
  applicationUrl: string,
  savedProfile: Record<string, unknown> = profile,
): Promise<Page> {
  await installDashboardRoutes(runtime.context, applicationUrl, savedProfile);
  const dashboard = runtime.context.pages()[0] ?? (await runtime.context.newPage());
  await dashboard.goto(dashboardUrl);
  await expect(
    dashboard.getByText("Chrome autofill is ready.", { exact: false }),
  ).toBeVisible();
  const applicationPromise = runtime.context.waitForEvent("page", {
    predicate: (page) => page.url().startsWith(applicationUrl),
  });
  await dashboard
    .getByText("Offline Reactive ATS Engineer", { exact: true })
    .locator("xpath=ancestor::article")
    .getByRole("link", { name: "Open ↗", exact: true })
    .click();
  const application = await applicationPromise;
  await application.waitForLoadState("domcontentloaded");
  await application
    .locator("#job-autofill-extension-panel")
    .waitFor({ timeout: 10_000 });
  return application;
}

async function extensionState(
  popup: Page,
  applicationUrl: string,
): Promise<RuntimeState> {
  return popup.evaluate(async (url) => {
    const chromeApi = (
      globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage(message: unknown): Promise<RuntimeState>;
          };
          tabs: {
            query(queryInfo: object): Promise<{ id?: number; url?: string }[]>;
          };
        };
      }
    ).chrome;
    const tabs = await chromeApi.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
    if (!tab?.id) {
      throw new Error("The reactive ATS application tab was not found.");
    }
    return chromeApi.runtime.sendMessage({
      type: "JOB_AUTOFILL_GET_STATE",
      tabId: tab.id,
    });
  }, applicationUrl);
}

function eventsFor(state: FixtureState, target: string): string[] {
  return state.events
    .filter((event) => event.target === target)
    .map((event) => event.type);
}

test.describe("unpacked extension non-text runtime", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test("fills the reactive ATS through the app, background, content script, and popup UI", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=fill`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await expect(popup.locator("[data-fill]")).toBeEnabled();
      await popup.locator("[data-fill]").click();
      await expect(popup.locator("[data-notice]")).toContainText(
        /^Filled \d+ fields?\. Review the page\.$/,
        { timeout: 30_000 },
      );

      await expect(application.locator("#native-city")).toHaveValue("ny");
      await expect(application.locator("#native-country")).toHaveValue("us");
      await expect(application.locator("#native-region")).toHaveValue("NY");
      await expect(application.locator("#native-school")).toHaveValue("uottawa");
      await expect(application.locator("#native-degree")).toHaveValue("bachelors");
      await expect(application.locator("#native-source")).toHaveValue("linkedin");
      await expect(application.locator("#preserved-country")).toHaveValue("ca");

      await expect(
        application
          .locator("#greenhouse-country")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("United States");
      await expect(
        application
          .locator("#greenhouse-location")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("New York, NY");
      await expect(
        application
          .locator("#greenhouse-sponsorship")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("No");
      await expect(
        application
          .locator("#greenhouse-source")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("LinkedIn");
      await expect(application.locator("#greenhouse-country")).toHaveValue("");
      await expect(application.locator("#greenhouse-country")).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      await expect(application.locator("#authorized-yes")).toBeChecked();
      await expect(application.locator("#sponsorship-no")).toBeChecked();
      await expect(application.locator('[name="gender"]:checked')).toHaveCount(0);
      await expect(application.locator("#age-yes")).toHaveAttribute(
        "aria-checked",
        "true",
      );

      await expect(application.locator("#office-new-york")).toBeChecked();
      await expect(application.locator("#office-toronto")).toBeChecked();
      await expect(application.locator("#office-austin")).not.toBeChecked();
      await expect(application.locator("#essential-functions")).toBeChecked();
      await expect(application.locator("#legal-certification")).not.toBeChecked();

      await expect(application.locator("#available-start-date")).toHaveValue(
        "2026-09-15",
      );
      await expect(application.locator("#graduation-date")).toHaveValue("2021-05");
      await expect(application.locator("#work-start-month")).toHaveValue("July");
      await expect(application.locator("#work-start-year")).toHaveValue("2023");

      await expect(application.locator("#ashby-school-trigger")).toHaveText(
        "University of Ottawa",
      );
      await expect(application.locator("#ashby-school-value")).toHaveValue(
        "uottawa",
      );
      await expect(application.locator("#workday-region-trigger")).toHaveText(
        "New York",
      );
      await expect(application.locator("#workday-region-value")).toHaveValue("NY");
      expect(
        await application
          .locator("#resume-file")
          .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
      ).toBe("runtime-resume.pdf");
      expect(
        await application
          .locator("#greenhouse-resume")
          .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
      ).toBe("runtime-resume.pdf");

      await expect(application.locator("#optional-native-city")).toHaveValue("");
      await expect(application.locator("#optional-native-source")).toHaveValue("");
      await expect(
        application.locator('[name="optional_authorization"]:checked'),
      ).toHaveCount(0);
      await expect(application.locator("#optional-age-yes")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(application.locator("#optional-office-new-york")).not.toBeChecked();
      await expect(application.locator("#optional-start-date")).toHaveValue("");
      await expect(application.locator("#optional-school-value")).toHaveValue("");
      await expect(application.locator("#optional-greenhouse-country")).toHaveValue(
        "",
      );
      await expect(
        application.locator(
          "#optional-greenhouse-country",
        ).locator(
          "xpath=ancestor::*[contains(@class, 'select__value-container')]",
        ).locator(".select__single-value"),
      ).toHaveCount(0);
      expect(
        await application
          .locator("#optional-file")
          .evaluate((input: HTMLInputElement) => input.files?.length || 0),
      ).toBe(0);
      expect(
        await application
          .locator("#greenhouse-cover-letter")
          .evaluate((input: HTMLInputElement) => input.files?.length || 0),
      ).toBe(0);

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model).toMatchObject({
        "native-city": "ny",
        "native-country": "us",
        "native-region": "NY",
        "native-school": "uottawa",
        "native-degree": "bachelors",
        "native-source": "linkedin",
        "greenhouse-country": "us",
        "greenhouse-location": "new-york",
        "greenhouse-sponsorship": "no",
        "greenhouse-source": "linkedin",
        authorization: "yes",
        sponsorship: "no",
        age: "yes",
        "office-new-york": true,
        "office-toronto": true,
        "office-austin": false,
        "essential-functions": true,
        "available-start-date": "2026-09-15",
        "graduation-date": "2021-05",
        "work-start-month": "July",
        "work-start-year": "2023",
        "ashby-school": "uottawa",
        "workday-region": "NY",
        "resume-file": "runtime-resume.pdf",
        "greenhouse-resume": "runtime-resume.pdf",
      });

      expect(state.replacements).toMatchObject({
        "native-school": 1,
        "native-source": 1,
        "ashby-school-trigger": 1,
        "workday-region-trigger": 1,
        "greenhouse-country": 1,
        "greenhouse-location": 1,
        "greenhouse-sponsorship": 1,
        "greenhouse-source": 1,
      });
      expect(state.replacements["native-degree"]).toBeGreaterThanOrEqual(2);
      expect(eventsFor(state, "native-city")).toEqual(
        expect.arrayContaining(["click", "input", "change", "blur"]),
      );
      expect(eventsFor(state, "authorized-yes")).toEqual(
        expect.arrayContaining(["click", "input", "change"]),
      );
      expect(eventsFor(state, "ashby-school-value")).toEqual(
        expect.arrayContaining(["input", "change"]),
      );
      for (const control of [
        "greenhouse-country",
        "greenhouse-location",
        "greenhouse-sponsorship",
        "greenhouse-source",
      ]) {
        expect(eventsFor(state, control)).toEqual(
          expect.arrayContaining(["click", "input", "change", "blur"]),
        );
      }
      for (const option of [
        "react-select-greenhouse-country-option-0",
        "react-select-greenhouse-location-option-0",
        "react-select-greenhouse-sponsorship-option-1",
        "react-select-greenhouse-source-option-0",
      ]) {
        expect(eventsFor(state, option)).toContain("click");
      }
      expect(eventsFor(state, "greenhouse-resume")).toEqual(
        expect.arrayContaining(["input", "change", "blur"]),
      );
      expect(state.unrelatedOptionClicks).toBe(0);
      expect(state.submitClicks).toBe(0);

      const backgroundState = await extensionState(popup, applicationUrl);
      expect(backgroundState.session?.progress.filledByExtension).toBeGreaterThanOrEqual(
        23,
      );
      expect(
        backgroundState.session?.progress.unknownFields,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: expect.stringMatching(/gender identity/i),
            status: "missing-profile",
          }),
          expect.objectContaining({
            label: expect.stringMatching(/certify under penalty/i),
            status: "manual",
          }),
        ]),
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("chooses exact location, race, and veteran semantics through live controls", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=layer4`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(application.locator("#layer4-native-location")).toHaveValue(
        "loc-correct",
      );
      await expect(
        application
          .locator("#layer4-search-location")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("New York City, New York, United States");
      await expect(application.locator("#layer4-search-location")).toHaveValue("");
      await expect(application.locator("#layer4-search-location")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(application.locator("#layer4-race")).toHaveValue("opaque-white");
      await expect(application.locator("#layer4-veteran-not-protected")).toBeChecked();
      await expect(application.locator("#layer4-veteran-protected")).not.toBeChecked();
      await expect(application.locator("#layer4-veteran-not-veteran")).not.toBeChecked();

      await expect(application.locator("#layer4-optional-location")).toHaveValue("");
      await expect(application.locator("#layer4-optional-race")).toHaveValue("");
      await expect(application.locator("#layer4-optional-veteran")).not.toBeChecked();
      await expect(application.locator("#layer4-ambiguous-race")).toHaveValue("");
      await expect(application.locator("#layer4-ambiguous-race")).toHaveAttribute(
        "data-job-autofill-review",
        "failed",
      );
      await expect(application.locator("#layer4-rejected-veteran")).toHaveValue("");
      await expect(application.locator("#layer4-rejected-veteran")).toHaveAttribute(
        "data-job-autofill-review",
        "failed",
      );

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model).toMatchObject({
        "layer4-native-location": "loc-correct",
        "layer4-search-location": "search-correct",
        "layer4-race": "opaque-white",
        layer4_veteran: "opaque-not-protected",
        "layer4-rejected-veteran": "",
      });
      expect(state.searchQueries["layer4-search-location"]).toEqual(
        expect.arrayContaining(["New York, NY", "New York"]),
      );
      expect(state.replacements["layer4-search-location"]).toBe(1);
      expect(eventsFor(state, "layer4-native-location")).toEqual(
        expect.arrayContaining(["click", "input", "change", "blur"]),
      );
      expect(eventsFor(state, "layer4-race")).toEqual(
        expect.arrayContaining(["click", "input", "change", "blur"]),
      );
      expect(eventsFor(state, "layer4-veteran-not-protected")).toEqual(
        expect.arrayContaining(["click", "input", "change"]),
      );
      expect(
        eventsFor(state, "react-select-layer4-search-location-option-1"),
      ).toContain("click");
      expect(
        eventsFor(state, "react-select-layer4-search-location-option-0"),
      ).not.toContain("click");
      expect(
        eventsFor(state, "react-select-layer4-search-location-option-2"),
      ).not.toContain("click");
      expect(state.unrelatedOptionClicks).toBe(0);
      expect(state.submitClicks).toBe(0);

      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 4,
              needsAttention: 2,
              unknownFields: expect.arrayContaining([
                expect.objectContaining({
                  label: expect.stringMatching(/race.*ethnic identity/i),
                  status: "failed",
                  reason: expect.stringMatching(/unique option/i),
                }),
                expect.objectContaining({
                  label: expect.stringMatching(/protected.*veteran/i),
                  status: "failed",
                  reason: expect.stringMatching(/commit|persist|selected|value/i),
                }),
              ]),
            },
          },
        });
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("leaves blank race and veteran answers manual in the real extension path", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=layer4-blank`;
      const application = await launchFromDashboard(runtime, applicationUrl, {
        ...profile,
        raceEthnicity: "",
        veteranStatus: "",
      });
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(application.locator("#layer4-race")).toHaveValue("");
      await expect(application.locator('[name="layer4_veteran"]:checked')).toHaveCount(
        0,
      );
      await expect(application.locator("#layer4-ambiguous-race")).toHaveValue("");
      await expect(application.locator("#layer4-rejected-veteran")).toHaveValue("");

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(eventsFor(state, "layer4-race")).not.toContain("change");
      expect(eventsFor(state, "layer4-veteran-not-protected")).not.toContain("click");
      expect(state.unrelatedOptionClicks).toBe(0);
      expect(state.submitClicks).toBe(0);

      const backgroundState = await extensionState(popup, applicationUrl);
      const consequential = backgroundState.session?.progress.unknownFields.filter(
        (field) => /race|veteran/i.test(field.label),
      );
      expect(consequential?.length).toBeGreaterThanOrEqual(4);
      expect(consequential?.every((field) => field.status === "manual")).toBe(true);
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("stops a location retry when restoration reveals newer commit evidence", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=layer4-retry-evidence`;
      const application = await launchFromDashboard(runtime, applicationUrl, {
        ...profile,
        raceEthnicity: "",
        veteranStatus: "",
      });
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(
        application
          .locator("#layer4-search-location")
          .locator("xpath=ancestor::*[contains(@class, 'select__value-container')]")
          .locator(".select__single-value"),
      ).toHaveText("User choice");
      await expect(application.locator("#layer4-search-location")).toHaveAttribute(
        "data-value",
        "user-choice",
      );

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model["layer4-search-location"]).toBe("user-choice");
      expect(state.searchQueries["layer4-search-location"]).not.toContain("New York");
      expect(
        eventsFor(state, "react-select-layer4-search-location-option-1"),
      ).not.toContain("click");
      expect(state.unrelatedOptionClicks).toBe(0);
      expect(state.submitClicks).toBe(0);
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("reports a matched control that rejects its committed value as failed", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=failure`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(application.locator("#reverting-source")).toHaveValue("");

      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [
                {
                  label: expect.stringMatching(/how did you hear about us/i),
                  status: "failed",
                  reason: expect.stringMatching(/commit|persist|selected|value/i),
                },
              ],
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 0 fields. Review the page.",
      );

      const initialChangeCount = await application.evaluate(
        () =>
          (
            globalThis as unknown as { __atsHarness: FixtureState }
          ).__atsHarness.events.filter(
            (event) =>
              event.target === "reverting-source" && event.type === "change",
          ).length,
      );
      await popup.locator("[data-fill]").click();
      await expect
        .poll(() =>
          application.evaluate(
            () =>
              (
                globalThis as unknown as { __atsHarness: FixtureState }
              ).__atsHarness.events.filter(
                (event) =>
                  event.target === "reverting-source" &&
                  event.type === "change",
              ).length,
          ),
        )
        .toBeGreaterThan(initialChangeCount);
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [{ status: "failed" }],
            },
          },
        });
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("rejects query-only combobox state and preserves failure across replacement", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=rejected-combo`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      const rejectedSource = application.locator(
        '[data-testid="rejected-source"]',
      );
      await expect(rejectedSource).toHaveValue("");
      await expect(rejectedSource).toHaveAttribute(
        "data-job-autofill-review",
        "failed",
      );

      await expect
        .poll(() =>
          application.evaluate(
            () =>
              (
                globalThis as unknown as { __atsHarness: FixtureState }
              ).__atsHarness.replacements["rejected-source"],
          ),
        )
        .toBe(2);
      await expect(rejectedSource).toHaveAttribute(
        "id",
        "rejected-source-rerendered",
      );
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model["rejected-source"]).toBe("");
      expect(state.model["rejected-source-committed"]).toBe(false);

      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              answered: 0,
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [
                {
                  label: expect.stringMatching(/how did you hear about us/i),
                  status: "failed",
                  reason: expect.stringMatching(/commit|selected|value/i),
                },
              ],
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 0 fields. Review the page.",
      );

      await rejectedSource.fill("Manual choice");
      await rejectedSource.fill("");
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 0,
              readyToFill: 1,
              needsAttention: 0,
            },
          },
        });
      await expect(rejectedSource).not.toHaveAttribute(
        "data-job-autofill-review",
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("stops async option work when a replacement contains newer input", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=replaced-combo`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      const replacedSource = application.locator(
        '[data-testid="replaced-source"]',
      );
      await expect(replacedSource).toHaveText("User choice");
      await expect(replacedSource).toHaveAttribute(
        "data-value",
        "user-choice",
      );
      await application.waitForTimeout(400);

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.replacements["replaced-source"]).toBe(1);
      expect(state.staleOptionClicks).toBe(0);
      expect(state.model["replaced-source"]).toBe("User choice");
      expect(state.model["replaced-source-committed"]).not.toBe(true);
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              answered: 0,
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [{ status: "failed" }],
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 0 fields. Review the page.",
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("preserves a synchronous controlled value that replaces the typed query", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=controlled-input`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      const controlledSource = application.locator(
        '[data-testid="rejected-source"]',
      );
      await expect(controlledSource).toHaveValue("User choice");
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model["rejected-source"]).toBe("User choice");
      expect(state.model["rejected-source-committed"]).toBe(false);
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              answered: 0,
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [{ status: "failed" }],
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 0 fields. Review the page.",
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("does not clear a query after newer component commit evidence appears", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=late-commit-evidence`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      const source = application.locator('[data-testid="rejected-source"]');
      await expect(source).toHaveValue("LinkedIn");
      await expect(source).toHaveAttribute(
        "data-value",
        "employee-referral",
      );
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model["rejected-source-committed"]).toBe(
        "employee-referral",
      );
      expect(eventsFor(state, "rejected-source")).not.toContain("change");
      expect(eventsFor(state, "rejected-source")).not.toContain("blur");
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              answered: 0,
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [{ status: "failed" }],
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 0 fields. Review the page.",
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("resolves the compatible replacement behind an unrelated same-ID node", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=identity-combo`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(
        application.locator('[data-testid="identity-source"]'),
      ).toHaveText("LinkedIn");
      await expect(
        application.locator('[data-testid="identity-source-unrelated"]'),
      ).toHaveText("Unrelated control");
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.identityOptionClicks).toBe(1);
      expect(state.model["identity-source"]).toBe("linkedin");
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 1,
              needsAttention: 0,
            },
          },
        });
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("fails closed when same-ID replacements are semantically ambiguous", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=identity-ambiguous`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(
        application.locator('[data-probe="compatible-one"]'),
      ).toHaveText("Choose a source");
      await expect(
        application.locator('[data-probe="compatible-two"]'),
      ).toHaveText("Choose a source");
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.identityOptionClicks).toBe(0);
      expect(state.model["identity-source"]).toBeUndefined();
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 0,
              needsAttention: 1,
              unknownFields: [{ status: "failed" }],
            },
          },
        });
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("uses the shadow-owned listbox instead of a document duplicate ID", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=shadow-combo`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").click();
      await expect(
        application.locator("#shadow-combo-host #shadow-source-trigger"),
      ).toHaveText("LinkedIn");
      await expect(
        application.locator("#shadow-combo-host #shadow-source-value"),
      ).toHaveValue("linkedin");

      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.shadowOptionClicks).toBe(1);
      expect(state.documentShadowOptionClicks).toBe(0);
      expect(state.model["shadow-source"]).toBe("linkedin");
      await expect
        .poll(() => extensionState(popup, applicationUrl))
        .toMatchObject({
          session: {
            progress: {
              filledByExtension: 1,
              needsAttention: 0,
            },
          },
        });
      await expect(popup.locator("[data-notice]")).toHaveText(
        "Filled 1 field. Review the page.",
      );
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });

  test("cancels an in-flight portal interaction without overwriting newer user input", async () => {
    const fixture = await startFixtureServer();
    const runtime = await launchUnpackedExtension([
      "--host-resolver-rules=MAP ats.test 127.0.0.1",
    ]);
    try {
      const applicationUrl = `${fixture.origin}/application?mode=cancel`;
      const application = await launchFromDashboard(runtime, applicationUrl);
      const popup = await openPopupForPage(runtime, application);

      await popup.locator("[data-fill]").evaluate((button: HTMLButtonElement) => {
        button.click();
      });
      await expect(application.locator("#ashby-school-trigger")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await popup
        .locator("[data-enabled]")
        .evaluate((input: HTMLInputElement) => {
          input.checked = false;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      await expect(popup.locator("[data-mode]")).toHaveText("Extension is off");
      await application.evaluate(() => {
        (
          globalThis as unknown as { setCancelledUserChoice(): void }
        ).setCancelledUserChoice();
      });

      await application.waitForTimeout(750);
      await expect(application.locator("#ashby-school-trigger")).toHaveText(
        "User choice",
      );
      await expect(application.locator("#ashby-school-value")).toHaveValue(
        "user-choice",
      );
      await expect(
        application.locator("#ashby-school-listbox"),
      ).toHaveCount(0);
      const state = await application.evaluate(
        () =>
          (globalThis as unknown as { __atsHarness: FixtureState }).__atsHarness,
      );
      expect(state.model["ashby-school"]).toBe("user-choice");
      expect(state.unrelatedOptionClicks).toBe(0);
    } finally {
      await runtime.close();
      await closeServer(fixture.server);
    }
  });
});
