import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { OPTIONS, POST } from "../app/api/autofill/assist/route";
import {
  CHROME_AUTOFILL_EXTENSION_ID,
  CHROME_AUTOFILL_EXTENSION_ORIGIN,
} from "../lib/chrome-extension-constants";

function postRequest(
  body: BodyInit,
  {
    origin = CHROME_AUTOFILL_EXTENSION_ORIGIN,
    extensionId = CHROME_AUTOFILL_EXTENSION_ID,
    hostname = "127.0.0.1",
  } = {},
): NextRequest {
  return new NextRequest(`http://${hostname}:3000/api/autofill/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "x-job-autofill-extension": extensionId,
    },
    body,
  });
}

describe("assisted autofill route", () => {
  it("allows preflight only from the stable extension on loopback", () => {
    const trusted = OPTIONS(
      new NextRequest("http://localhost:3000/api/autofill/assist", {
        method: "OPTIONS",
        headers: { origin: CHROME_AUTOFILL_EXTENSION_ORIGIN },
      }),
    );
    expect(trusted.status).toBe(204);
    expect(trusted.headers.get("access-control-allow-origin")).toBe(
      CHROME_AUTOFILL_EXTENSION_ORIGIN,
    );

    const untrusted = OPTIONS(
      new NextRequest("http://localhost:3000/api/autofill/assist", {
        method: "OPTIONS",
        headers: { origin: "https://attacker.example" },
      }),
    );
    expect(untrusted.status).toBe(403);
    expect(untrusted.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects missing extension identity and non-loopback hosts", async () => {
    const missingIdentity = await POST(
      postRequest("{}", { extensionId: "wrong-extension" }),
    );
    expect(missingIdentity.status).toBe(403);

    const remoteHost = await POST(
      postRequest("{}", { hostname: "dashboard.example" }),
    );
    expect(remoteHost.status).toBe(403);
  });

  it("returns bounded client errors for invalid trusted requests", async () => {
    const malformed = await POST(postRequest("{not-json"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: "invalid JSON body",
    });

    const invalidShape = await POST(postRequest("{}"));
    expect(invalidShape.status).toBe(400);
    expect(invalidShape.headers.get("access-control-allow-origin")).toBe(
      CHROME_AUTOFILL_EXTENSION_ORIGIN,
    );
    await expect(invalidShape.json()).resolves.toEqual({
      error:
        "Assisted autofill requires 1-25 bounded unresolved fields and a valid application URL.",
    });
  });
});
