import type { LiveFiller } from "./index";
import { launchChromium } from "./browser";

// Best-effort Playwright filler for Lever hosted application forms.
// SAFETY: fills the form but does NOT submit unless LEVER_AUTO_SUBMIT=1.
export const fillLever: LiveFiller = async (job, fields) => {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const url = job.applyUrl.endsWith("/apply") ? job.applyUrl : `${job.applyUrl}/apply`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const fullName = [fields.firstName, fields.lastName].filter(Boolean).join(" ");
    await page.fill("input[name=name]", fullName).catch(() => {});
    await page.fill("input[name=email]", fields.email).catch(() => {});
    if (fields.phone) await page.fill("input[name=phone]", fields.phone).catch(() => {});
    if (fields.linkedin) {
      await page.fill('input[name="urls[LinkedIn]"]', fields.linkedin).catch(() => {});
    }
    if (fields.resume) {
      await page.setInputFiles("input[name=resume]", fields.resume).catch(() => {});
    }

    const autoSubmit = process.env.LEVER_AUTO_SUBMIT === "1";
    if (autoSubmit) {
      await page.click("button[type=submit], #btn-submit");
    }

    return {
      mode: "live",
      ok: true,
      message: autoSubmit
        ? "Submitted via Lever."
        : "Lever form filled; submit withheld (set LEVER_AUTO_SUBMIT=1 to actually send).",
      submittedTo: url,
      at: new Date().toISOString(),
    };
  } finally {
    await browser.close().catch(() => {});
  }
};
