import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  installContentPanel,
  invokeAutofill,
  invokePanel,
} from "./helpers/chrome-extension-harness";

function fixture(name: string): string {
  return readFileSync(
    resolve(process.cwd(), `e2e/fixtures/workday/${name}.html`),
    "utf8",
  );
}

async function installWorkday(
  page: Page,
  name: string,
  options: Omit<
    Parameters<typeof installContentPanel>[1],
    "html" | "url"
  >,
) {
  await installContentPanel(page, {
    ...options,
    html: fixture(name),
    url: `https://acme.wd5.myworkdayjobs.com/en-US/application/${name}`,
    requiredByDefault: false,
  });
}

test("keeps account creation, sign-in, and CAPTCHA controls manual", async ({
  page,
}) => {
  await installWorkday(page, "account", {
    profile: { email: "applicant@example.com" },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#account-email")).toHaveValue("");
  await expect(page.locator("#account-password")).toHaveValue("");
  await expect(page.locator("#captcha-answer")).toHaveValue("");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).accountClicks,
    ),
  ).toBe(0);
});

test("fills required contact controls and leaves optional Workday fields alone", async ({
  page,
}) => {
  await installWorkday(page, "contact", {
    profile: {
      firstName: "Jane",
      middleName: "Quinn",
      lastName: "Doe",
      phone: "+1 (212) 555-0100",
      phoneCountryCode: "+1",
      phoneType: "Mobile",
      homeAddressLine1: "1 Main St",
      homeAddressLine2: "Apt 2",
      homeCity: "New York",
      homeRegion: "NY",
      homePostalCode: "10001",
      homeCountry: "United States",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true });
  await expect(page.locator("#first-name")).toHaveValue("Jane");
  await expect(page.locator("#last-name")).toHaveValue("Doe");
  await expect(page.locator("#address-1")).toHaveValue("1 Main St");
  await expect(page.locator("#home-city")).toHaveValue("New York");
  await expect(page.locator("#postal-code")).toHaveValue("10001");
  await expect(page.locator("#home-country")).toHaveText("United States");
  await expect(page.locator("#home-region")).toHaveValue("NY");
  await expect(page.locator("#phone-country-code")).toHaveValue("+1");
  await expect(page.locator("#phone-number")).toHaveValue("(212) 555-0100");
  await expect(page.locator("#phone-type")).toHaveValue("mobile");
  await expect(page.locator("#middle-name")).toHaveValue("");
  await expect(page.locator("#address-2")).toHaveValue("");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).nextClicks,
    ),
  ).toBe(0);
});

test("uploads only the required resume PDF", async ({ page }) => {
  await installWorkday(page, "resume", {
    profile: {},
    resumeFile: {
      fileName: "jane-doe-resume.pdf",
      mimeType: "application/pdf",
      base64: "JVBERi0xLjQKJUVPRg==",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  expect(
    await page
      .locator("#resume")
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe("jane-doe-resume.pdf");
  expect(
    await page
      .locator("#supporting-document")
      .evaluate((input: HTMLInputElement) => input.files?.length || 0),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).nextClicks,
    ),
  ).toBe(0);
});

test("fills indexed repeat sections and adds only saved required entries", async ({
  page,
}) => {
  await installWorkday(page, "experience", {
    profile: {
      workExperiences: [
        {
          company: "Acme",
          title: "Senior Engineer",
          location: "New York",
          startDate: "2023-07",
          endDate: "",
          currentRole: "yes",
          description: "Optional saved description",
        },
        {
          company: "Rivian",
          title: "Software Engineer",
          location: "Irvine",
          startDate: "2021-01",
          endDate: "2023-06",
          currentRole: "no",
          description: "Another optional description",
        },
      ],
      educationEntries: [
        {
          school: "University of Ottawa",
          degree: "Bachelor's degree",
          degreeOther: "",
          fieldOfStudy: "Computer Science",
          startDate: "2017-09",
          graduationDate: "2021-05",
          gpa: "3.8",
        },
        {
          school: "Stanford University",
          degree: "Master's degree",
          degreeOther: "",
          fieldOfStudy: "Computer Science",
          startDate: "2021-09",
          graduationDate: "2023-05",
          gpa: "3.9",
        },
      ],
      credentialEntries: [
        {
          name: "AWS Certified Developer",
          issuer: "Amazon",
          credentialId: "ABC-123",
          issueDate: "2024-01",
          expirationDate: "",
          doesNotExpire: "yes",
        },
      ],
      languages: [
        {
          language: "English",
          overallProficiency: "Native",
          speakingProficiency: "Native",
          readingProficiency: "Native",
          writingProficiency: "Native",
        },
      ],
      additionalWebsites: [
        { label: "Portfolio", url: "https://jane.example" },
      ],
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true });
  await expect(
    page.locator('[data-automation-id^="workExperience-"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('[data-automation-id^="education-"]'),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() => ({
      work: (window as unknown as Record<string, number>).addWorkClicks,
      education: (window as unknown as Record<string, number>)
        .addEducationClicks,
      next: (window as unknown as Record<string, number>).nextClicks,
    })),
  ).toEqual({ work: 1, education: 1, next: 0 });

  await expect(page.locator("#work-company-0")).toHaveValue(
    "User-entered company",
  );
  await expect(page.locator("#work-title-0")).toHaveValue("Senior Engineer");
  await expect(page.locator("#work-start-month-0")).toHaveValue("July");
  await expect(page.locator("#work-start-year-0")).toHaveValue("2023");
  await expect(page.locator("#work-current-0")).toBeChecked();
  await expect(page.locator("#work-description-0")).toHaveValue("");
  await expect(page.locator("#work-company-1")).toHaveValue("Rivian");
  await expect(page.locator("#work-title-1")).toHaveValue("Software Engineer");
  await expect(page.locator("#work-start-month-1")).toHaveValue("01");
  await expect(page.locator("#work-start-year-1")).toHaveValue("2021");
  await expect(page.locator("#work-description-1")).toHaveValue("");

  await expect(page.locator("#education-school-0")).toHaveValue(
    "User-entered school",
  );
  await expect(page.locator("#education-degree-0")).toHaveValue("bachelors");
  await expect(page.locator("#education-start-0")).toHaveValue("2017-09");
  await expect(page.locator("#education-end-0")).toHaveValue("2021-05");
  await expect(page.locator("#education-school-1")).toHaveValue(
    "Stanford University",
  );
  await expect(page.locator("#education-degree-1")).toHaveValue("masters");
  await expect(page.locator("#credential-name")).toHaveValue(
    "AWS Certified Developer",
  );
  await expect(page.locator("#credential-month")).toHaveValue("January");
  await expect(page.locator("#credential-year")).toHaveValue("2024");
  await expect(page.locator("#credential-no-expiry")).toBeChecked();
  await expect(page.locator("#language-name")).toHaveValue("English");
  await expect(page.locator("#language-proficiency")).toHaveValue("Native");
  await expect(page.locator("#website-url")).toHaveValue(
    "https://jane.example",
  );
  await expect(page.locator("#website-label")).toHaveValue("");
});

test("fills explicit recurring answers and leaves nuanced legal gaps manual", async ({
  page,
}) => {
  await installWorkday(page, "questions", {
    company: "Acme",
    profile: {
      heardAboutJob: "Employee referral",
      referrerName: "Alex Smith",
      referrerEmail: "alex@example.com",
      previousEmployers: "Rivian\nCisco",
      workAuthorization: "yes",
      requiresSponsorship: "no",
      availableStartDate: "2026-06-01",
      noticePeriod: "Two weeks",
      compensationExpectation: "$150,000",
      compensationCurrency: "USD",
      compensationFrequency: "Annual",
      willingToRelocate: "no",
      willingToTravel: "yes",
      maxTravelPercentage: "25",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true });
  await expect(page.locator("#source")).toHaveValue("referral");
  await expect(page.locator("#referrer-name")).toHaveValue("Alex Smith");
  await expect(page.locator("#referrer-email")).toHaveValue(
    "alex@example.com",
  );
  await expect(page.locator("#prior-employment")).toHaveValue("no");
  await expect(page.locator("#authorization")).toHaveValue("yes");
  await expect(page.locator("#sponsorship")).toHaveValue("no");
  await expect(page.locator("#start-date")).toHaveValue("2026-06-01");
  await expect(page.locator("#notice-period")).toHaveValue("Two weeks");
  await expect(page.locator("#compensation")).toHaveValue("$150,000");
  await expect(page.locator("#currency")).toHaveValue("USD");
  await expect(page.locator("#frequency")).toHaveValue("annual");
  await expect(page.locator('input[name="relocate"][value="no"]')).toBeChecked();
  await expect(page.locator('input[name="travel"][value="yes"]')).toBeChecked();
  await expect(page.locator("#travel-percent")).toHaveValue("25");
  await expect(page.locator("#age")).toHaveValue("");
  await expect(page.locator("#contract-restrictions")).toHaveValue("");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).nextClicks,
    ),
  ).toBe(0);
});

test("uses only explicit required self-identification values", async ({
  page,
}) => {
  await installWorkday(page, "self-identification", {
    profile: {
      gender: "Woman",
      veteranStatus: "Not a protected veteran",
      hispanicLatino: "no",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#gender")).toHaveValue("woman");
  await expect(page.locator("#veteran")).toHaveValue("not-protected");
  await expect(page.locator("#race")).toHaveValue("");
  await expect(page.locator("#disability")).toHaveValue("");
  await expect(page.locator("#ethnicity")).toHaveValue("");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).nextClicks,
    ),
  ).toBe(0);
});

test("treats review pages as read-only and never clicks final Submit", async ({
  page,
}) => {
  await installWorkday(page, "review", {
    profile: { email: "applicant@example.com" },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#review-email")).toHaveValue("");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).submitClicks,
    ),
  ).toBe(0);
});

test("rescans explicitly after user-driven transitions without advancing or overwriting", async ({
  page,
}) => {
  await installWorkday(page, "rerender", {
    profile: { firstName: "Jane", lastName: "Doe" },
    profileAvailability: { firstName: true, lastName: true },
    revealPanel: true,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#first-name")).toHaveValue("Jane");
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, number>).nextClicks,
    ),
  ).toBe(0);

  await page.locator("#next").click();
  await expect(page.locator("#last-name")).toBeVisible();
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(
    page.locator("#job-autofill-extension-panel [data-ready-count]"),
  ).toHaveText("1");
  await page.locator("#last-name").fill("User-entered surname");
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#last-name")).toHaveValue(
    "User-entered surname",
  );
  expect(
    await page.evaluate(() => ({
      next: (window as unknown as Record<string, number>).nextClicks,
      submit: (window as unknown as Record<string, number>).submitClicks,
    })),
  ).toEqual({ next: 1, submit: 0 });
});
