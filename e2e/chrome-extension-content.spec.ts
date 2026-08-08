import { expect, test } from "@playwright/test";
import {
  installContentPanel,
  invokeAutofill,
} from "./helpers/chrome-extension-harness";

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

test("cancelled combobox fill preserves newer user input", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label id="school-label" for="school">School</label>
      <input id="school" role="combobox" aria-labelledby="school-label" aria-controls="school-options">
      <div id="school-options" role="listbox" hidden></div>
      <script>
        const input = document.getElementById("school");
        const listbox = document.getElementById("school-options");
        let loading = false;
        const open = () => {
          listbox.hidden = false;
          if (loading || listbox.children.length) return;
          loading = true;
          setTimeout(() => {
            const option = document.createElement("div");
            option.setAttribute("role", "option");
            option.textContent = "University of Ottawa";
            option.addEventListener("click", () => {
              document.body.dataset.optionClicked = "true";
              input.value = option.textContent;
            });
            listbox.append(option);
          }, 300);
        };
        input.addEventListener("click", open);
        input.addEventListener("input", open);
      </script>
    `,
    profile: { school: "University of Ottawa" },
  });

  const result = await page.evaluate(async () => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness;
    const fill = harness.invoke({ type: "JOB_AUTOFILL_FILL" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await harness.invoke({ type: "JOB_AUTOFILL_EXTENSION_DISABLED" });
    const input = document.getElementById("school") as HTMLInputElement;
    input.value = "User choice";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return fill;
  });

  expect(result).toMatchObject({ ok: false });
  await page.waitForTimeout(300);
  await expect(page.locator("#school")).toHaveValue("User choice");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-option-clicked",
    "true",
  );
});

test("preserves answers entered while an earlier control is still filling", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label for="school">School *</label>
      <input id="school" role="combobox" aria-controls="school-options" aria-required="true">
      <div id="school-options" role="listbox" hidden></div>
      <label>Email address <input id="applicant-email" required></label>
      <script>
        const school = document.getElementById("school");
        school.addEventListener("click", () => {
          document.getElementById("school-options").hidden = false;
        });
      </script>
    `,
    profile: {
      school: "University of Ottawa",
      email: "saved@example.com",
    },
    requiredByDefault: false,
  });

  const result = await page.evaluate(async () => {
    const harness = (
      globalThis as unknown as {
        __panelHarness: {
          invoke(message: unknown): Promise<unknown>;
        };
      }
    ).__panelHarness;
    const fill = harness.invoke({ type: "JOB_AUTOFILL_FILL" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const email = document.getElementById(
      "applicant-email",
    ) as HTMLInputElement;
    email.value = "user@example.com";
    email.dispatchEvent(new Event("input", { bubbles: true }));
    return fill;
  });

  expect(result).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#applicant-email")).toHaveValue(
    "user@example.com",
  );
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

test("fills only controls marked mandatory by semantic or ATS signals", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset aria-required="true">
        <legend>Contact information</legend>
        <label>
          Email address
          <span data-testid="required-indicator">Required</span>
          <input id="required-email" required>
        </label>
        <label>Phone number <input id="optional-phone"></label>
      </fieldset>
      <label id="city-label" for="required-city">Location (City)</label>
      <select id="required-city" aria-labelledby="city-label" aria-required="true">
        <option value="">Select</option>
        <option value="nyc">New York City, New York, United States</option>
        <option value="newark">Newark, New Jersey, United States</option>
      </select>
      <div class="application-question" data-required="true">
        <label>School
          <select id="required-school">
            <option value="">Select</option>
            <option value="uottawa">University of Ottawa</option>
            <option value="stanford">Stanford University</option>
          </select>
        </label>
      </div>
      <label>How did you hear about us? <span aria-hidden="true">*</span>
        <select id="required-source">
          <option value="">Select</option>
          <option value="agency">Staffing agency</option>
          <option value="not-listed">Not listed above</option>
        </select>
      </label>
      <fieldset>
        <legend>Are you legally authorized to work? Required</legend>
        <label><input type="radio" name="required-authorization" value="yes"> Yes</label>
        <label><input type="radio" name="required-authorization" value="no"> No</label>
      </fieldset>
      <label>Degree (optional)
        <select id="optional-degree">
          <option value="">Select</option>
          <option value="bs">Bachelor of Science</option>
        </select>
      </label>
      <label id="optional-school-label">School (optional)</label>
      <button
        id="optional-school"
        type="button"
        role="combobox"
        aria-labelledby="optional-school-label"
        aria-controls="optional-school-options"
      >Choose a school</button>
      <div id="optional-school-options" role="listbox" hidden>
        <div role="option" data-value="uottawa">University of Ottawa</div>
      </div>
      <label>Resume PDF (optional)
        <input id="optional-resume" type="file">
      </label>
    `,
    profile: {
      email: "applicant@example.com",
      phone: "+1 212 555 0100",
      location: "New York, NY",
      school: "University of Ottawa",
      heardAboutJob: "LinkedIn",
      workAuthorization: "yes",
      degree: "Bachelor's degree",
    },
    resumeFile: {
      fileName: "applicant-resume.pdf",
      mimeType: "application/pdf",
      base64: "JVBERi0xLjQKJUVPRg==",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 5 });
  await expect(page.locator("#required-email")).toHaveValue(
    "applicant@example.com",
  );
  await expect(page.locator("#required-city")).toHaveValue("nyc");
  await expect(page.locator("#required-school")).toHaveValue("uottawa");
  await expect(page.locator("#required-source")).toHaveValue("not-listed");
  await expect(
    page.locator('input[name="required-authorization"][value="yes"]'),
  ).toBeChecked();
  await expect(page.locator("#optional-phone")).toHaveValue("");
  await expect(page.locator("#optional-degree")).toHaveValue("");
  await expect(page.locator("#optional-school")).toHaveText("Choose a school");
  expect(
    await page
      .locator("#optional-resume")
      .evaluate((input: HTMLInputElement) => input.files?.length || 0),
  ).toBe(0);
});

test("matches city variants in native and custom selects and dispatches ATS events", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>Location (City) *
        <select id="native-city">
          <option value="">Select</option>
          <option value="ny">New York City, New York, United States</option>
          <option value="nj">New York City, New Jersey, United States</option>
        </select>
      </label>
      <div class="application-question">
        <label id="custom-location-label">Current location</label>
        <input
          id="custom-location"
          role="combobox"
          aria-labelledby="custom-location-label"
          aria-required="true"
          aria-controls="custom-location-options"
          aria-expanded="false"
        >
        <div id="custom-location-options" role="listbox" hidden>
          <div role="option" data-value="ny">New York City - NY</div>
          <div role="option" data-value="nj">New York City - NJ</div>
        </div>
      </div>
      <script>
        const nativeCity = document.getElementById("native-city");
        const customLocation = document.getElementById("custom-location");
        const listbox = document.getElementById("custom-location-options");
        window.nativeCityEvents = [];
        window.customLocationEvents = [];
        for (const eventName of ["click", "input", "change", "blur"]) {
          nativeCity.addEventListener(eventName, () => window.nativeCityEvents.push(eventName));
          customLocation.addEventListener(eventName, () => window.customLocationEvents.push(eventName));
        }
        customLocation.addEventListener("click", () => {
          customLocation.setAttribute("aria-expanded", "true");
          listbox.hidden = false;
        });
        for (const option of listbox.querySelectorAll("[role=option]")) {
          option.addEventListener("click", () => {
            for (const candidate of listbox.querySelectorAll("[role=option]")) {
              candidate.setAttribute("aria-selected", String(candidate === option));
            }
            customLocation.value = option.textContent;
            customLocation.dataset.value = option.dataset.value;
            customLocation.setAttribute("aria-valuetext", option.textContent);
            customLocation.setAttribute("aria-expanded", "false");
            listbox.hidden = true;
          });
        }
      </script>
    `,
    profile: { location: "New York, NY" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#native-city")).toHaveValue("ny");
  await expect(page.locator("#custom-location")).toHaveValue(
    "New York City - NY",
  );
  const events = await page.evaluate(() => ({
    native: (globalThis as unknown as { nativeCityEvents: string[] })
      .nativeCityEvents,
    custom: (globalThis as unknown as { customLocationEvents: string[] })
      .customLocationEvents,
  }));
  expect(events.native).toEqual(
    expect.arrayContaining(["click", "input", "change", "blur"]),
  );
  expect(events.custom).toEqual(
    expect.arrayContaining(["click", "input", "change", "blur"]),
  );
});

test("uses benign select fallbacks without guessing consequential answers", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label for="source">How did you hear about us?*</label>
      <input id="source" role="combobox" aria-controls="source-list" aria-expanded="false">
      <div id="source-list" role="listbox" hidden>
        <button type="button" role="option" data-value="agency" hidden>Staffing agency</button>
        <button type="button" role="option" data-value="other" hidden>Other</button>
      </div>
      <label>Degree
        <select id="degree" required>
          <option value="">Select</option>
          <option value="high-school">High school diploma</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>Citizenship status
        <select id="citizenship" required>
          <option value="">Select</option>
          <option value="temporary">Temporary resident</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>Gender identity
        <select id="gender" required>
          <option value="">Select</option>
          <option value="man">Man</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>Are you legally authorized to work?
        <select id="authorization" required>
          <option value="">Select</option>
          <option value="unknown">Unknown</option>
          <option value="other">Other</option>
        </select>
      </label>
      <script>
        const source = document.querySelector("#source");
        const sourceList = document.querySelector("#source-list");
        const sourceOptions = [...sourceList.querySelectorAll("[role=option]")];
        source.addEventListener("click", () => {
          sourceList.hidden = false;
          source.setAttribute("aria-expanded", "true");
        });
        source.addEventListener("input", () => {
          sourceList.hidden = false;
          source.setAttribute("aria-expanded", "true");
          const query = source.value.trim().toLowerCase();
          if (query) {
            sourceOptions.forEach((option) => {
              option.hidden = !option.textContent.toLowerCase().includes(query);
            });
            return;
          }
          setTimeout(() => {
            sourceOptions.forEach((option) => {
              option.hidden = false;
            });
          }, 250);
        });
        sourceOptions.forEach((option) => {
          option.addEventListener("click", () => {
            sourceOptions.forEach((candidate) =>
              candidate.setAttribute(
                "aria-selected",
                String(candidate === option),
              ),
            );
            source.value = option.textContent;
            source.setAttribute("aria-valuetext", option.textContent);
            source.setAttribute("aria-expanded", "false");
            sourceList.hidden = true;
          });
        });
      </script>
    `,
    profile: {
      heardAboutJob: "LinkedIn",
      degree: "Doctorate",
      citizenshipStatus: "Permanent resident",
      gender: "Non-binary",
      workAuthorization: "yes",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#source")).toHaveValue("Other");
  await expect(page.locator("#degree")).toHaveValue("other");
  await expect(page.locator("#citizenship")).toHaveValue("");
  await expect(page.locator("#gender")).toHaveValue("");
  await expect(page.locator("#authorization")).toHaveValue("");
  await expect(page.locator("#citizenship")).toHaveAttribute(
    "data-job-autofill-review",
    "failed",
  );
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
          <option value="linkedin">LinkedIn / Social media</option>
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
      citizenshipStatus: "Other",
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
      '<label>Email address <input id="shadow-email" autocomplete="email" required></label>';
    document.querySelector("#application")?.append(host);

    const frame = document.createElement("iframe");
    frame.id = "application-frame";
    frame.srcdoc =
      '<label>Email address <input id="frame-email" autocomplete="email" required></label>';
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
      <label>Have you worked for more than two years as a software engineer?
        <select id="worked-duration">
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    `,
    profile: {
      heardAboutJob: "Employee referral",
      canPerformEssentialFunctions: "yes",
      previousEmployers: "Cisco\nRivian",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source-details")).toHaveValue("");
  await expect(page.locator('input[name="unable"]:checked')).toHaveCount(0);
  await expect(page.locator("#worked-duration")).toHaveValue("");
});

test("keeps unrelated named checkboxes manual inside a shared fieldset", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Application acknowledgements</legend>
        <label><input id="certify" type="checkbox" name="certify"> I certify that this application is accurate</label>
        <label><input id="newsletter" type="checkbox" name="newsletter"> Send me job alerts</label>
      </fieldset>
    `,
    profile: {
      preferredOfficeLocations: "New York, NY\nToronto, ON",
    },
    revealPanel: true,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#certify")).not.toBeChecked();
  await expect(page.locator("#newsletter")).not.toBeChecked();
  await expect(
    page
      .locator("#job-autofill-extension-panel")
      .getByText("Review this checkbox manually."),
  ).toHaveCount(2);
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
    input.required = true;
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

test("fills a Greenhouse-style application from the complete saved profile", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <main id="application-form">
        <div class="application-question">
          <label id="city-label" for="city">Location (City)</label>
          <input id="city" role="combobox" aria-labelledby="city-label" aria-controls="city-options" aria-expanded="false">
          <div id="city-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="school-label" for="school">School</label>
          <input id="school" role="combobox" aria-labelledby="school-label" aria-controls="school-options" aria-expanded="false">
          <div id="school-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="degree-label" for="degree">Degree</label>
          <input id="degree" role="combobox" aria-labelledby="degree-label" aria-controls="degree-options" aria-expanded="false">
          <div id="degree-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="authorization-label" for="authorization">Are you legally authorized to work in the US?</label>
          <input id="authorization" role="combobox" aria-labelledby="authorization-label" aria-controls="authorization-options" aria-expanded="false">
          <div id="authorization-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="sponsorship-now-label" for="sponsorship-now">Will you now require immigration sponsorship?</label>
          <input id="sponsorship-now" role="combobox" aria-labelledby="sponsorship-now-label" aria-controls="sponsorship-now-options" aria-expanded="false">
          <div id="sponsorship-now-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="sponsorship-future-label" for="sponsorship-future">Will you in the future require immigration sponsorship?</label>
          <input id="sponsorship-future" role="combobox" aria-labelledby="sponsorship-future-label" aria-controls="sponsorship-future-options" aria-expanded="false">
          <div id="sponsorship-future-options" role="listbox" hidden></div>
        </div>
        <label>Have you previously worked for Cisco?
          <select id="worked-cisco">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>Have you ever worked at Datadog?
          <select id="worked-datadog">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <fieldset class="application-question">
          <legend>This role is currently open to candidates who can work from one of the following office locations. Select all that apply.</legend>
          <label><input id="office-new-york" type="checkbox" name="office-new-york" value="nyc"> New York, New York, United States</label>
          <label><input id="office-toronto" type="checkbox" name="office-toronto" value="toronto"> Toronto, Ontario, Canada</label>
          <label><input id="office-austin" type="checkbox" name="office-austin" value="austin"> Austin, Texas, United States</label>
        </fieldset>
        <label>How many years of software engineering industry experience do you have?
          <input id="software-years" type="number">
        </label>
        <label>How many years of software engineering industry experience do you have (excluding internships)?
          <input id="software-years-excluding-internships" type="number">
        </label>
        <label>What are your target total annual compensation expectations?
          <input id="compensation">
        </label>
        <div class="application-question">
          <label id="pronouns-label" for="pronouns">Pronouns</label>
          <input id="pronouns" role="combobox" aria-labelledby="pronouns-label" aria-controls="pronouns-options" aria-expanded="false">
          <div id="pronouns-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="gender-label" for="gender">Gender identity</label>
          <input id="gender" role="combobox" aria-labelledby="gender-label" aria-controls="gender-options" aria-expanded="false">
          <div id="gender-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="race-label" for="race">Race / Ethnicity</label>
          <input id="race" role="combobox" aria-labelledby="race-label" aria-controls="race-options" aria-expanded="false">
          <div id="race-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="disability-label" for="disability">Disability status</label>
          <input id="disability" role="combobox" aria-labelledby="disability-label" aria-controls="disability-options" aria-expanded="false">
          <div id="disability-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="veteran-label" for="veteran">Protected veteran status</label>
          <input id="veteran" role="combobox" aria-labelledby="veteran-label" aria-controls="veteran-options" aria-expanded="false">
          <div id="veteran-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="hispanic-label" for="hispanic">Are you Hispanic or Latino?</label>
          <input id="hispanic" role="combobox" aria-labelledby="hispanic-label" aria-controls="hispanic-options" aria-expanded="false">
          <div id="hispanic-options" role="listbox" hidden></div>
        </div>
        <div class="application-question">
          <label id="transgender-label" for="transgender">Do you identify as transgender?</label>
          <input id="transgender" role="combobox" aria-labelledby="transgender-label" aria-controls="transgender-options" aria-expanded="false">
          <div id="transgender-options" role="listbox" hidden></div>
        </div>
      </main>
      <script>
        const comboboxOptions = {
          city: [["sf", "San Francisco"], ["nyc", "New York"]],
          school: [["uottawa", "University of Ottawa"], ["stanford", "Stanford University"]],
          degree: [["bs", "Bachelor of Science"], ["ms", "Master of Science"]],
          authorization: [["yes", "Yes"], ["no", "No"]],
          "sponsorship-now": [["yes", "Yes"], ["no", "No"]],
          "sponsorship-future": [["yes", "Yes"], ["no", "No"]],
          pronouns: [["they", "They / Them / Theirs"], ["she", "She / Her / Hers"]],
          gender: [["nonbinary", "Non-binary"], ["woman", "Woman"]],
          race: [["asian", "Asian"], ["white", "White"]],
          disability: [
            ["yes", "Yes, I have a disability or have had one in the past"],
            ["no", "No, I do not have a disability and have not had one in the past"]
          ],
          veteran: [
            ["protected", "I identify as one or more classifications of a protected veteran"],
            ["not-protected", "I am not a protected veteran"]
          ],
          hispanic: [["yes", "Yes, Hispanic or Latino"], ["no", "No, not Hispanic or Latino"]],
          transgender: [["yes", "Yes"], ["no", "No"]]
        };

        for (const [id, options] of Object.entries(comboboxOptions)) {
          const input = document.getElementById(id);
          const listbox = document.getElementById(id + "-options");
          let loading = false;
          const open = () => {
            input.setAttribute("aria-expanded", "true");
            listbox.hidden = false;
            if (listbox.children.length || loading) return;
            loading = true;
            setTimeout(() => {
              for (const [value, label] of options) {
                const option = document.createElement("div");
                option.setAttribute("role", "option");
                option.dataset.value = value;
                option.textContent = label;
                option.addEventListener("click", () => {
                  for (const candidate of listbox.querySelectorAll("[role=option]")) {
                    candidate.setAttribute("aria-selected", String(candidate === option));
                  }
                  input.value = label;
                  input.dataset.value = value;
                  input.setAttribute("aria-valuetext", label);
                  input.setAttribute("aria-expanded", "false");
                  listbox.hidden = true;
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                });
                listbox.append(option);
              }
              loading = false;
            }, 140);
          };
          input.addEventListener("click", open);
          input.addEventListener("input", open);
        }
      </script>
    `,
    profile: {
      location: "San Francisco, CA",
      school: "University of Ottawa",
      degree: "Bachelor's degree",
      workAuthorization: "yes",
      requiresSponsorship: "no",
      previousEmployers: "Cisco\nRivian",
      preferredOfficeLocations: "New York, NY\nToronto, ON",
      softwareIndustryExperienceYears: "2",
      compensationExpectation: "$150,000 USD",
      pronouns: "They/them",
      gender: "Non-binary",
      raceEthnicity: "Asian",
      disabilityStatus: "no",
      veteranStatus: "Not a protected veteran",
      hispanicLatino: "no",
      transgenderStatus: "no",
    },
    country: "US",
    company: "Cisco",
  });

  const result = await invokeAutofill(page);
  expect(result).toMatchObject({ ok: true });
  await expect(page.locator("#city")).toHaveValue("San Francisco");
  await expect(page.locator("#school")).toHaveValue("University of Ottawa");
  await expect(page.locator("#degree")).toHaveValue("Bachelor of Science");
  await expect(page.locator("#authorization")).toHaveValue("Yes");
  await expect(page.locator("#sponsorship-now")).toHaveValue("No");
  await expect(page.locator("#sponsorship-future")).toHaveValue("No");
  await expect(page.locator("#worked-cisco")).toHaveValue("yes");
  await expect(page.locator("#worked-datadog")).toHaveValue("");
  await expect(page.locator("#office-new-york")).toBeChecked();
  await expect(page.locator("#office-toronto")).toBeChecked();
  await expect(page.locator("#office-austin")).not.toBeChecked();
  await expect(page.locator("#software-years")).toHaveValue("2");
  await expect(
    page.locator("#software-years-excluding-internships"),
  ).toHaveValue("2");
  await expect(page.locator("#compensation")).toHaveValue("$150,000 USD");
  await expect(page.locator("#pronouns")).toHaveValue("They / Them / Theirs");
  await expect(page.locator("#gender")).toHaveValue("Non-binary");
  await expect(page.locator("#race")).toHaveValue("Asian");
  await expect(page.locator("#disability")).toHaveValue(
    "No, I do not have a disability and have not had one in the past",
  );
  await expect(page.locator("#veteran")).toHaveValue(
    "I am not a protected veteran",
  );
  await expect(page.locator("#hispanic")).toHaveValue(
    "No, not Hispanic or Latino",
  );
  await expect(page.locator("#transgender")).toHaveValue("No");
  expect(result).toMatchObject({ filled: 18 });
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
    .getByRole("button", { name: "Autofill required fields" })
    .click();
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
  await expect(
    panelHost.getByText("Filled 1 required field. Review every answer."),
  ).toBeVisible();
});
