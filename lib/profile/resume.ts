import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ExtractedResume {
  source: string;
  text: string;
}

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
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const SUPPORTED = [".txt", ".md", ".markdown", ".json", ".html", ".htm"];

// Read a resume from a URL or local path and return plain text.
// PDF/DOCX are intentionally unsupported here (convert to txt/md first, or wire
// up a dedicated extractor). Keeps the core dependency-light and reliable.
export async function extractResumeText(source: string): Promise<ExtractedResume> {
  const src = source.trim();
  if (!src) throw new Error("no resume source configured");

  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`resume: HTTP ${res.status} for ${src}`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const body = await res.text();
    const text = ct.includes("html") ? stripHtml(body) : body;
    return { source: src, text };
  }

  const ext = path.extname(src).toLowerCase();
  if (ext && !SUPPORTED.includes(ext)) {
    throw new Error(
      `resume: unsupported file type "${ext}". Supported: ${SUPPORTED.join(", ")}. ` +
        `Convert PDF/DOCX to .txt or .md first.`,
    );
  }
  const buf = await readFile(src, "utf8");
  const text = ext === ".html" || ext === ".htm" ? stripHtml(buf) : buf;
  return { source: src, text };
}
