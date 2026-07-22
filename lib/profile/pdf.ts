import { createRequire } from "node:module";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

type PdfParse = (data: Buffer) => Promise<{ text?: string }>;

function loadPdfParse(): PdfParse | null {
  try {
    const require = createRequire(import.meta.url);
    const mod = require("pdf-parse") as PdfParse | { default?: PdfParse };
    return typeof mod === "function" ? mod : typeof mod.default === "function" ? mod.default : null;
  } catch {
    return null;
  }
}

export async function fetchResumeText(url: string): Promise<string> {
  try {
    const src = url.trim();
    if (!/^https?:\/\//i.test(src)) return "";

    const res = await fetch(src);
    if (!res.ok) return "";

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const isPdf = contentType.includes("pdf") || new URL(src).pathname.toLowerCase().endsWith(".pdf");
    const buffer = Buffer.from(await res.arrayBuffer());

    if (isPdf) {
      const parse = loadPdfParse();
      if (!parse) return "";
      const parsed = await parse(buffer);
      return normalizeText(parsed.text ?? "");
    }

    const text = buffer.toString("utf8");
    return normalizeText(contentType.includes("html") ? stripHtml(text) : text);
  } catch {
    return "";
  }
}
