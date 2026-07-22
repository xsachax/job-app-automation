import type { LiveFiller } from "./index";
import { launchChromium } from "./browser";

// Best-effort Playwright filler for Greenhouse hosted application forms.
// SAFETY: it fills the form but does NOT click submit unless GH_AUTO_SUBMIT=1,
// giving a second guard on top of the human approval gate.
export const fillGreenhouse: LiveFiller = async (job, fields) => {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.goto(job.applyUrl, { waitUntil: "domcontentloaded" });

    await page.fill("#first_name", fields.firstName).catch(() => {});
    await page.fill("#last_name", fields.lastName).catch(() => {});
    await page.fill("#email", fields.email).catch(() => {});
    if (fields.phone) await page.fill("#phone", fields.phone).catch(() => {});
    if (fields.resume) {
      await page.setInputFiles("input[type=file]", fields.resume).catch(() => {});
    }

    const autoSubmit = process.env.GH_AUTO_SUBMIT === "1";
    if (autoSubmit) {
      await page.click("#submit_app, input[type=submit], button[type=submit]");
    }

    return {
      mode: "live",
      ok: true,
      message: autoSubmit
        ? "Submitted via Greenhouse."
        : "Greenhouse form filled; submit withheld (set GH_AUTO_SUBMIT=1 to actually send).",
      submittedTo: job.applyUrl,
      at: new Date().toISOString(),
    };
  } finally {
    await browser.close().catch(() => {});
  }
};
