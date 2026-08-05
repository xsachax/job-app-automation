import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { isGoogleChromeBrowser } from "@/lib/chromeExtension";
import { errorResponse, isSameOriginRequest, json } from "@/lib/http";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const CHROME_EXTENSIONS_URL = "chrome://extensions/";

function launchCommand(): { command: string; args: string[] } {
  switch (process.platform) {
    case "darwin":
      return {
        command: "open",
        args: ["-a", "Google Chrome", CHROME_EXTENSIONS_URL],
      };
    case "win32":
      return {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          "start",
          "",
          "chrome.exe",
          "--new-window",
          CHROME_EXTENSIONS_URL,
        ],
      };
    case "linux":
      return {
        command: "google-chrome",
        args: ["--new-window", CHROME_EXTENSIONS_URL],
      };
    default:
      throw new Error(`Opening Chrome is not supported on ${process.platform}.`);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("same-origin request required", 403);
  }
  if (
    !isGoogleChromeBrowser({
      userAgent: request.headers.get("user-agent") ?? "",
    })
  ) {
    return errorResponse("Google Chrome is required", 400);
  }

  try {
    const { command, args } = launchCommand();
    await execFileAsync(command, args, { timeout: 5_000 });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
