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
    await expect(
      page.getByLabel("Software engineering industry experience"),
    ).toBeVisible();
    await expect(page.getByLabel("Add previous employer")).toBeVisible();
    await expect(
      page.getByLabel("Target total annual compensation"),
    ).toBeVisible();
    await expect(page.getByLabel("Are you Hispanic or Latino?")).toBeVisible();
    await expect(
      page.getByLabel("Do you identify as transgender?"),
    ).toBeVisible();
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
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Address line 1")).toBeVisible();
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
      page.getByRole("heading", { name: "Workday application details" }),
    ).toBeVisible();
    await expect(page.getByLabel("Address line 1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Work experience" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Voluntary self-identification" }),
    ).toBeVisible();
    await expect(page.getByLabel("Pronouns")).toBeVisible();
    await expect(page.getByLabel("Gender", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Race / ethnicity")).toBeVisible();
    await expect(page.getByLabel("Disability status")).toBeVisible();
    await expect(page.getByLabel("Protected veteran status")).toBeVisible();
    await expect(page.getByText(/SpaceXAI Employment History/i)).toHaveCount(0);
    await expect(page.getByLabel("Pasted or parsed resume text")).toHaveCount(0);
    await expect(page.getByText(/never influence fit scores/i)).toBeVisible();
  });

  test("persists exact graduation dates while preserving month-only records", async ({
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
            graduationDate: "2024-02",
            graduationDateExact: "",
          }),
        });
      }, originalProfile);
      await page.reload();

      await expect(page.getByLabel("Graduation month", { exact: true })).toHaveValue(
        "2024-02",
      );
      await expect(page.getByLabel("Exact graduation date")).toHaveValue("");

      await page.getByLabel("Exact graduation date").fill("2024-02-29");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByText(/Profile saved/)).toBeVisible();
      await page.reload();

      await expect(page.getByLabel("Exact graduation date")).toHaveValue(
        "2024-02-29",
      );
      await expect(page.getByLabel("Graduation month", { exact: true })).toHaveValue(
        "2024-02",
      );

      await page.getByLabel("Exact graduation date").fill("");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByText(/Profile saved/)).toBeVisible();
      await page.reload();

      await expect(page.getByLabel("Exact graduation date")).toHaveValue("");
      await expect(page.getByLabel("Graduation month", { exact: true })).toHaveValue(
        "2024-02",
      );
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
      await page.getByLabel("Gender", { exact: true }).selectOption("Other");
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
            softwareIndustryExperienceYears: null,
            certifications: [],
            heardAboutJob: "",
            heardAboutJobOther: "",
            previousEmployers: [],
            compensationExpectation: "",
            securityClearances: [],
            canPerformEssentialFunctions: null,
            usCitizenshipStatus: "",
            usCitizenshipStatusOther: "",
            hispanicLatino: "",
            transgenderStatus: "",
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
      await page.getByLabel("Graduation month", { exact: true }).fill("2027-06");
      await page.getByLabel("Relevant experience").fill("1.5");
      await page
        .getByLabel("Software engineering industry experience")
        .fill("2");
      await page.getByRole("button", { name: "Add Credential" }).click();
      await page.getByLabel("Credential name 1").fill("Autosave Certificate");
      await page
        .getByLabel("How did you hear about this job?")
        .selectOption("Other");
      await page
        .getByLabel("Please specify how you heard about this job")
        .fill("Community meetup");
      await page.getByLabel("Add previous employer").fill("Cisco");
      await page.getByLabel("Add previous employer").press("Enter");
      await page
        .getByLabel("Target total annual compensation")
        .fill("$150,000 USD");
      await page.getByLabel("Are you Hispanic or Latino?").selectOption("no");
      await page
        .getByLabel("Do you identify as transgender?")
        .selectOption("Prefer not to answer");
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
      await expect(
        page.getByLabel("Graduation month", { exact: true }),
      ).toHaveValue("2027-06");
      await expect(page.getByLabel("Relevant experience")).toHaveValue("1.5");
      await expect(
        page.getByLabel("Software engineering industry experience"),
      ).toHaveValue("2");
      await expect(page.getByLabel("Credential name 1")).toHaveValue(
        "Autosave Certificate",
      );
      await expect(
        page.getByRole("button", { name: "Remove Cisco" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Target total annual compensation"),
      ).toHaveValue("$150,000 USD");
      await expect(page.getByLabel("Are you Hispanic or Latino?")).toHaveValue(
        "no",
      );
      await expect(
        page.getByLabel("Do you identify as transgender?"),
      ).toHaveValue("Prefer not to answer");
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
          softwareIndustryExperienceYears: 2,
          certifications: [
            {
              name: "Autosave Certificate",
              issuer: "",
              credentialId: "",
              issueDate: "",
              expirationDate: "",
              doesNotExpire: null,
            },
          ],
          heardAboutJob: "Other",
          heardAboutJobOther: "Community meetup",
          previousEmployers: ["Cisco"],
          compensationExpectation: "$150,000 USD",
          securityClearances: ["None"],
          canPerformEssentialFunctions: true,
          usCitizenshipStatus: "Other",
          usCitizenshipStatusOther: "Non-citizen national",
          hispanicLatino: "no",
          transgenderStatus: "Prefer not to answer",
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

  test("persists and reloads structured Workday entries atomically", async ({
    page,
  }) => {
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
            middleName: "",
            homeAddressLine1: "",
            homeCity: "",
            homeRegion: "",
            homePostalCode: "",
            homeCountry: "",
            phoneCountryCode: "",
            phoneType: "",
            workExperiences: [],
            additionalEducation: [],
            certifications: [],
            languages: [],
            additionalWebsites: [],
            availableStartDate: "",
            noticePeriod: "",
            willingToRelocate: null,
            willingToTravel: null,
            maxTravelPercentage: "",
            isAtLeast18: null,
          }),
        });
      }, originalProfile);
      await page.reload();

      await expect(page.getByLabel("Willing to relocate?")).toHaveValue("yes");
      await page.getByLabel("Middle name").fill("Quinn");
      await page.getByLabel("Address line 1").fill("1 Main St");
      await page.getByLabel("Home city").fill("New York");
      await page.getByLabel("State / province / region").fill("NY");
      await page.getByLabel("Postal code").fill("10001");
      await page.getByLabel("Home country").fill("United States");
      await page.getByLabel("Phone country code").fill("+1");
      await page.getByLabel("Phone type").selectOption("Mobile");

      await page.getByRole("button", { name: "Add Work experience" }).click();
      await page.getByLabel("Company 1").fill("Acme");
      await page.getByLabel("Job title 1").fill("Software Engineer");
      await page.getByLabel("Work location 1").fill("New York");
      await page.getByLabel("Start month 1").fill("2024-01");
      await page.getByLabel("I currently work here 1").check();
      await page.getByLabel("Role description 1").fill("Built reliable tools.");

      await page.getByRole("button", { name: "Add Education" }).click();
      await page.getByLabel("Additional school 1").fill("Stanford University");
      await page
        .getByLabel("Additional degree 1")
        .selectOption("Master's degree");
      await page
        .getByLabel("Additional field of study 1")
        .fill("Computer Science");
      await page
        .getByLabel("Additional education start month 1")
        .fill("2021-09");
      await page
        .getByLabel("Additional education end month 1")
        .fill("2023-05");

      await page.getByRole("button", { name: "Add Credential" }).click();
      await page.getByLabel("Credential name 1").fill("AWS Developer");
      await page.getByLabel("Credential issuer 1").fill("Amazon");
      await page.getByLabel("Credential number 1").fill("ABC-123");
      await page.getByLabel("Credential issue month 1").fill("2024-01");
      await page.getByLabel("Credential does not expire 1").check();

      await page.getByRole("button", { name: "Add Language" }).click();
      await page.getByLabel("Language 1").fill("English");
      await page.getByLabel("Overall proficiency 1").fill("Native");

      await page.getByRole("button", { name: "Add Website" }).click();
      await page.getByLabel("Website label 1").fill("Portfolio");
      await page
        .getByLabel("Additional website URL 1")
        .fill("https://jane.example");
      await page.getByRole("button", { name: "Add Website" }).click();
      await page.getByLabel("Website label 2").fill("Temporary");
      await page
        .getByLabel("Additional website URL 2")
        .fill("https://temporary.example");
      await page
        .getByRole("button", { name: "Remove website 2" })
        .click();

      await page.getByLabel("Available start date").fill("2026-06-01");
      await page.getByLabel("Notice period").fill("Two weeks");
      await page.getByLabel("Willing to relocate?").selectOption("no");
      await page.getByLabel("Willing to travel?").selectOption("yes");
      await page.getByLabel("Maximum travel percentage").fill("25");
      await page
        .getByLabel("Are you at least 18 years old?")
        .selectOption("yes");

      await page.getByRole("link", { name: "Jobs", exact: true }).click();
      await expect(page).toHaveURL(/\/jobs$/);
      await page.getByRole("link", { name: "Profile", exact: true }).click();

      await expect(page.getByLabel("Company 1")).toHaveValue("Acme");
      await expect(page.getByLabel("Job title 1")).toHaveValue(
        "Software Engineer",
      );
      await expect(page.getByLabel("I currently work here 1")).toBeChecked();
      await expect(page.getByLabel("Additional school 1")).toHaveValue(
        "Stanford University",
      );
      await expect(page.getByLabel("Credential name 1")).toHaveValue(
        "AWS Developer",
      );
      await expect(page.getByLabel("Language 1")).toHaveValue("English");
      await expect(page.getByLabel("Website label 1")).toHaveValue("Portfolio");
      await expect(page.getByLabel("Website label 2")).toHaveCount(0);

      await expect
        .poll(() =>
          page.evaluate(async () =>
            fetch("/api/profile").then((response) => response.json()),
          ),
        )
        .toMatchObject({
          middleName: "Quinn",
          homeAddressLine1: "1 Main St",
          homeCity: "New York",
          homeRegion: "NY",
          homePostalCode: "10001",
          homeCountry: "United States",
          phoneCountryCode: "+1",
          phoneType: "Mobile",
          workExperiences: [
            {
              company: "Acme",
              title: "Software Engineer",
              location: "New York",
              startDate: "2024-01",
              endDate: "",
              currentRole: true,
              description: "Built reliable tools.",
            },
          ],
          additionalEducation: [
            {
              school: "Stanford University",
              degree: "Master's degree",
              degreeOther: "",
              fieldOfStudy: "Computer Science",
              startDate: "2021-09",
              graduationDate: "2023-05",
              gpa: "",
            },
          ],
          certifications: [
            {
              name: "AWS Developer",
              issuer: "Amazon",
              credentialId: "ABC-123",
              issueDate: "2024-01",
              expirationDate: "",
              doesNotExpire: true,
            },
          ],
          languages: [
            {
              language: "English",
              overallProficiency: "Native",
              speakingProficiency: "",
              readingProficiency: "",
              writingProficiency: "",
            },
          ],
          additionalWebsites: [
            { label: "Portfolio", url: "https://jane.example" },
          ],
          availableStartDate: "2026-06-01",
          noticePeriod: "Two weeks",
          willingToRelocate: false,
          willingToTravel: true,
          maxTravelPercentage: "25",
          isAtLeast18: true,
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
    await page.getByLabel("Email", { exact: true }).fill("jane@example.com");
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
          usCountry: "United States",
          usRequiresSponsorship: "no",
          willingToRelocate: "yes",
          preferredOfficeLocations: "San Francisco, CA",
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
