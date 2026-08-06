import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAutofillProfile,
  CHROME_AUTOFILL_EXTENSION_ID,
  getAutofillProgress,
  isGoogleChromeBrowser,
  launchAutofillApplication,
  pingAutofillExtension,
  sendChromeExtensionMessage,
  syncAutofillProfile,
  type ChromeRuntimeLike,
} from "../lib/chromeExtension";
import type { ProfileData } from "../lib/settings";

const PROFILE = {
  firstName: " Jane ",
  preferredName: " JJ ",
  lastName: " Doe ",
  email: " jane@example.com ",
  phone: " +1 555 0100 ",
  usCountry: " United States ",
  usLocation: " New York, NY ",
  usWorkAuthorized: true,
  usRequiresSponsorship: false,
  usCitizenshipStatus: " U.S. citizen ",
  caCountry: " Canada ",
  caLocation: " Toronto, ON ",
  caWorkAuthorized: false,
  caRequiresSponsorship: true,
  caCitizenshipStatus: " Other ",
  caCitizenshipStatusOther: " Protected person ",
  school: " University of Ottawa ",
  degree: " Bachelor's degree ",
  degreeOther: " Juris Doctor ",
  fieldOfStudy: " Computer Science ",
  graduationDate: "2025-05",
  relevantExperienceYears: 2,
  certifications: [" AWS Certified Developer ", "CKA"],
  undergraduateGpa: "3.8",
  graduateGpa: "",
  doctorateGpa: "",
  satScore: "1450",
  actScore: "33",
  greScore: "325",
  heardAboutJob: "LinkedIn",
  heardAboutJobOther: "Conference",
  securityClearances: ["None"],
  canPerformEssentialFunctions: true,
  pronouns: "Other",
  pronounsOther: "Ze/hir",
  gender: "Woman",
  genderOther: "Stale hidden value",
  raceEthnicity: "Other",
  raceEthnicityOther: "West Asian",
  disabilityStatus: "no",
  veteranStatus: "Not a protected veteran",
  linkedin: " https://www.linkedin.com/in/jane ",
  github: " https://github.com/jane ",
  website: " https://jane.dev ",
  coverLetterTemplate: " Hello hiring team.\n\nThank you. ",
} satisfies ProfileData;

function fakeRuntime(
  responder: (extensionId: string, message: unknown) => unknown,
): {
  runtime: ChromeRuntimeLike;
  calls: { extensionId: string; message: unknown }[];
} {
  const calls: { extensionId: string; message: unknown }[] = [];
  const runtime: ChromeRuntimeLike = {
    sendMessage(extensionId, message, callback) {
      calls.push({ extensionId, message });
      callback(responder(extensionId, message));
    },
  };
  return { runtime, calls };
}

describe("Chrome extension identity and profile mapping", () => {
  it("derives the dashboard extension ID from the manifest key", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../apps/chrome-extension/manifest.json", import.meta.url),
        "utf8",
      ),
    ) as { key: string };
    const digest = createHash("sha256")
      .update(Buffer.from(manifest.key, "base64"))
      .digest()
      .subarray(0, 16);
    const extensionId = [...digest]
      .flatMap((byte) => [byte >> 4, byte & 15])
      .map((nibble) => String.fromCharCode(97 + nibble))
      .join("");

    expect(extensionId).toBe(CHROME_AUTOFILL_EXTENSION_ID);
  });

  it("maps the app profile to the extension schema", () => {
    expect(buildAutofillProfile(PROFILE, "US")).toEqual({
      firstName: "Jane",
      preferredName: "JJ",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+1 555 0100",
      country: "United States",
      location: "New York, NY",
      linkedinUrl: "https://www.linkedin.com/in/jane",
      githubUrl: "https://github.com/jane",
      portfolioUrl: "https://jane.dev",
      school: "University of Ottawa",
      degree: "Bachelor's degree",
      degreeOther: "",
      fieldOfStudy: "Computer Science",
      graduationDate: "2025-05",
      relevantExperienceYears: "2",
      certifications: "AWS Certified Developer, CKA",
      undergraduateGpa: "3.8",
      graduateGpa: "",
      doctorateGpa: "",
      satScore: "1450",
      actScore: "33",
      greScore: "325",
      heardAboutJob: "LinkedIn",
      heardAboutJobOther: "",
      securityClearances: "None",
      canPerformEssentialFunctions: "yes",
      citizenshipStatus: "U.S. citizen",
      citizenshipStatusOther: "",
      workAuthorization: "yes",
      requiresSponsorship: "no",
      pronouns: "Other",
      pronounsOther: "Ze/hir",
      gender: "Woman",
      genderOther: "",
      raceEthnicity: "Other",
      raceEthnicityOther: "West Asian",
      disabilityStatus: "no",
      veteranStatus: "Not a protected veteran",
      coverLetter: "Hello hiring team.\n\nThank you.",
    });
    expect(buildAutofillProfile(PROFILE, "CA")).toMatchObject({
      country: "Canada",
      location: "Toronto, ON",
      citizenshipStatus: "Other",
      citizenshipStatusOther: "Protected person",
      workAuthorization: "no",
      requiresSponsorship: "yes",
    });
    expect(buildAutofillProfile(PROFILE)).toMatchObject({
      country: "",
      location: "",
      citizenshipStatus: "",
      citizenshipStatusOther: "",
      workAuthorization: "",
      requiresSponsorship: "",
    });
  });

  it("sends self-described details only when the related answer is Other", () => {
    expect(
      buildAutofillProfile(
        {
          degree: "Other",
          degreeOther: "Diploma in Software Engineering",
          heardAboutJob: "Other",
          heardAboutJobOther: "Hackathon",
          usCitizenshipStatus: "Other",
          usCitizenshipStatusOther: "Non-citizen national",
          pronouns: "She/her",
          pronounsOther: "Stale pronouns",
        },
        "US",
      ),
    ).toMatchObject({
      degreeOther: "Diploma in Software Engineering",
      heardAboutJobOther: "Hackathon",
      citizenshipStatusOther: "Non-citizen national",
      pronounsOther: "",
    });
  });

  it("supports legacy portfolio URLs and cleared eligibility answers", () => {
    expect(
      buildAutofillProfile({
        website: "",
        portfolio: "https://legacy.example",
        workAuthorized: null,
        requiresSponsorship: null,
      }),
    ).toMatchObject({
      portfolioUrl: "https://legacy.example",
      workAuthorization: "",
      requiresSponsorship: "",
    });
  });
});

describe("Chrome browser support", () => {
  it("accepts desktop Google Chrome", () => {
    expect(
      isGoogleChromeBrowser({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isGoogleChromeBrowser({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      }),
    ).toBe(true);
  });

  it("rejects non-Chrome and mobile browsers", () => {
    expect(
      isGoogleChromeBrowser({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Microsoft Edge", version: "140" },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isGoogleChromeBrowser({
        userAgent:
          "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(false);
    expect(
      isGoogleChromeBrowser({
        userAgent: "Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      }),
    ).toBe(false);
  });
});

describe("Chrome extension messaging", () => {
  it("uses the built-in ID and sends the app profile on sync and launch", async () => {
    const { runtime, calls } = fakeRuntime((_extensionId, message) => {
      const type = (message as { type?: string }).type;
      if (type === "JOB_AUTOFILL_PING") {
        return {
          ok: true,
          enabled: true,
          extensionId: CHROME_AUTOFILL_EXTENSION_ID,
          version: "0.2.0",
        };
      }
      if (type === "JOB_AUTOFILL_SET_PROFILE") {
        return { ok: true, profileConfigured: true };
      }
      if (type === "JOB_AUTOFILL_LAUNCH") {
        return { ok: true, sessionId: "session-1" };
      }
      return {
        ok: true,
        session: {
          id: "session-1",
          jobId: "job-1",
          jobTitle: "Engineer",
          company: "Acme",
          url: "https://example.com/apply",
          country: "CA",
          tabId: 2,
          status: "active",
          startedAt: "2026-08-04T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:01.000Z",
          progress: {
            total: 2,
            answered: 1,
            filledByExtension: 1,
            readyToFill: 0,
            needsAttention: 1,
            unknownFields: [],
          },
        },
      };
    });

    await expect(pingAutofillExtension(runtime)).resolves.toMatchObject({
      enabled: true,
      version: "0.2.0",
    });
    await expect(syncAutofillProfile(PROFILE, runtime)).resolves.toMatchObject({
      profileConfigured: true,
    });
    await expect(
      launchAutofillApplication(
        {
          jobId: "job-1",
          jobTitle: "Engineer",
          company: "Acme",
          url: "https://example.com/apply",
          country: "CA",
        },
        PROFILE,
        runtime,
      ),
    ).resolves.toMatchObject({ sessionId: "session-1" });
    await expect(getAutofillProgress("session-1", runtime)).resolves.toMatchObject({
      session: { id: "session-1", progress: { needsAttention: 1 } },
    });

    expect(calls.every((call) => call.extensionId === CHROME_AUTOFILL_EXTENSION_ID)).toBe(
      true,
    );
    expect(calls.map((call) => (call.message as { type: string }).type)).toEqual([
      "JOB_AUTOFILL_PING",
      "JOB_AUTOFILL_SET_PROFILE",
      "JOB_AUTOFILL_LAUNCH",
      "JOB_AUTOFILL_GET_PROGRESS",
    ]);
    expect(calls[2]?.message).toMatchObject({
      profile: buildAutofillProfile(PROFILE, "CA"),
    });
  });

  it("surfaces extension and Chrome runtime errors", async () => {
    const extensionFailure = fakeRuntime(() => ({
      ok: false,
      error: "Extension is turned off.",
    }));
    await expect(
      sendChromeExtensionMessage({ type: "TEST" }, extensionFailure.runtime),
    ).rejects.toThrow("Extension is turned off.");

    const runtimeFailure = fakeRuntime(() => undefined);
    runtimeFailure.runtime.lastError = { message: "Receiving end does not exist." };
    await expect(
      sendChromeExtensionMessage({ type: "TEST" }, runtimeFailure.runtime),
    ).rejects.toThrow("Receiving end does not exist.");

    await expect(
      sendChromeExtensionMessage({ type: "TEST" }, null),
    ).rejects.toThrow("Chrome did not expose extension messaging");
  });
});
