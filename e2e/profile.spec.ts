import { test, expect } from "@playwright/test";
import { CHROME_AUTOFILL_EXTENSION_ID } from "../lib/chromeExtension";

test.describe("profile page", () => {
  test("features a GitHub or Google Drive résumé PDF field", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Resume source" })).toBeVisible();
    await expect(
      page.getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf"),
    ).toBeVisible();
    const linkBox = await page
      .getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf")
      .boundingBox();
    const saveBox = await page
      .getByRole("button", { name: "Save resume PDF" })
      .boundingBox();
    expect(linkBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(Math.abs(linkBox!.y - saveBox!.y)).toBeLessThanOrEqual(1);
    await expect(page.getByText("No PDF saved", { exact: true })).toBeVisible();
    // The judge signals the profile actually feeds.
    await expect(page.getByRole("heading", { name: "Judge signals" })).toBeVisible();
    await expect(page.getByLabel("Add target role")).toBeVisible();
    await expect(page.getByLabel("Add skill")).toBeVisible();
    await expect(page.getByLabel("School")).toBeVisible();
    await expect(page.getByLabel("Degree")).toBeVisible();
    await expect(page.getByLabel("Field of study / discipline")).toBeVisible();
    await expect(page.getByLabel("Relevant experience")).toBeVisible();
  });

  test("edits target roles as explicit removable values", async ({ page }) => {
    await page.goto("/profile");
    const originalRoles = await page.evaluate(async () => {
      const profile = await fetch("/api/profile").then((response) => response.json());
      return profile.targetRoles as string[];
    });

    await page.getByLabel("Add target role").fill("Platform Reliability Engineer");
    await page.getByLabel("Add target role").press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove Platform Reliability Engineer" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText(/Profile saved/)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Remove Platform Reliability Engineer" }),
    ).toBeVisible();

    await page.evaluate(async (targetRoles) => {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRoles }),
      });
    }, originalRoles);
  });

  test("preserves legacy qualification text when structured fields are saved", async ({
    page,
  }) => {
    await page.goto("/profile");
    const originalProfile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );
    const legacyText = "Legacy internship and project evidence.";

    try {
      await page.evaluate(async ({ profile, qualifications }) => {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, qualifications, school: "" }),
        });
      }, { profile: originalProfile, qualifications: legacyText });
      await page.reload();
      await page.getByLabel("School").fill("University of Ottawa");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByText(/Profile saved/)).toBeVisible();

      const saved = await page.evaluate(async () =>
        fetch("/api/profile").then((response) => response.json()),
      );
      expect(saved.qualifications).toBe(legacyText);
      expect(saved.school).toBe("University of Ottawa");
    } finally {
      await page.evaluate(async (profile) => {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
      }, originalProfile);
    }
  });

  test("confirms and previews the saved resume PDF", async ({ page }) => {
    const source =
      "https://github.com/example/resume/blob/main/resume.pdf";
    await page.route("**/api/profile/resume*", async (route) => {
      if (route.request().method() === "HEAD") {
        await route.fulfill({
          status: 200,
          headers: {
            "X-Resume-Filename": "saved-resume.pdf",
            "X-Resume-Size": "204800",
            "X-Resume-Source": encodeURIComponent(source),
            "X-Resume-Updated-At": "2026-08-04T22:00:00.000Z",
          },
        });
        return;
      }
      await route.fulfill({
        body: "%PDF-1.4\n%%EOF\n",
        contentType: "application/pdf",
      });
    });

    await page.goto("/profile");
    await page
      .getByPlaceholder("https://github.com/you/resume/blob/main/resume.pdf")
      .fill(source);

    await expect(page.getByText("PDF saved", { exact: true })).toBeVisible();
    await expect(page.getByText("saved-resume.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview PDF" }).click();
    const preview = page.getByTitle("Saved resume PDF preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /preview=1/);
  });

  test("keeps application autofill details in the app profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Application autofill" }),
    ).toBeVisible();
    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    const usSection = page.getByRole("region", {
      name: "Jobs in the United States",
    });
    const caSection = page.getByRole("region", { name: "Jobs in Canada" });
    await expect(usSection.getByLabel("Country")).toHaveValue("United States");
    await expect(caSection.getByLabel("Country")).toHaveValue("Canada");
    await expect(page.getByLabel("US city / location")).toBeVisible();
    await expect(page.getByLabel("Canada city / location")).toBeVisible();
    await expect(
      usSection.getByLabel("Do you have work authorization?"),
    ).toBeVisible();
    await expect(
      caSection.getByLabel("Do you need visa sponsorship?"),
    ).toBeVisible();
    await expect(usSection.getByLabel("Citizenship status")).toBeVisible();
    await expect(page.getByLabel("How did you hear about this job?")).toBeVisible();
    await expect(page.getByLabel("Add security clearance")).toBeVisible();
    await expect(page.getByLabel("Undergraduate GPA")).toBeVisible();
    await expect(page.getByLabel("SAT score")).toBeVisible();
    await expect(page.getByLabel("Default cover letter")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Voluntary self-identification" }),
    ).toBeVisible();
    await expect(page.getByLabel("Pronouns")).toBeVisible();
    await expect(page.getByLabel("Gender")).toBeVisible();
    await expect(page.getByLabel("Race / ethnicity")).toBeVisible();
    await expect(page.getByLabel("Disability status")).toBeVisible();
    await expect(page.getByLabel("Protected veteran status")).toBeVisible();
    await expect(page.getByText(/SpaceXAI Employment History/i)).toHaveCount(0);
    await expect(page.getByLabel("Pasted or parsed resume text")).toHaveCount(0);
    await expect(page.getByText(/never influence fit scores/i)).toBeVisible();
  });

  test("persists contextual Other answers without showing stale companion fields", async ({
    page,
  }) => {
    await page.goto("/profile");
    const originalProfile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );

    try {
      await page.evaluate(async (profile) => {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...profile,
            degree: "",
            heardAboutJob: "",
            usCitizenshipStatus: "",
            pronouns: "",
            gender: "",
            raceEthnicity: "",
          }),
        });
      }, originalProfile);
      await page.reload();

      await expect(page.getByLabel("Please specify degree")).toHaveCount(0);
      await expect(page.getByLabel("Please specify your pronouns")).toHaveCount(0);
      await expect(page.getByLabel("Please self-describe your gender")).toHaveCount(
        0,
      );

      await page.getByLabel("Degree").selectOption("Other");
      await page
        .getByLabel("Please specify degree")
        .fill("Diploma in Software Engineering");
      await page
        .getByLabel("How did you hear about this job?")
        .selectOption("Other");
      await page
        .getByLabel("Please specify how you heard about this job")
        .fill("Hackathon");

      const usSection = page.getByRole("region", {
        name: "Jobs in the United States",
      });
      await usSection
        .getByLabel("Citizenship status", { exact: true })
        .selectOption("Other");
      await usSection
        .getByLabel("Please specify citizenship status")
        .fill("Non-citizen national");

      await page.getByLabel("Pronouns").selectOption("Other");
      await page.getByLabel("Please specify your pronouns").fill("Ze/hir");
      await page.getByLabel("Gender").selectOption("Other");
      await page
        .getByLabel("Please self-describe your gender")
        .fill("Genderqueer");
      await page.getByLabel("Race / ethnicity").selectOption("Other");
      await page
        .getByLabel("Please specify your race / ethnicity")
        .fill("West Asian");

      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByText(/Profile saved/)).toBeVisible();
      await page.reload();

      await expect(page.getByLabel("Please specify degree")).toHaveValue(
        "Diploma in Software Engineering",
      );
      await expect(
        page.getByLabel("Please specify how you heard about this job"),
      ).toHaveValue("Hackathon");
      await expect(
        usSection.getByLabel("Please specify citizenship status"),
      ).toHaveValue("Non-citizen national");
      await expect(page.getByLabel("Please specify your pronouns")).toHaveValue(
        "Ze/hir",
      );
      await expect(page.getByLabel("Please self-describe your gender")).toHaveValue(
        "Genderqueer",
      );
      await expect(
        page.getByLabel("Please specify your race / ethnicity"),
      ).toHaveValue("West Asian");
    } finally {
      await page.evaluate(async (profile) => {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
      }, originalProfile);
    }
  });

  test("autosaves structured answers before navigating away", async ({ page }) => {
    await page.goto("/profile");
    const originalProfile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );

    try {
      await page.evaluate(async (profile) => {
        sessionStorage.removeItem("job-pipeline-profile-draft-v1");
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...profile,
            school: "",
            degree: "",
            fieldOfStudy: "",
            graduationDate: "",
            relevantExperienceYears: null,
            certifications: [],
            heardAboutJob: "",
            heardAboutJobOther: "",
            securityClearances: [],
            canPerformEssentialFunctions: null,
            usCitizenshipStatus: "",
            usCitizenshipStatusOther: "",
          }),
        });
      }, originalProfile);
      await page.reload();

      const usSection = page.getByRole("region", {
        name: "Jobs in the United States",
      });
      await usSection
        .getByLabel("Citizenship status", { exact: true })
        .selectOption("Other");
      await usSection
        .getByLabel("Please specify citizenship status")
        .fill("Non-citizen national");
      await page.getByLabel("School").fill("Autosave University");
      await page.getByLabel("Degree").selectOption("Bachelor's degree");
      await page
        .getByLabel("Field of study / discipline")
        .fill("Computer Engineering");
      await page.getByLabel("Graduation date").fill("2027-06");
      await page.getByLabel("Relevant experience").fill("1.5");
      await page.getByLabel("Add certification").fill("Autosave Certificate");
      await page.getByLabel("Add certification").press("Enter");
      await page
        .getByLabel("How did you hear about this job?")
        .selectOption("Other");
      await page
        .getByLabel("Please specify how you heard about this job")
        .fill("Community meetup");
      await page.getByLabel("Add security clearance").fill("None");
      await page.getByLabel("Add security clearance").press("Enter");
      await page
        .getByLabel(
          "Can perform essential job functions with or without reasonable accommodations?",
        )
        .selectOption("yes");

      await page.getByRole("link", { name: "Jobs", exact: true }).click();
      await expect(page).toHaveURL(/\/jobs$/);
      await page.getByRole("link", { name: "Profile", exact: true }).click();

      await expect(
        usSection.getByLabel("Citizenship status", { exact: true }),
      ).toHaveValue("Other");
      await expect(
        usSection.getByLabel("Please specify citizenship status"),
      ).toHaveValue("Non-citizen national");
      await expect(page.getByLabel("School")).toHaveValue("Autosave University");
      await expect(page.getByLabel("Degree")).toHaveValue("Bachelor's degree");
      await expect(page.getByLabel("Field of study / discipline")).toHaveValue(
        "Computer Engineering",
      );
      await expect(page.getByLabel("Graduation date")).toHaveValue("2027-06");
      await expect(page.getByLabel("Relevant experience")).toHaveValue("1.5");
      await expect(
        page.getByRole("button", { name: "Remove Autosave Certificate" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Please specify how you heard about this job"),
      ).toHaveValue("Community meetup");
      await expect(
        page.getByRole("button", { name: "Remove None" }),
      ).toBeVisible();
      await expect(
        page.getByLabel(
          "Can perform essential job functions with or without reasonable accommodations?",
        ),
      ).toHaveValue("yes");

      await expect
        .poll(() =>
          page.evaluate(async () =>
            fetch("/api/profile").then((response) => response.json()),
          ),
        )
        .toMatchObject({
          school: "Autosave University",
          degree: "Bachelor's degree",
          fieldOfStudy: "Computer Engineering",
          graduationDate: "2027-06",
          relevantExperienceYears: 1.5,
          certifications: ["Autosave Certificate"],
          heardAboutJob: "Other",
          heardAboutJobOther: "Community meetup",
          securityClearances: ["None"],
          canPerformEssentialFunctions: true,
          usCitizenshipStatus: "Other",
          usCitizenshipStatusOther: "Non-citizen national",
        });
    } finally {
      await page.waitForTimeout(700);
      await page.evaluate(async (profile) => {
        sessionStorage.removeItem("job-pipeline-profile-draft-v1");
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
      }, originalProfile);
    }
  });

  test("does not discard edits made while an explicit save is in flight", async ({
    page,
  }) => {
    await page.goto("/profile");
    const originalProfile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );
    let releaseSave!: () => void;
    let markSaveStarted!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    let delayed = false;

    await page.route("**/api/profile", async (route) => {
      if (
        !delayed &&
        route.request().method() === "PUT" &&
        route.request().postDataJSON().firstName === "Save Race"
      ) {
        delayed = true;
        markSaveStarted();
        await saveGate;
      }
      await route.continue();
    });

    try {
      await page.getByLabel("First name").fill("Save Race");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await saveStarted;
      await page.getByLabel("School").fill("Edited During Save University");
      releaseSave();

      await expect(page.getByText(/Profile saved/)).toBeVisible();
      await page.getByRole("link", { name: "Jobs", exact: true }).click();
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page.getByLabel("First name")).toHaveValue("Save Race");
      await expect(page.getByLabel("School")).toHaveValue(
        "Edited During Save University",
      );
      await expect
        .poll(() =>
          page.evaluate(async () =>
            fetch("/api/profile").then((response) => response.json()),
          ),
        )
        .toMatchObject({
          firstName: "Save Race",
          school: "Edited During Save University",
        });
    } finally {
      releaseSave();
      await page.waitForTimeout(700);
      await page.evaluate(async (profile) => {
        sessionStorage.removeItem("job-pipeline-profile-draft-v1");
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
      }, originalProfile);
    }
  });

  test("keeps the newer edit when browser-tab saves arrive out of order", async ({
    page,
    context,
  }) => {
    await page.goto("/profile");
    const originalProfile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );
    const secondPage = await context.newPage();
    let releaseOlderSave!: () => void;
    let markOlderSaveStarted!: () => void;
    const olderSaveGate = new Promise<void>((resolve) => {
      releaseOlderSave = resolve;
    });
    const olderSaveStarted = new Promise<void>((resolve) => {
      markOlderSaveStarted = resolve;
    });
    let delayed = false;

    await page.route("**/api/profile", async (route) => {
      if (
        !delayed &&
        route.request().method() === "PUT" &&
        route.request().postDataJSON().school === "Older Tab University"
      ) {
        delayed = true;
        markOlderSaveStarted();
        await olderSaveGate;
      }
      await route.continue();
    });

    try {
      await secondPage.goto("/profile");
      await page.getByLabel("School").fill("Older Tab University");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await olderSaveStarted;

      await secondPage.waitForTimeout(5);
      await secondPage.getByLabel("School").fill("Newer Tab University");
      await secondPage
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await expect(secondPage.getByText(/Profile saved/)).toBeVisible();

      releaseOlderSave();
      await expect(page.getByText(/Profile saved/)).toBeVisible();
      await expect
        .poll(() =>
          secondPage.evaluate(async () =>
            fetch("/api/profile").then((response) => response.json()),
          ),
        )
        .toMatchObject({ school: "Newer Tab University" });
    } finally {
      releaseOlderSave();
      await page.unroute("**/api/profile");
      await secondPage.waitForTimeout(700);
      await secondPage.evaluate(async (profile) => {
        sessionStorage.removeItem("job-pipeline-profile-draft-v1");
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
      }, originalProfile);
      await secondPage.close();
    }
  });

  test("syncs saved autofill details to Chrome without an ID field", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: {
          brands: [
            { brand: "Chromium", version: "140" },
            { brand: "Google Chrome", version: "140" },
          ],
        },
      });
      const messages: { id: string; message: unknown }[] = [];
      Object.defineProperty(globalThis, "__profileExtensionMessages", {
        configurable: true,
        value: messages,
      });
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: {
          runtime: {
            sendMessage(
              id: string,
              message: unknown,
              callback: (response: unknown) => void,
            ) {
              messages.push({ id, message });
              callback({ ok: true, profileConfigured: true });
            },
          },
        },
      });
    });

    await page.goto("/profile");
    await page.getByLabel("First name").fill("Jane");
    await page.getByLabel("Email").fill("jane@example.com");
    const usSection = page.getByRole("region", {
      name: "Jobs in the United States",
    });
    await usSection.getByLabel("Do you need visa sponsorship?").selectOption("no");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText(/Chrome autofill synced/)).toBeVisible();

    const request = await page.evaluate(() => {
      const messages = (
        globalThis as unknown as {
          __profileExtensionMessages: { id: string; message: unknown }[];
        }
      ).__profileExtensionMessages;
      return messages.at(-1);
    });
    expect(request).toMatchObject({
      id: CHROME_AUTOFILL_EXTENSION_ID,
      message: {
        type: "JOB_AUTOFILL_SET_PROFILE",
        profile: {
          firstName: "Jane",
          email: "jane@example.com",
          country: "",
          location: "",
          workAuthorization: "",
          requiresSponsorship: "",
        },
      },
    });

    const messagesBeforeClear = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __profileExtensionMessages: unknown[];
          }
        ).__profileExtensionMessages.length,
    );
    await usSection.getByLabel("Do you need visa sponsorship?").selectOption("");
    const clearResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/profile") &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    expect(await (await clearResponse).json()).toMatchObject({
      usRequiresSponsorship: null,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __profileExtensionMessages: unknown[];
              }
            ).__profileExtensionMessages.length,
        ),
      )
      .toBeGreaterThan(messagesBeforeClear);
    const clearedRequest = await page.evaluate(() => {
      const messages = (
        globalThis as unknown as {
          __profileExtensionMessages: {
            message: { profile?: { requiresSponsorship?: string } };
          }[];
        }
      ).__profileExtensionMessages;
      return messages.at(-1);
    });
    expect(clearedRequest?.message.profile?.requiresSponsorship).toBe("");
  });

  test("preserves unsaved fields when refreshing the resume", async ({ page }) => {
    await page.route("**/api/profile/refresh", async (route) => {
      await route.fulfill({
        json: {
          provider: "test",
          source: "test-resume",
          updatedFields: [],
        },
      });
    });

    await page.goto("/profile");
    await page.getByLabel("Preferred name").fill("Unsaved Before Refresh");
    await page.getByRole("button", { name: "Save resume PDF" }).click();
    await expect(page.getByLabel("Preferred name")).toHaveValue(
      "Unsaved Before Refresh",
    );
    const profile = await page.evaluate(async () =>
      fetch("/api/profile").then((response) => response.json()),
    );
    expect(profile).toMatchObject({ preferredName: "Unsaved Before Refresh" });
  });
});
