// Minimal structural typings so the live fillers compile without Playwright's
// types installed. The real objects come from the optional `playwright` package.
export interface PwPage {
  goto(url: string, opts?: unknown): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  setInputFiles(selector: string, files: string): Promise<void>;
  click(selector: string, opts?: unknown): Promise<void>;
  waitForSelector(selector: string, opts?: unknown): Promise<unknown>;
}
export interface PwBrowser {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}

interface PwModule {
  chromium: { launch(opts?: { headless?: boolean }): Promise<PwBrowser> };
}

// Lazily import Playwright (an optional peer dependency only needed for live mode).
// The dynamic specifier keeps it out of the default bundle + typecheck.
export async function launchChromium(): Promise<PwBrowser> {
  const spec = process.env.PLAYWRIGHT_MODULE || "playwright";
  let pw: PwModule;
  try {
    pw = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as PwModule;
  } catch {
    throw new Error(
      "Live apply requires Playwright. Install it with: npm i -D playwright && npx playwright install chromium",
    );
  }
  const headless = !process.env.PLAYWRIGHT_HEADFUL;
  return pw.chromium.launch({ headless });
}
