import { PDFParse } from "pdf-parse";
import { normalizeResumePdfUrl } from "./url";

export const MAX_RESUME_PDF_BYTES = 5 * 1024 * 1024;

export interface ResumePdf {
  source: string;
  fileName: string;
  bytes: Buffer;
  text: string;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isAllowedDownloadHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    [
      "github.com",
      "raw.githubusercontent.com",
      "gist.github.com",
      "gist.githubusercontent.com",
      "drive.google.com",
      "drive.usercontent.google.com",
    ].includes(host) || host.endsWith(".googleusercontent.com")
  );
}

async function fetchWithSafeRedirects(source: string): Promise<Response> {
  let current = source;
  const signal = AbortSignal.timeout(15_000);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const url = new URL(current);
    if (url.protocol !== "https:" || !isAllowedDownloadHost(url.hostname)) {
      throw new Error("The resume download redirected to an unsupported host.");
    }

    const response = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "application/pdf" },
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("The resume download returned an invalid redirect.");
    }
    current = new URL(location, url).toString();
  }
  throw new Error("The resume download redirected too many times.");
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) {
    throw new Error("The resume PDF response did not contain a body.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESUME_PDF_BYTES) {
      await reader.cancel();
      throw new Error("The resume PDF must be 5 MB or smaller.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function resumeFileName(source: string): string {
  const rawName = decodeURIComponent(new URL(source).pathname.split("/").pop() || "");
  const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, "-");
  return safeName.toLowerCase().endsWith(".pdf") ? safeName : "resume.pdf";
}

export async function fetchResumePdf(input: string): Promise<ResumePdf> {
  const source = normalizeResumePdfUrl(input);
  const response = await fetchWithSafeRedirects(source);
  if (!response.ok) {
    throw new Error(`The resume PDF download failed with HTTP ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESUME_PDF_BYTES) {
    throw new Error("The resume PDF must be 5 MB or smaller.");
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!["application/pdf", "application/octet-stream"].includes(contentType)) {
    throw new Error("The resume link did not return a PDF file.");
  }

  const bytes = await readBoundedBody(response);
  if (!bytes.length) {
    throw new Error("The resume PDF is empty.");
  }
  if (bytes.length > MAX_RESUME_PDF_BYTES) {
    throw new Error("The resume PDF must be 5 MB or smaller.");
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(
      "The resume link did not return PDF bytes. Make sure the file is shared publicly.",
    );
  }

  const parser = new PDFParse({ data: bytes });
  let parsed: { text?: string };
  try {
    parsed = await parser.getText({ pageJoiner: "\n" });
  } catch (error) {
    throw new Error(
      `The resume PDF could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await parser.destroy();
  }
  const text = normalizeText(parsed.text || "");
  if (!text) {
    throw new Error("The resume PDF does not contain readable text.");
  }

  return {
    source: input.trim(),
    fileName: resumeFileName(source),
    bytes,
    text,
  };
}

export async function fetchResumeText(url: string): Promise<string> {
  return (await fetchResumePdf(url)).text;
}
