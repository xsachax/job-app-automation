import { expect, test } from "@playwright/test";
import {
  installContentPanel,
  invokeAutofill,
  invokePanel,
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

test("fills optional professional links and exceptional-work answers", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label>LinkedIn URL (optional) <input id="linkedin" type="url"></label>
      <label>GitHub URL (optional) <input id="github" type="url"></label>
      <label>Website URL (optional) <input id="website" type="url"></label>
      <label>
        Demonstration of exceptional work *
        <textarea id="exceptional-work" required></textarea>
      </label>
      <label>Phone number (optional) <input id="phone" type="tel"></label>
    `,
    profile: {
      linkedinUrl: "https://www.linkedin.com/in/sacha",
      githubUrl: "https://github.com/sacha",
      portfolioUrl: "https://sacha.example",
      exceptionalWork: "Built a deployment platform used by 40 teams.",
      phone: "+1 (416) 555-0199",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 4 });
  await expect(page.locator("#linkedin")).toHaveValue(
    "https://www.linkedin.com/in/sacha",
  );
  await expect(page.locator("#github")).toHaveValue("https://github.com/sacha");
  await expect(page.locator("#website")).toHaveValue("https://sacha.example");
  await expect(page.locator("#exceptional-work")).toHaveValue(
    "Built a deployment platform used by 40 teams.",
  );
  await expect(page.locator("#phone")).toHaveValue("");
});

test("disabling the extension cancels an in-flight profile fill", async ({ page }) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email" required></label>`,
    profile: { email: "applicant@example.com" },
    deferProfile: true,
    requiredByDefault: false,
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

test("closing the panel cancels an in-flight fill before embedded work starts", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<label>Email address <input id="applicant-email" autocomplete="email" required></label>`,
    profile: { email: "applicant@example.com" },
    deferProfile: true,
    requiredByDefault: false,
    revealPanel: true,
  });

  await page.evaluate(() => {
    const runtime = (
      globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage(message: { type: string }): Promise<unknown>;
          };
        };
      }
    ).chrome.runtime;
    const sendMessage = runtime.sendMessage.bind(runtime);
    runtime.sendMessage = (message) => {
      if (message.type === "JOB_AUTOFILL_FILL_EMBEDDED") {
        document.body.dataset.embeddedFillStarted = "true";
      }
      return sendMessage(message);
    };
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await panel
    .getByRole("button", { name: "Autofill application fields" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __panelHarness: { profileRequested: boolean };
            }
          ).__panelHarness.profileRequested,
      ),
    )
    .toBe(true);
  await panel.getByRole("button", { name: "Close panel" }).click();
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        __panelHarness: { resolveProfile(): void };
      }
    ).__panelHarness.resolveProfile();
  });

  await page.waitForTimeout(300);
  await expect(page.locator("#applicant-email")).toHaveValue("");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-embedded-fill-started",
  );
});

test("cancelled combobox fill preserves newer user input", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label id="school-label" for="school">School</label>
      <input id="school" role="combobox" aria-labelledby="school-label" aria-controls="school-options" aria-required="true">
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

test("preserves prefilled editable comboboxes without aria-expanded", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label id="source-role-label" for="source-role">How did you hear about us? *</label>
      <input
        id="source-role"
        role="combobox"
        aria-labelledby="source-role-label"
        aria-required="true"
        value="LinkedIn"
      >
      <label id="source-popup-label" for="source-popup">How did you hear about us? *</label>
      <input
        id="source-popup"
        aria-haspopup="listbox"
        aria-labelledby="source-popup-label"
        aria-required="true"
        value="Employee referral"
      >
      <script>
        for (const source of document.querySelectorAll("input")) {
          source.addEventListener("click", () => {
            document.body.dataset.comboboxClicks =
              String(Number(document.body.dataset.comboboxClicks || "0") + 1);
          });
          source.addEventListener("input", () => {
            document.body.dataset.comboboxInputs =
              String(Number(document.body.dataset.comboboxInputs || "0") + 1);
          });
        }
      </script>
    `,
    profile: { heardAboutJob: "Company career site" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source-role")).toHaveValue("LinkedIn");
  await expect(page.locator("#source-popup")).toHaveValue("Employee referral");
  await expect(page.locator("body")).not.toHaveAttribute("data-combobox-clicks");
  await expect(page.locator("body")).not.toHaveAttribute("data-combobox-inputs");
});

test("fills a committed button combobox once", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <div class="application-question">
        <label id="source-label">How did you hear about us? *</label>
        <div class="select-shell">
          <button
            id="source"
            type="button"
            role="combobox"
            aria-labelledby="source-label"
            aria-expanded="false"
            aria-required="true"
          >Choose source</button>
        </div>
        <div id="source-options" role="listbox" hidden>
          <div id="linkedin-option" role="option" data-value="linkedin">LinkedIn</div>
        </div>
      </div>
      <script>
        const source = document.getElementById("source");
        const listbox = document.getElementById("source-options");
        source.addEventListener("click", () => {
          source.setAttribute("aria-expanded", "true");
          listbox.hidden = false;
        });
        document.getElementById("linkedin-option").addEventListener("click", (event) => {
          const selected = document.createElement("div");
          selected.className = "select__single-value";
          selected.textContent = event.currentTarget.textContent;
          source.parentElement.querySelector(".select__single-value")?.remove();
          source.before(selected);
          source.setAttribute("aria-expanded", "false");
          listbox.hidden = true;
          document.body.dataset.optionClicks = String(
            Number(document.body.dataset.optionClicks || "0") + 1,
          );
        });
      </script>
    `,
    profile: { heardAboutJob: "LinkedIn" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator(".select__single-value")).toHaveText("LinkedIn");
  await expect(page.locator("body")).toHaveAttribute("data-option-clicks", "1");
});

test("preserves an explicit None combobox selection", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <div class="application-question">
        <label id="source-label">How did you hear about us? *</label>
        <button
          id="source"
          type="button"
          role="combobox"
          aria-labelledby="source-label"
          aria-required="true"
          data-value="none"
        >None</button>
        <script>
          document.getElementById("source").addEventListener("click", () => {
            document.body.dataset.sourceClicked = "true";
          });
        </script>
      </div>
    `,
    profile: { heardAboutJob: "LinkedIn" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source")).toHaveAttribute("data-value", "none");
  await expect(page.locator("body")).not.toHaveAttribute("data-source-clicked");
});

test("fills combobox options mounted in a shadow root after opening", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <div class="application-question">
        <label id="source-label">How did you hear about us? *</label>
        <button
          id="source"
          type="button"
          role="combobox"
          aria-labelledby="source-label"
          aria-expanded="false"
          aria-required="true"
        >Choose source</button>
      </div>
      <script>
        const source = document.getElementById("source");
        source.addEventListener("click", () => {
          if (document.getElementById("popup-host")) return;
          const host = document.createElement("div");
          host.id = "popup-host";
          const shadow = host.attachShadow({ mode: "open" });
          shadow.innerHTML = '<div role="listbox"><button type="button" role="option" data-value="linkedin">LinkedIn</button></div>';
          shadow.querySelector("[role=option]").addEventListener("click", (event) => {
            source.setAttribute("aria-valuetext", event.currentTarget.textContent);
            source.setAttribute("aria-expanded", "false");
            host.remove();
          });
          document.body.append(host);
          source.setAttribute("aria-expanded", "true");
        });
      </script>
    `,
    profile: { heardAboutJob: "LinkedIn" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#source")).toHaveAttribute(
    "aria-valuetext",
    "LinkedIn",
  );
});

test("does not count an extension-owned query without aria-expanded as answered", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label id="source-label" for="source">How did you hear about us? *</label>
      <input
        id="source"
        role="combobox"
        aria-labelledby="source-label"
        aria-required="true"
      >
    `,
    profile: { heardAboutJob: "LinkedIn" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source")).toHaveValue("");
  await expect(page.locator("#source")).toHaveAttribute(
    "data-job-autofill-review",
    "failed",
  );
});

test("a trusted option click releases retained query ownership", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label id="source-label" for="source">How did you hear about us? *</label>
      <input
        id="source"
        role="combobox"
        aria-labelledby="source-label"
        aria-required="true"
      >
      <div id="source-options" role="listbox" hidden>
        <div id="manual-source" role="option">Manual source</div>
      </div>
      <script>
        const source = document.getElementById("source");
        source.addEventListener("input", () => {
          if (source.value !== "LinkedIn") return;
          document.getElementById("source-options").hidden = false;
          setTimeout(() => {
            if (source.value === "LinkedIn") source.value = "Framework choice";
          }, 250);
        });
        document.getElementById("manual-source").addEventListener("click", () => {
          source.value = "LinkedIn";
          document.getElementById("source-options").hidden = true;
        });
      </script>
    `,
    profile: { heardAboutJob: "LinkedIn" },
    requiredByDefault: false,
    revealPanel: true,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator("#source")).toHaveValue("Framework choice");
  await expect(page.locator("#source")).toHaveAttribute(
    "data-job-autofill-review",
    "failed",
  );
  await page.locator("#manual-source").click();

  await expect(page.locator("#source")).toHaveValue("LinkedIn");
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(page.locator("#source")).not.toHaveAttribute(
    "data-job-autofill-review",
  );
  await expect(
    page.locator("#job-autofill-extension-panel").getByText("1 of 1 answered"),
  ).toBeVisible();
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

test("matches composite applicant fields from labels, help text, and ATS metadata", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <section>
        <h2>Applicant links</h2>
        <div class="field-shell" aria-required="true" data-field-name="candidate_linkedin_profile">
          <label for="required-linkedin">
            LinkedIn URL
            <span id="linkedin-help">Please provide your LinkedIn URL</span>
          </label>
          <input
            id="required-linkedin"
            type="url"
            aria-describedby="linkedin-help"
          >
        </div>
        <div class="field-shell">
          <label for="optional-linkedin">
            LinkedIn URL
            <span>Please provide your LinkedIn URL</span>
          </label>
          <input id="optional-linkedin" type="url">
        </div>
        <div class="field-shell required" aria-required="false">
          <label for="explicitly-optional-linkedin">LinkedIn profile URL</label>
          <input id="explicitly-optional-linkedin" type="url">
        </div>
        <div
          class="application-field"
          data-mandatory="true"
          data-field-name="candidate_given_name"
        >
          <label for="given-name">Given name Enter your given name</label>
          <input id="given-name">
        </div>
        <div
          class="form-group"
          aria-required="true"
          data-field-name="candidate_github_profile"
        >
          <label for="github-profile">Code hosting profile for your source code</label>
          <input id="github-profile" type="url">
        </div>
        <div class="application-question" aria-required="true">
          <label for="ambiguous-profile">Professional profile URL</label>
          <input id="ambiguous-profile" type="url">
        </div>
      </section>
    `,
    profile: {
      firstName: "Sacha",
      linkedinUrl: "https://www.linkedin.com/in/sacha",
      githubUrl: "https://github.com/sacha",
      portfolioUrl: "https://sacha.example",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 5 });
  await expect(page.locator("#required-linkedin")).toHaveValue(
    "https://www.linkedin.com/in/sacha",
  );
  await expect(page.locator("#given-name")).toHaveValue("Sacha");
  await expect(page.locator("#github-profile")).toHaveValue(
    "https://github.com/sacha",
  );
  await expect(page.locator("#optional-linkedin")).toHaveValue(
    "https://www.linkedin.com/in/sacha",
  );
  await expect(page.locator("#explicitly-optional-linkedin")).toHaveValue(
    "https://www.linkedin.com/in/sacha",
  );
  await expect(page.locator("#ambiguous-profile")).toHaveValue("");
  await expect(page.locator("#ambiguous-profile")).toHaveAttribute(
    "data-job-autofill-review",
    /unknown|uncertain/,
  );
});

test("fills required native radio groups from parent and member metadata", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <style>.styled-choice input { opacity: 0; position: absolute; }</style>
      <div class="application-question required">
        <p>Employment eligibility</p>
        <fieldset>
          <legend>Are you legally authorized to work?</legend>
          <label class="styled-choice">
            <input type="radio" name="authorization" value="yes"> Yes
          </label>
          <label class="styled-choice">
            <input type="radio" name="authorization" value="no"> No
          </label>
        </fieldset>
        <label>
          Explain your visa sponsorship needs (optional)
          <input id="authorization-explanation">
        </label>
      </div>
      <fieldset>
        <legend>Are you open to travel for this role?</legend>
        <label>
          <input type="radio" name="travel" value="yes" required> Yes
        </label>
        <label><input type="radio" name="travel" value="no"> No</label>
      </fieldset>
      <fieldset>
        <legend>Will you require visa sponsorship?</legend>
        <label>
          <input type="radio" name="sponsorship" value="yes" required>
          Yes, I will require sponsorship
        </label>
        <label>
          <input type="radio" name="sponsorship" value="no">
          No, I will not require sponsorship
        </label>
      </fieldset>
      <fieldset>
        <legend>Are you legally authorized to work? (optional)</legend>
        <label><input type="radio" name="optional-authorization" value="yes"> Yes</label>
        <label><input type="radio" name="optional-authorization" value="no"> No</label>
      </fieldset>
      <script>
        window.authorizationEvents = [];
        for (const radio of document.querySelectorAll('[name="authorization"]')) {
          for (const eventName of ["click", "input", "change"]) {
            radio.addEventListener(eventName, () =>
              window.authorizationEvents.push(eventName),
            );
          }
        }
      </script>
    `,
    profile: {
      workAuthorization: "yes",
      willingToTravel: "no",
      requiresSponsorship: "no",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 3 });
  await expect(
    page.locator('input[name="authorization"][value="yes"]'),
  ).toBeChecked();
  await expect(page.locator('input[name="travel"][value="no"]')).toBeChecked();
  await expect(
    page.locator('input[name="sponsorship"][value="no"]'),
  ).toBeChecked();
  await expect(page.locator("#authorization-explanation")).toHaveValue("");
  await expect(
    page.locator('input[name="optional-authorization"]:checked'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (globalThis as unknown as { authorizationEvents: string[] })
          .authorizationEvents,
    ),
  ).toEqual(expect.arrayContaining(["click", "input", "change"]));
});

test("fills required ARIA radios and safely inverts explicit relocation polarity", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <div class="application-field">
        <div id="age-question">Are you 18 years of age or older?</div>
        <p id="age-help">Select the response that applies to you.</p>
        <div
          role="radiogroup"
          aria-labelledby="age-question"
          aria-describedby="age-help"
          aria-required="true"
        >
          <div role="radio" aria-checked="false" data-value="true">Yes</div>
          <div role="radio" aria-checked="false" data-value="false">No</div>
        </div>
      </div>
      <fieldset aria-required="true">
        <legend>Are you not willing to relocate?</legend>
        <div role="radio" aria-checked="false" data-value="yes">Yes</div>
        <div role="radio" aria-checked="false" data-value="no">No</div>
      </fieldset>
      <script>
        for (const group of document.querySelectorAll('[role="radiogroup"], fieldset')) {
          for (const radio of group.querySelectorAll('[role="radio"]')) {
            radio.addEventListener("click", () => {
              for (const candidate of group.querySelectorAll('[role="radio"]')) {
                candidate.setAttribute("aria-checked", String(candidate === radio));
              }
            });
          }
        }
      </script>
    `,
    profile: {
      isAtLeast18: "yes",
      willingToRelocate: "yes",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(
    page.locator('[role="radiogroup"] [role="radio"][data-value="true"]'),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.locator('fieldset [role="radio"][data-value="no"]'),
  ).toHaveAttribute("aria-checked", "true");
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

test("never substitutes a phone extension for the phone number", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <label for="phone">Phone number</label>
      <input id="phone" type="tel" aria-describedby="phone-help">
      <p id="phone-help">Include your extension if applicable.</p>
    `,
    profile: {
      phone: "+1 (416) 555-0199 ext. 42",
      phoneExtension: "42",
    },
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#phone")).toHaveValue("+1 (416) 555-0199");
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
  await expect(page.locator("#required-source")).toHaveValue("agency");
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
    expect.arrayContaining(["click", "change", "blur"]),
  );
});

test("uses heard-about DOM-order fallbacks without guessing other answers", async ({
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
      <label>How did you hear about this opportunity?
        <select id="native-source-fallback" required>
          <option value="">Select a source</option>
          <option value="hidden" hidden>Hidden source</option>
          <option value="disabled" disabled>Disabled source</option>
          <option value="campus">Campus event</option>
          <option value="fair">Career fair</option>
        </select>
      </label>
      <fieldset>
        <legend>How did you hear about this job? *</legend>
        <label hidden>
          <input type="radio" name="radio-source" value="hidden" required>
          Hidden source
        </label>
        <label>
          <input type="radio" name="radio-source" value="disabled" disabled>
          Disabled source
        </label>
        <label>
          <input type="radio" name="radio-source" value="career-fair">
          Career fair
        </label>
        <label>
          <input type="radio" name="radio-source" value="conference">
          Conference
        </label>
      </fieldset>
      <label>How did you hear about us? (optional)
        <select id="optional-source-fallback">
          <option value="">Select a source</option>
          <option value="campus">Campus event</option>
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
      heardAboutJob: "A source that is not listed",
      degree: "Doctorate",
      citizenshipStatus: "Permanent resident",
      gender: "Non-binary",
      workAuthorization: "yes",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 3 });
  await expect(page.locator("#source")).toHaveValue("Staffing agency");
  await expect(page.locator("#native-source-fallback")).toHaveValue("campus");
  await expect(
    page.locator('input[name="radio-source"][value="career-fair"]'),
  ).toBeChecked();
  await expect(page.locator("#optional-source-fallback")).toHaveValue("");
  await expect(page.locator("#degree")).toHaveValue("");
  await expect(page.locator("#citizenship")).toHaveValue("");
  await expect(page.locator("#gender")).toHaveValue("");
  await expect(page.locator("#authorization")).toHaveValue("");
  await expect(page.locator("#citizenship")).toHaveAttribute(
    "data-job-autofill-review",
    "failed",
  );
});

test("keeps blank explicit degree, pronoun, and heard-about answers manual", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Degree level *</legend>
        <label><input type="radio" name="degree" value="opaque-bs" required> Bachelor of Science</label>
        <label><input type="radio" name="degree" value="opaque-ms"> Master of Science</label>
      </fieldset>
      <fieldset>
        <legend>What are your pronouns? *</legend>
        <div role="radio" aria-checked="false" data-value="opaque-they">They / Them / Theirs</div>
        <div role="radio" aria-checked="false" data-value="opaque-she">She / Her / Hers</div>
      </fieldset>
      <label>How did you hear about us?
        <select id="blank-source" required>
          <option value="">Select a source</option>
          <option value="first">First source</option>
        </select>
      </label>
    `,
    profile: { degree: "", pronouns: "", heardAboutJob: "" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 0 });
  await expect(page.locator('input[name="degree"]:checked')).toHaveCount(0);
  await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator("#blank-source")).toHaveValue("");
});

test("uses the shared semantic ranker for degree and pronoun radio groups", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Highest level of education *</legend>
        <label><input id="degree-ba" type="radio" name="degree-level" value="opaque-ba" required> Bachelor of Arts</label>
        <label><input id="degree-bs" type="radio" name="degree-level" value="opaque-bs"> Bachelor of Science</label>
        <label><input id="degree-ms" type="radio" name="degree-level" value="opaque-ms"> Master of Science</label>
      </fieldset>
      <fieldset>
        <legend>What are your pronouns? *</legend>
        <label><input id="pronoun-she" type="radio" name="pronouns" value="opaque-she" required> She / Her / Hers</label>
        <label><input id="pronoun-they" type="radio" name="pronouns" value="opaque-they"> I use they / them / theirs pronouns</label>
      </fieldset>
      <fieldset>
        <legend>Highest level of education (optional)</legend>
        <label><input id="optional-degree" type="radio" name="optional-degree" value="opaque-bs"> Bachelor of Science</label>
      </fieldset>
    `,
    profile: {
      degree: "Bachelor of Science",
      pronouns: "They/them",
    },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#degree-bs")).toBeChecked();
  await expect(page.locator("#degree-ba")).not.toBeChecked();
  await expect(page.locator("#degree-ms")).not.toBeChecked();
  await expect(page.locator("#pronoun-they")).toBeChecked();
  await expect(page.locator("#pronoun-she")).not.toBeChecked();
  await expect(page.locator("#optional-degree")).not.toBeChecked();
});

test("answers only explicit office and relocation capability questions", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Are you willing to relocate? (Relocation assistance is not available) *</legend>
        <label><input id="relocate-yes" type="radio" name="relocate" value="yes" required> Yes</label>
        <label><input id="relocate-no" type="radio" name="relocate" value="no"> No</label>
      </fieldset>
      <label>Are you able to work from our office? Note we are unable to accommodate fully remote work.
        <select id="onsite" required>
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <fieldset>
        <legend>Are you willing to work a hybrid schedule? *</legend>
        <label><input id="hybrid-yes" type="radio" name="hybrid" value="yes" required> Yes</label>
        <label><input id="hybrid-no" type="radio" name="hybrid" value="no"> No</label>
      </fieldset>
      <fieldset>
        <legend>Are you not willing to relocate? *</legend>
        <label><input id="negative-relocate-yes" type="radio" name="negative-relocate" value="yes" required> Yes</label>
        <label><input id="negative-relocate-no" type="radio" name="negative-relocate" value="no"> No</label>
      </fieldset>
      <label>Where are you willing to relocate?
        <select id="relocation-place" required><option value="">Select</option><option>Boston</option></select>
      </label>
      <fieldset>
        <legend>Are you available weekends? *</legend>
        <label><input type="radio" name="weekends" value="yes" required> Yes</label>
        <label><input type="radio" name="weekends" value="no"> No</label>
      </fieldset>
      <label><input id="hybrid-certification" type="checkbox" required> I certify that I reviewed the hybrid work policy. *</label>
    `,
    profile: { willingToRelocate: "yes" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 4 });
  await expect(page.locator("#relocate-yes")).toBeChecked();
  await expect(page.locator("#onsite")).toHaveValue("yes");
  await expect(page.locator("#hybrid-yes")).toBeChecked();
  await expect(page.locator("#negative-relocate-no")).toBeChecked();
  await expect(page.locator("#relocation-place")).toHaveValue("");
  await expect(page.locator('input[name="weekends"]:checked')).toHaveCount(0);
  await expect(page.locator("#hybrid-certification")).not.toBeChecked();
});

test("honors an explicit saved No for affirmative relocation questions", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset>
        <legend>Are you willing to relocate? *</legend>
        <label><input id="saved-no-relocate-yes" type="radio" name="saved-no-relocate" value="yes" required> Yes</label>
        <label><input id="saved-no-relocate-no" type="radio" name="saved-no-relocate" value="no"> No</label>
      </fieldset>
      <fieldset>
        <legend>Are you not willing to relocate? *</legend>
        <label><input id="saved-no-negative-yes" type="radio" name="saved-no-negative" value="yes" required> Yes</label>
        <label><input id="saved-no-negative-no" type="radio" name="saved-no-negative" value="no"> No</label>
      </fieldset>
    `,
    profile: { willingToRelocate: "no" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 2 });
  await expect(page.locator("#saved-no-relocate-no")).toBeChecked();
  await expect(page.locator("#saved-no-negative-yes")).toBeChecked();
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
      <label>Exact graduation date <input id="exact-graduation-date" type="date"></label>
      <label>Graduation date <input id="text-graduation-date" placeholder="MM/DD/YYYY"></label>
      <label>Graduation month and year <input id="human-graduation-date"></label>
      <label>Graduation month
        <select id="graduation-month"><option value="">Select</option><option value="May">May</option></select>
      </label>
      <label>Graduation year
        <select id="graduation-year"><option value="">Select</option><option value="2026">2026</option></select>
      </label>
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
      graduationDateExact: "2026-05-31",
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

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 24 });
  await expect(page.locator("#school")).toHaveValue("University of Ottawa");
  await expect(page.locator("#degree")).toHaveValue("BS");
  await expect(page.locator("#discipline")).toHaveValue("Computer Science");
  await expect(page.locator("#graduation-date")).toHaveValue("2026-05");
  await expect(page.locator("#exact-graduation-date")).toHaveValue("2026-05-31");
  await expect(page.locator("#text-graduation-date")).toHaveValue("05/31/2026");
  await expect(page.locator("#human-graduation-date")).toHaveValue("May 2026");
  await expect(page.locator("#graduation-month")).toHaveValue("May");
  await expect(page.locator("#graduation-year")).toHaveValue("2026");
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

test("never invents a graduation day for month-only profiles", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label>Graduation date <input id="month-only-graduation" type="month" required></label>
      <label>Exact graduation date <input id="missing-exact-graduation" type="date" required></label>
      <label>Graduation date <input id="missing-text-graduation" placeholder="MM/DD/YYYY" required></label>
    `,
    profile: { graduationDate: "2026-05" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#month-only-graduation")).toHaveValue("2026-05");
  await expect(page.locator("#missing-exact-graduation")).toHaveValue("");
  await expect(page.locator("#missing-text-graduation")).toHaveValue("");
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

test("selects an explicitly saved remote office preference", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <fieldset aria-required="true">
        <legend>Select every office where you are able to work</legend>
        <label><input id="remote-office" type="checkbox" name="offices" value="remote"> Remote / Work from home</label>
        <label><input id="new-york-office" type="checkbox" name="offices" value="new-york"> New York, New York, United States</label>
      </fieldset>
    `,
    profile: { preferredOfficeLocations: "Remote" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#remote-office")).toBeChecked();
  await expect(page.locator("#new-york-office")).not.toBeChecked();
});

test("does not substitute a remote office for a saved concrete city", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <fieldset aria-required="true">
        <legend>Select every office where you are able to work</legend>
        <label><input id="remote-office" type="checkbox" name="offices" value="remote"> Remote / Work from home</label>
        <label><input id="new-york-office" type="checkbox" name="offices" value="new-york"> New York, New York, United States</label>
      </fieldset>
    `,
    profile: { preferredOfficeLocations: "New York, NY" },
    requiredByDefault: false,
  });

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#new-york-office")).toBeChecked();
  await expect(page.locator("#remote-office")).not.toBeChecked();
});

test("autofill sweeps fields present when it is invoked", async ({ page }) => {
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
  await page.waitForTimeout(400);
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await expect(page.locator("#hydrated-email")).toHaveValue(
    "applicant@example.com",
  );
});

test("explicit scans include current shadow roots and frames", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<main id="application"></main>`,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await page.evaluate(() => {
    const wrapper = document.createElement("section");
    wrapper.id = "shadow-wrapper";
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<label>Primary email <input autocomplete="email" required></label>';
    wrapper.append(host);
    document.querySelector("#application")?.append(wrapper);
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#shadow-wrapper").evaluate((wrapper: HTMLElement) => {
    wrapper.style.display = "none";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );
  await page.locator("#shadow-wrapper").evaluate((wrapper: HTMLElement) => {
    wrapper.style.display = "";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.evaluate(() => {
    const wrapper = document.createElement("section");
    const frame = document.createElement("iframe");
    frame.srcdoc =
      '<label>Backup email <input autocomplete="email" required></label>';
    wrapper.append(frame);
    document.querySelector("#application")?.append(wrapper);
  });
  await page.locator("iframe").last().waitFor();
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("2");
});

test("an explicit scan finds a newly attached shadow root", async ({ page }) => {
  await installContentPanel(page, {
    html: `<main id="application"><div id="late-host"></div></main>`,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );
  await page.locator("#late-host").evaluate((host) => {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<label>Email address <input autocomplete="email" required></label>';
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");
});

test("runs only explicit scans without monitoring DOM churn", async ({
  page,
}) => {
  const noise = Array.from(
    { length: 1_500 },
    (_, index) => `<span data-noise="${index}"></span>`,
  ).join("");
  await installContentPanel(page, {
    html: `
      <main id="application" data-automation-id="applicationPage">
        <label>Email address <input id="email" autocomplete="email" required></label>
      </main>
      <aside id="noise">${noise}</aside>
    `,
    profile: { email: "applicant@example.com" },
    requiredByDefault: false,
    revealPanel: true,
    url: "https://example.wd1.myworkdayjobs.com/en-US/job/test",
  });

  await page.evaluate(() => {
    const metrics = { rootWalks: 0 };
    const querySelectorAll = document.querySelectorAll.bind(document);
    Object.defineProperty(document, "querySelectorAll", {
      configurable: true,
      value(selector: string) {
        if (selector === "*") {
          metrics.rootWalks += 1;
        }
        return querySelectorAll(selector);
      },
    });
    Object.defineProperty(globalThis, "__autofillScanMetrics", {
      configurable: true,
      value: metrics,
    });
  });

  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(1);

  await page.evaluate(async () => {
    const metrics = (
      globalThis as unknown as {
        __autofillScanMetrics: { rootWalks: number };
      }
    ).__autofillScanMetrics;
    metrics.rootWalks = 0;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 200; index += 1) {
      const element = document.createElement("span");
      element.className = `unrelated-pulse-${index}`;
      element.style.opacity = String((index % 10) / 10);
      fragment.append(element);
    }
    document.querySelector("#noise")?.append(fragment);
    const application = document.querySelector("#application") as HTMLElement;
    for (let index = 0; index < 3; index += 1) {
      application.className = `workday-animation-${index}`;
      application.style.transform = `translateX(${index}px)`;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.required = true;
    document.querySelector("#application")?.append(input);
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(1);

  await page.evaluate(() => {
    const metrics = (
      globalThis as unknown as {
        __autofillScanMetrics: { rootWalks: number };
      }
    ).__autofillScanMetrics;
    metrics.rootWalks = 0;
    const field = document.querySelector("#email")?.closest("label");
    if (field instanceof HTMLElement) {
      field.style.display = "none";
    }
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(1);
});

test("explicit scans reflect current control and question state", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <section id="step">
        <div id="question" class="application-question">
          <label id="email-label" for="email">Email address</label>
          <input id="email" aria-labelledby="email-label" required>
        </div>
      </section>
    `,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#email").evaluate((input: HTMLInputElement) => {
    input.required = false;
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );

  await page.locator("#step").evaluate((step) => {
    step.setAttribute("data-required", "true");
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#step").evaluate((step) => {
    step.removeAttribute("data-required");
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );

  await page.locator("#email").evaluate((input: HTMLInputElement) => {
    input.required = true;
    input.disabled = true;
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );

  await page.locator("#email").evaluate((input: HTMLInputElement) => {
    input.disabled = false;
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#step").evaluate((step: HTMLElement) => {
    step.style.display = "none";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-progress-label]")).toHaveText(
    "0 of 0 answered",
  );

  await page.locator("#step").evaluate((step: HTMLElement) => {
    step.style.display = "";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#email-label").evaluate((label) => {
    label.firstChild!.textContent = "Security clearance code *";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("0");
  await expect(panel.locator("[data-attention-count]")).toHaveText("1");
});

test("an explicit scan reflects standalone label text changes", async ({ page }) => {
  await installContentPanel(page, {
    html: `
      <label id="email-label" for="email">Email address</label>
      <input id="email" aria-labelledby="email-label" required>
    `,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");

  await page.locator("#email-label").evaluate((label) => {
    label.firstChild!.textContent = "Security clearance code *";
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("0");
  await expect(panel.locator("[data-attention-count]")).toHaveText("1");
});

test("an explicit scan finds standalone labels added to existing controls", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `<input id="candidate-response" required>`,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  const panel = page.locator("#job-autofill-extension-panel");
  await expect(panel.locator("[data-attention-count]")).toHaveText("1");
  await page.evaluate(() => {
    const label = document.createElement("label");
    label.htmlFor = "candidate-response";
    label.textContent = "Email address";
    document.body.prepend(label);
  });
  await invokePanel(page, { type: "JOB_AUTOFILL_SCAN" });
  await expect(panel.locator("[data-ready-count]")).toHaveText("1");
  await expect(panel.locator("[data-attention-count]")).toHaveText("0");
});

test("autofill and teardown do not leave form monitors running", async ({
  page,
}) => {
  await installContentPanel(page, {
    html: `
      <main id="application">
        <label>Email address <input id="email" autocomplete="email" required></label>
      </main>
      <iframe id="embedded" srcdoc="<p>Embedded application</p>"></iframe>
    `,
    profile: { email: "applicant@example.com" },
    profileAvailability: { email: true },
    requiredByDefault: false,
    revealPanel: true,
  });

  await page.evaluate(() => {
    const metrics = { rootWalks: 0 };
    const querySelectorAll = document.querySelectorAll.bind(document);
    Object.defineProperty(document, "querySelectorAll", {
      configurable: true,
      value(selector: string) {
        if (selector === "*") {
          metrics.rootWalks += 1;
        }
        return querySelectorAll(selector);
      },
    });
    Object.defineProperty(globalThis, "__autofillScanMetrics", {
      configurable: true,
      value: metrics,
    });
  });

  await page.evaluate(() => {
    const email = document.querySelector("#email") as HTMLInputElement;
    email.required = false;
    const host = document.querySelector(
      "#job-autofill-extension-panel",
    ) as HTMLElement;
    (host.shadowRoot?.querySelector("[data-close]") as HTMLButtonElement).click();
    (
      globalThis as unknown as {
        __autofillScanMetrics: { rootWalks: number };
      }
    ).__autofillScanMetrics.rootWalks = 0;
  });
  await expect(page.locator("#job-autofill-extension-panel")).toHaveCount(0);

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.required = true;
    document.querySelector("#application")?.append(input);
    const frame = document.querySelector("#embedded") as HTMLIFrameElement;
    frame.srcdoc = "<input required>";
  });
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);

  const sessionUrl = page.url();
  await invokePanel(page, {
    type: "JOB_AUTOFILL_START_SESSION",
    session: {
      id: "content-e2e-session",
      url: sessionUrl,
      applicationOrigins: [new URL(sessionUrl).origin],
      jobTitle: "Content script fixture",
      country: "",
      company: "",
    },
    profile: {},
    profileAvailability: { email: true },
    frameMode: false,
  });
  await expect(page.locator("#job-autofill-extension-panel")).toHaveCount(1);

  await page.evaluate(() => {
    const email = document.querySelector("#email") as HTMLInputElement;
    email.required = true;
  });
  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 1 });
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        __autofillScanMetrics: { rootWalks: number };
      }
    ).__autofillScanMetrics.rootWalks = 0;
    const label = document.createElement("label");
    label.textContent = "Secondary email";
    const input = document.createElement("input");
    input.id = "late-email";
    input.autocomplete = "email";
    input.required = true;
    label.append(input);
    document.querySelector("#application")?.append(label);
  });
  await page.waitForTimeout(5_200);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);
  await expect(page.locator("#late-email")).toHaveValue("");

  await invokePanel(page, { type: "JOB_AUTOFILL_EXTENSION_DISABLED" });
  await expect(page.locator("#job-autofill-extension-panel")).toHaveCount(0);
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        __autofillScanMetrics: { rootWalks: number };
      }
    ).__autofillScanMetrics.rootWalks = 0;
    const email = document.querySelector("#email") as HTMLInputElement;
    email.disabled = true;
    const frame = document.querySelector("#embedded") as HTMLIFrameElement;
    frame.srcdoc = "<textarea required></textarea>";
  });
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __autofillScanMetrics: { rootWalks: number };
          }
        ).__autofillScanMetrics.rootWalks,
    ),
  ).toBe(0);
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
    .getByRole("button", { name: "Autofill application fields" })
    .click();
  await expect(page.locator("#applicant-email")).toHaveValue(
    "applicant@example.com",
  );
  await expect(
    panelHost.getByText("Filled 1 field. Review every answer."),
  ).toBeVisible();
});
