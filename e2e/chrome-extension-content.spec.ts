import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const extensionScripts = [
  "apps/chrome-extension/lib/session-scope.js",
  "apps/chrome-extension/lib/profile-schema.js",
  "apps/chrome-extension/lib/field-matcher.js",
  "apps/chrome-extension/lib/ats-adapter.js",
  "apps/chrome-extension/content/application-panel.js",
].map((path) => resolve(process.cwd(), path));

async function installContentPanel(
  page: Page,
  {
    html,
    profile,
    resumeFile,
    deferProfile = false,
    revealPanel = false,
    frameMode = false,
    country = "",
    profileAvailability,
  }: {
    html: string;
    profile: Record<string, string>;
    resumeFile?: {
      fileName: string;
      mimeType: "application/pdf";
      base64: string;
    };
    deferProfile?: boolean;
    revealPanel?: boolean;
    frameMode?: boolean;
    country?: string;
    profileAvailability?: Record<string, boolean>;
  },
) {
  await page.goto("/jobs");
  await page.setContent(html);
  if (revealPanel) {
    await page.evaluate(() => {
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function attachOpenShadow(init) {
        return attachShadow.call(this, { ...init, mode: "open" });
      };
    });
  }
  await page.evaluate(
    ({ savedProfile, savedResumeFile, deferred }) => {
      type Message = { type: string; sessionId?: string };
      type Listener = (
        message: Message & {
          session?: {
            id: string;
            url: string;
            applicationOrigins: string[];
            jobTitle: string;
            country: string;
          };
          profile?: Record<string, string>;
          profileAvailability?: Record<string, boolean>;
          frameMode?: boolean;
        },
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean;

      let resolveProfile: ((response: unknown) => void) | undefined;
      const profileResponse = {
        ok: true,
        profile: savedProfile,
        resumeFile: savedResumeFile,
      };
      const profilePromise = deferred
        ? new Promise((resolve) => {
            resolveProfile = resolve;
          })
        : Promise.resolve(profileResponse);
      const harness = {
        listener: null as Listener | null,
        profileRequested: false,
        resolveProfile: () => resolveProfile?.(profileResponse),
        invoke(message: Parameters<Listener>[0]) {
          return new Promise<unknown>((resolve, reject) => {
            if (!harness.listener) {
              reject(new Error("The content listener is not installed."));
              return;
            }
            harness.listener(message, {}, resolve);
          });
        },
      };

      Object.defineProperty(globalThis, "__panelHarness", {
        value: harness,
        configurable: true,
      });
      Object.defineProperty(globalThis, "chrome", {
        value: {
          runtime: {
            sendMessage(message: Message) {
              if (message.type === "JOB_AUTOFILL_GET_PROFILE") {
                harness.profileRequested = true;
                return profilePromise;
              }
              return Promise.resolve({ ok: true });
            },
            onMessage: {
              addListener(listener: Listener) {
                harness.listener = listener;
              },
            },
          },
        },
        configurable: true,
      });
    },
    {
      savedProfile: profile,
      savedResumeFile: resumeFile ?? null,
      deferred: deferProfile,
    },
  );

  for (const path of extensionScripts) {
    await page.addScriptTag({ path });
  }

  await page.evaluate(async ({
    embeddedFrame,
    applicationCountry,
    availableProfile,
  }) => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<{ ok?: boolean }>;
        };
      }
    ).__panelHarness;
    const response = await harness.invoke({
      type: "JOB_AUTOFILL_START_SESSION",
      session: {
        id: "content-e2e-session",
        url: location.href,
        applicationOrigins: [location.origin],
        jobTitle: "Content script fixture",
        country: applicationCountry,
      },
      profile: {},
      profileAvailability: availableProfile,
      frameMode: embeddedFrame,
    });
    if (!response?.ok) {
      throw new Error("Unable to start the content script fixture.");
    }
  }, {
    embeddedFrame: frameMode,
    applicationCountry: country,
    availableProfile: profileAvailability ?? {},
  });
}

async function invokeAutofill(page: Page) {
  return page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );
}

test("section headings prevent applicant data from filling reference fields", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <main>
        <section>
          <h2>References</h2>
          <label>Email address <input id="reference-email" autocomplete="email"></label>
        </section>
        <section>
          <h2>Applicant</h2>
          <label>Email address <input id="applicant-email" autocomplete="email"></label>
        </section>
      </main>
    `,
    profile: { email: "applicant@example.com" },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#reference-email")).toHaveValue("");
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("disabling the extension cancels an in-flight profile fill", async ({ page }) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    deferProfile: true,
  });

  const result = await page.evaluate(async () => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          profileRequested: boolean;
          resolveProfile(): void;
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness;
    const fill = harness.invoke({ type: "JOB_AUTOFILL_FILL" });
    if (!harness.profileRequested) {
      throw new Error("The profile request did not start.");
    }
    await harness.invoke({ type: "JOB_AUTOFILL_EXTENSION_DISABLED" });
    harness.resolveProfile();
    return fill;
  });

  expect(result).toMatchObject({ ok: false });
  await expect(page.locator("#applicant-email")).toHaveValue("");
});

test("shows ready fields from availability without preloading profile values", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");
  await expect(page.locator("#applicant-email")).toHaveValue("");
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("answers standard negated sponsorship questions safely", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Do you not require visa sponsorship?</legend>
        <label><input type="radio" name="requires_sponsorship" value="yes"> Yes</label>
        <label><input type="radio" name="requires_sponsorship" value="no"> No</label>
      </fieldset>
    `,
    profile: { requiresSponsorship: "no" },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 1 });
  await expect(
    page.locator('input[name="requires_sponsorship"][value="yes"]'),
  ).toBeChecked();
});

test("does not confuse scheduling questions with work authorization", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>What days can you work?
        <select id="work-days">
          <option value="">Select</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekends">Weekends</option>
        </select>
      </label>
      <fieldset>
        <legend>Are you able to work overtime?</legend>
        <label><input type="radio" name="overtime" value="yes"> Yes</label>
        <label><input type="radio" name="overtime" value="no"> No</label>
      </fieldset>
    `,
    profile: { workAuthorization: "yes" },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#work-days")).toHaveValue("");
  await expect(page.locator('input[name="overtime"]:checked')).toHaveCount(0);
});

test("fills styled yes or no radios through the native click path", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <style>.choice input { opacity: 0; position: absolute; }</style>
      <fieldset>
        <legend>Are you legally authorized to work? Yes / No</legend>
        <label class="choice"><input type="radio" name="authorized" value="yes"> Yes</label>
        <label class="choice"><input type="radio" name="authorized" value="no"> No</label>
      </fieldset>
    `,
    profile: { workAuthorization: "yes" },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 1 });
  await expect(
    page.locator('input[name="authorized"][value="yes"]'),
  ).toBeChecked();
});

test("fills Workday-style comboboxes and ARIA radio groups", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <div class="form-group">
        <span id="region-label">State or province</span>
        <button
          id="region"
          type="button"
          role="combobox"
          aria-labelledby="region-label"
          aria-controls="region-options"
          aria-expanded="false"
          data-automation-id="addressSection_countryRegion"
        >Choose a region</button>
        <ul id="region-options" role="listbox" hidden>
          <li role="option" data-value="BC">British Columbia</li>
          <li role="option" data-value="ON">Ontario</li>
        </ul>
      </div>
      <div role="radiogroup" aria-label="Are you legally authorized to work?">
        <div role="radio" aria-checked="false" data-value="yes">Yes</div>
        <div role="radio" aria-checked="false" data-value="no">No</div>
      </div>
      <script>
        const combo = document.querySelector("#region");
        const list = document.querySelector("#region-options");
        combo.addEventListener("click", () => {
          list.hidden = false;
          combo.setAttribute("aria-expanded", "true");
        });
        for (const option of list.querySelectorAll("[role=option]")) {
          option.addEventListener("click", () => {
            for (const candidate of list.querySelectorAll("[role=option]")) {
              candidate.setAttribute("aria-selected", String(candidate === option));
            }
            combo.dataset.value = option.dataset.value;
            combo.textContent = option.textContent;
            combo.setAttribute("aria-expanded", "false");
            list.hidden = true;
          });
        }
        for (const radio of document.querySelectorAll("[role=radio]")) {
          radio.addEventListener("click", () => {
            for (const candidate of radio.parentElement.querySelectorAll("[role=radio]")) {
              candidate.setAttribute("aria-checked", String(candidate === radio));
            }
          });
        }
      </script>
    `,
    profile: {
      location: "Toronto, ON",
      workAuthorization: "yes",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#region")).toHaveAttribute("data-value", "ON");
  await expect(
    page.locator('[role="radio"][data-value="yes"]'),
  ).toHaveAttribute("aria-checked", "true");
});

test("fills split phone and location controls with canonical values", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>Country calling code
        <select id="calling-code">
          <option value="">Select</option>
          <option value="+1">Canada / United States (+1)</option>
          <option value="+44">United Kingdom (+44)</option>
        </select>
      </label>
      <label>National phone number <input id="national-phone"></label>
      <label>City <input id="city" autocomplete="address-level2"></label>
      <label>State or province
        <select id="region" autocomplete="address-level1">
          <option value="">Select</option>
          <option value="BC">British Columbia</option>
          <option value="ON">Ontario</option>
        </select>
      </label>
      <label>Country
        <select id="country" autocomplete="country">
          <option value="">Select</option>
          <option value="CA">Canada</option>
          <option value="US">United States</option>
        </select>
      </label>
    `,
    profile: {
      phone: "+1 (416) 555-0199",
      location: "Toronto, ON",
    },
    country: "CA",
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 5 });
  await expect(page.locator("#calling-code")).toHaveValue("+1");
  await expect(page.locator("#national-phone")).toHaveValue("(416) 555-0199");
  await expect(page.locator("#city")).toHaveValue("Toronto");
  await expect(page.locator("#region")).toHaveValue("ON");
  await expect(page.locator("#country")).toHaveValue("CA");
});

test("fills structured education and recurring application questions", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>School <input id="school"></label>
      <label>Degree
        <select id="degree">
          <option value="">Select</option>
          <option value="BS">Bachelor of Science</option>
          <option value="MS">Master of Science</option>
        </select>
      </label>
      <label>Discipline <input id="discipline"></label>
      <label>Graduation date <input id="graduation-date" type="month"></label>
      <label>GPA (Undergraduate) <input id="undergraduate-gpa"></label>
      <label>GPA (Graduate) <input id="graduate-gpa"></label>
      <label>GPA (Doctorate) <input id="doctorate-gpa"></label>
      <label>SAT Score <input id="sat"></label>
      <label>ACT Score <input id="act"></label>
      <label>GRE Score <input id="gre"></label>
      <label>How did you hear about this job?
        <select id="source">
          <option value="">Select</option>
          <option value="company">Company Website</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </label>
      <label>Active Security Clearance(s)
        <select id="clearance">
          <option value="">Select</option>
          <option value="none">None</option>
          <option value="secret">Secret</option>
        </select>
      </label>
      <fieldset>
        <legend>Can you perform all of the essential functions of this role with or without reasonable accommodations?</legend>
        <label><input type="radio" name="essential-functions" value="yes"> Yes</label>
        <label><input type="radio" name="essential-functions" value="no"> No</label>
      </fieldset>
      <label>Citizenship Status
        <select id="citizenship">
          <option value="">Select</option>
          <option value="citizen">U.S. Citizen</option>
          <option value="green-card">Green Card Holder</option>
        </select>
      </label>
      <label>Pronouns
        <select id="pronouns">
          <option value="">Select</option>
          <option value="she">She / Her / Hers</option>
          <option value="they">They / Them / Theirs</option>
        </select>
      </label>
      <fieldset>
        <legend>Gender identity</legend>
        <label><input type="radio" name="gender" value="female"> Female</label>
        <label><input type="radio" name="gender" value="male"> Male</label>
      </fieldset>
      <label>Race / Ethnicity
        <select id="race-ethnicity">
          <option value="">Select</option>
          <option value="black">Black / African American</option>
          <option value="white">White</option>
        </select>
      </label>
      <label>Disability status
        <select id="disability">
          <option value="">Select</option>
          <option value="yes">Yes, I have a disability or have had one in the past</option>
          <option value="no">No, I do not have a disability and have not had one in the past</option>
          <option value="decline">I do not want to answer</option>
        </select>
      </label>
      <label>Protected veteran status
        <select id="veteran">
          <option value="">Select</option>
          <option value="protected">I identify as one or more classifications of a protected veteran</option>
          <option value="not-protected">I am not a protected veteran</option>
          <option value="decline">I do not wish to answer</option>
        </select>
      </label>
    `,
    profile: {
      school: "University of Ottawa",
      degree: "Bachelor's degree",
      fieldOfStudy: "Computer Science",
      graduationDate: "2026-05",
      undergraduateGpa: "3.8",
      graduateGpa: "3.9",
      doctorateGpa: "4.0",
      satScore: "1450",
      actScore: "33",
      greScore: "325",
      heardAboutJob: "LinkedIn",
      securityClearances: "None",
      canPerformEssentialFunctions: "yes",
      citizenshipStatus: "Permanent resident",
      pronouns: "She/her",
      gender: "Woman",
      raceEthnicity: "Black or African American",
      disabilityStatus: "no",
      veteranStatus: "Not a protected veteran",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 19 });
  await expect(page.locator("#school")).toHaveValue("University of Ottawa");
  await expect(page.locator("#degree")).toHaveValue("BS");
  await expect(page.locator("#discipline")).toHaveValue("Computer Science");
  await expect(page.locator("#graduation-date")).toHaveValue("2026-05");
  await expect(page.locator("#undergraduate-gpa")).toHaveValue("3.8");
  await expect(page.locator("#graduate-gpa")).toHaveValue("3.9");
  await expect(page.locator("#doctorate-gpa")).toHaveValue("4.0");
  await expect(page.locator("#sat")).toHaveValue("1450");
  await expect(page.locator("#act")).toHaveValue("33");
  await expect(page.locator("#gre")).toHaveValue("325");
  await expect(page.locator("#source")).toHaveValue("linkedin");
  await expect(page.locator("#clearance")).toHaveValue("none");
  await expect(
    page.locator('input[name="essential-functions"][value="yes"]'),
  ).toBeChecked();
  await expect(page.locator("#citizenship")).toHaveValue("green-card");
  await expect(page.locator("#pronouns")).toHaveValue("she");
  await expect(page.locator('input[name="gender"][value="female"]')).toBeChecked();
  await expect(page.locator("#race-ethnicity")).toHaveValue("black");
  await expect(page.locator("#disability")).toHaveValue("no");
  await expect(page.locator("#veteran")).toHaveValue("not-protected");
});

test("fills generic Other details only when nearby context identifies them", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <section><h3>Degree</h3><label>Please specify <input id="degree-other"></label></section>
      <section><h3>How did you hear about this opportunity?</h3><label>Please specify <input id="source-other"></label></section>
      <section><h3>Citizenship status</h3><label>Please specify <input id="citizenship-other"></label></section>
      <section><h3>Pronouns</h3><label>Please specify <input id="pronouns-other"></label></section>
      <section><h3>Gender identity</h3><label>Please specify <input id="gender-other"></label></section>
      <section><h3>Race and ethnicity</h3><label>Please specify <input id="race-other"></label></section>
      <section><h3>Additional information</h3><label>Please specify <input id="ambiguous-other"></label></section>
    `,
    profile: {
      degreeOther: "Diploma in Software Engineering",
      heardAboutJobOther: "Hackathon",
      citizenshipStatusOther: "Non-citizen national",
      pronounsOther: "Ze/hir",
      genderOther: "Genderqueer",
      raceEthnicityOther: "West Asian",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 6 });
  await expect(page.locator("#degree-other")).toHaveValue(
    "Diploma in Software Engineering",
  );
  await expect(page.locator("#source-other")).toHaveValue("Hackathon");
  await expect(page.locator("#citizenship-other")).toHaveValue(
    "Non-citizen national",
  );
  await expect(page.locator("#pronouns-other")).toHaveValue("Ze/hir");
  await expect(page.locator("#gender-other")).toHaveValue("Genderqueer");
  await expect(page.locator("#race-other")).toHaveValue("West Asian");
  await expect(page.locator("#ambiguous-other")).toHaveValue("");
});

test("fills contenteditable fields on generic application forms", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <div class="form-group">
        <label id="cover-label">Message to hiring manager</label>
        <div
          id="cover"
          role="textbox"
          contenteditable="true"
          aria-labelledby="cover-label"
        ></div>
      </div>
    `,
    profile: { coverLetter: "I am excited to apply." },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#cover")).toHaveText("I am excited to apply.");
});

test("fills fields inside open shadow roots and same-origin frames", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<main id="application"></main>`,
    profile: { email: "applicant@example.com" },
  });

  await page.evaluate(async () => {
    const host = document.createElement("section");
    host.id = "shadow-application";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<label>Email address <input id="shadow-email" autocomplete="email"></label>';
    document.querySelector("#application")?.append(host);

    const frame = document.createElement("iframe");
    frame.id = "application-frame";
    frame.srcdoc =
      '<label>Email address <input id="frame-email" autocomplete="email"></label>';
    document.querySelector("#application")?.append(frame);
    await new Promise<void>((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
    });
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  expect(
    await page.locator("#shadow-application").evaluate((host) => {
      const input = host.shadowRoot?.querySelector<HTMLInputElement>(
        "#shadow-email",
      );
      return input?.value;
    }),
  ).toBe("applicant@example.com");
  expect(
    await page
      .locator("#application-frame")
      .contentFrame()
      .locator("#frame-email")
      .inputValue(),
  ).toBe("applicant@example.com");
});

test("embedded frame agents fill without mounting duplicate panels", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="embedded-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    frameMode: true,
  });

  await expect(page.locator("#job-autofill-extension-panel")).toHaveCount(0);
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#embedded-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("flags ambiguous fields instead of guessing", async ({ page }) => {
  await installContentPanel(page, {
    html: `<label>Email or mobile <input id="ambiguous-contact" required></label>`,
    profile: {
      email: "applicant@example.com",
      phone: "+1 416 555 0199",
    },
    revealPanel: true,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#ambiguous-contact")).toHaveValue("");
  await expect(page.locator("#ambiguous-contact")).toHaveAttribute(
    "data-job-autofill-review",
    "uncertain",
  );
  await expect(
    page
      .locator("#job-autofill-extension-panel")
      .getByText(/could be email address or phone number/i),
  ).toBeVisible();
});

test("does not reuse saved answers for generic or reversed questions", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>Please specify
        <input id="source-details" name="application_source">
      </label>
      <fieldset>
        <legend>Are you unable to perform the essential functions of this role?</legend>
        <label><input type="radio" name="unable" value="yes"> Yes</label>
        <label><input type="radio" name="unable" value="no"> No</label>
      </fieldset>
    `,
    profile: {
      heardAboutJob: "Employee referral",
      canPerformEssentialFunctions: "yes",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source-details")).toHaveValue("");
  await expect(page.locator('input[name="unable"]:checked')).toHaveCount(0);
});

test("rescans fields added by a hydrated application step", async ({ page }) => {
  await installContentPanel(page, {
    html: `<main id="application"></main>`,
    profile: { email: "applicant@example.com" },
    revealPanel: true,
  });

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "hydrated-email";
    input.setAttribute("data-automation-id", "email");
    document.querySelector("#application")?.append(input);
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-attention-count]")).toHaveText("1");
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#hydrated-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("uses ATS metadata when generated controls have no labels", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <input id="greenhouse-name" data-mapped="first_name">
      <input id="lever-linkedin" name="urls[LinkedIn]">
      <input id="ashby-email" data-testid="candidateEmail">
      <input id="workday-city" data-automation-id="addressSection_city">
    `,
    profile: {
      firstName: "Sacha",
      email: "sacha@example.com",
      linkedinUrl: "https://www.linkedin.com/in/sacha",
      location: "Toronto, ON",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 4 });
  await expect(page.locator("#greenhouse-name")).toHaveValue("Sacha");
  await expect(page.locator("#lever-linkedin")).toHaveValue(
    "https://www.linkedin.com/in/sacha",
  );
  await expect(page.locator("#ashby-email")).toHaveValue("sacha@example.com");
  await expect(page.locator("#workday-city")).toHaveValue("Toronto");
});

test("uploads the saved PDF only to a recognized resume input", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label>Resume / CV <input id="resume" type="file" style="display:none"></label>
      <label>Cover letter <input id="cover-letter" type="file"></label>
      <label>Attach <input id="generic-attachment" type="file"></label>
    `,
    profile: {},
    resumeFile: {
      fileName: "jane-resume.pdf",
      mimeType: "application/pdf",
      base64: "JVBERi0xLjQKJUVPRg==",
    },
  });

  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness.invoke({ type: "JOB_AUTOFILL_FILL" }),
  );

  expect(result).toMatchObject({ ok: true, filled: 1 });
  expect(
    await page.locator("#resume").evaluate((input: HTMLInputElement) => ({
      name: input.files?.[0]?.name,
      type: input.files?.[0]?.type,
    })),
  ).toEqual({
    name: "jane-resume.pdf",
    type: "application/pdf",
  });
  expect(
    await page
      .locator("#cover-letter")
      .evaluate((input: HTMLInputElement) => input.files?.length || 0),
  ).toBe(0);
  expect(
    await page
      .locator("#generic-attachment")
      .evaluate((input: HTMLInputElement) => input.files?.length || 0),
  ).toBe(0);
});

test("panel fits a narrow viewport and autofills from its own button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email"></label>`,
    profile: { email: "applicant@example.com" },
    revealPanel: true,
  });

  const panelHost = page.locator("#job-autofill-extension-panel");
  const panelBox = await panelHost.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(360);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(640);

  const firstStat = panelHost.locator(".stat").first();
  const countBox = await firstStat.locator("strong").boundingBox();
  const labelBox = await firstStat.locator("span").boundingBox();
  expect(countBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(labelBox!.x);

  await panelHost
    .getByRole("button", { name: "Autofill ready fields" })
    .click();
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
  await expect(
    panelHost.getByText("Filled 1 field. Review every answer."),
  ).toBeVisible();
});
