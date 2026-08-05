import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/db";
import { fetchResumePdf } from "../lib/profile/pdf";
import { refreshProfile } from "../lib/profile/refresh";
import { getProfile, saveProfile } from "../lib/settings";
import { resetDb } from "./helpers";

const PDF_BYTES = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1MSA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDcyIDcyMCBUZCAoUmVzdW1lIGZpeHR1cmUgdGV4dCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTEKJSVFT0YK",
  "base64",
);
const SOURCE =
  "https://github.com/example/resume/blob/main/resume.pdf";

function mockPdfDownload() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(PDF_BYTES, {
        headers: {
          "Content-Length": String(PDF_BYTES.length),
          "Content-Type": "application/pdf",
        },
      });
    }),
  );
}

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());

describe("resume PDF ingest", () => {
  it("validates and extracts text from a GitHub PDF", async () => {
    mockPdfDownload();
    const resume = await fetchResumePdf(SOURCE);

    expect(resume.fileName).toBe("resume.pdf");
    expect(resume.text).toContain("Resume fixture text");
    expect(resume.bytes.equals(PDF_BYTES)).toBe(true);
  });

  it("rejects redirects outside the supported download hosts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/private.pdf" },
        });
      }),
    );

    await expect(fetchResumePdf(SOURCE)).rejects.toThrow("unsupported host");
  });

  it("stores the exact PDF bytes and hash locally", async () => {
    mockPdfDownload();
    await refreshProfile(SOURCE);

    const asset = await prisma.resumeAsset.findUniqueOrThrow({
      where: { id: "me" },
    });
    expect(Buffer.from(asset.data).equals(PDF_BYTES)).toBe(true);
    expect(asset.sha256).toBe(
      createHash("sha256").update(PDF_BYTES).digest("hex"),
    );
    expect(asset.mimeType).toBe("application/pdf");
  });

  it("merges parsed résumé skills with manually saved skills", async () => {
    await saveProfile({ skills: ["Go"] });

    const result = await refreshProfile("sample-data/resume.sample.txt");

    expect(result.profile.skills).toEqual(
      expect.arrayContaining(["Go", "TypeScript", "Next.js", "PostgreSQL"]),
    );
  });

  it("migrates legacy Canadian location and eligibility answers", async () => {
    await saveProfile({
      country: "Canada",
      location: "Toronto, ON",
      workAuthorized: true,
      requiresSponsorship: false,
    });

    await expect(getProfile()).resolves.toMatchObject({
      caLocation: "Toronto, ON",
      caWorkAuthorized: true,
      caRequiresSponsorship: false,
    });
  });

  it("invalidates saved PDF bytes when the resume link changes", async () => {
    mockPdfDownload();
    await refreshProfile(SOURCE);
    await saveProfile({
      resumeUrl:
        "https://github.com/example/resume/blob/main/new-resume.pdf",
    });

    await expect(
      prisma.resumeAsset.findUnique({ where: { id: "me" } }),
    ).resolves.toBeNull();
  });
});
