import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isSameOriginRequest } from "../lib/http";

describe("isSameOriginRequest", () => {
  it("uses the public Host header when Next.js normalizes nextUrl", () => {
    const request = new NextRequest("http://localhost:3210/api/judge/score", {
      headers: {
        host: "127.0.0.1:3210",
        origin: "http://127.0.0.1:3210",
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects a different origin", () => {
    const request = new NextRequest("http://localhost:3210/api/judge/score", {
      headers: {
        host: "127.0.0.1:3210",
        origin: "https://example.com",
      },
    });

    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("honors the forwarded protocol behind a proxy", () => {
    const request = new NextRequest("http://localhost:3210/api/judge/score", {
      headers: {
        host: "jobs.example.com",
        origin: "https://jobs.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects requests without an Origin header", () => {
    const request = new NextRequest("http://localhost:3210/api/judge/score", {
      headers: { host: "127.0.0.1:3210" },
    });

    expect(isSameOriginRequest(request)).toBe(false);
  });
});
