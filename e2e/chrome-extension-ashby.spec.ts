import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  installContentPanel,
  invokeAutofill,
} from "./helpers/chrome-extension-harness";

const ashbyApplicationUrl =
  "https://jobs.ashbyhq.com/notion/e3d8dc06-da05-4e9d-a143-2e9c51fa3d51/application";

test("fills a required Ashby-style application fixture without guessing consequential answers", async ({
  page,
}) => {
  const html = await readFile(
    resolve(process.cwd(), "e2e/fixtures/ashby/notion-application.html"),
    "utf8",
  );
  await installContentPanel(page, {
    html,
    url: ashbyApplicationUrl,
    requiredByDefault: false,
    country: "United States",
    profile: {
      firstName: "Sacha",
      lastName: "Applicant",
      email: "applicant@example.com",
      phone: "+1 212 555 0100",
      linkedinUrl: "https://www.linkedin.com/in/applicant",
      location: "New York, NY",
      heardAboutJob: "LinkedIn",
      workAuthorization: "yes",
      requiresSponsorship: "no",
      pronouns: "They / Them",
      gender: "Non-binary",
    },
  });
  await page.locator("#first-name").fill("Applicant-edited");

  expect(await invokeAutofill(page)).toMatchObject({ ok: true, filled: 8 });

  await expect(page.locator("#first-name")).toHaveValue("Applicant-edited");
  await expect(page.locator("#last-name")).toHaveValue("Applicant");
  await expect(page.locator("#email")).toHaveValue("applicant@example.com");
  await expect(page.locator("#linkedin-url")).toHaveValue(
    "https://www.linkedin.com/in/applicant",
  );
  await expect(page.locator("#current-location")).toHaveAttribute(
    "data-value",
    "new-york",
  );
  await expect(page.locator("#source")).toHaveValue("linkedin");
  await expect(
    page.locator('input[name="authorization"][value="yes"]'),
  ).toBeChecked();
  await expect(page.locator("#sponsorship")).toHaveValue("no");
  await expect(page.locator("#gender")).toHaveValue("non-binary");

  await expect(page.locator("#optional-phone")).toHaveValue("");
  await expect(page.locator("#optional-pronouns")).toHaveValue("");
  await expect(page.locator("#referrer-linkedin")).toHaveValue("");
  await expect(page.locator("#export-license")).toHaveValue("");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { submitClicks: number }).submitClicks,
    ),
  ).toBe(0);
});
