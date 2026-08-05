import type { ParsedResume } from "./types";

// Deterministic, dependency-free resume parser. Handles plain-text / markdown
// resumes. Good enough to auto-fill most application fields with no API key.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

function firstNonEmptyLines(text: string, n: number): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, n);
}

function looksLikeName(line: string): boolean {
  if (EMAIL_RE.test(line) || /\d/.test(line) || line.includes("@")) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
}

function extractSection(text: string, headers: string[]): string | null {
  const lines = text.split(/\r?\n/);
  const headerRe = new RegExp(`^\\s*(${headers.join("|")})\\s*:?\\s*$`, "i");
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j].trim();
        // Stop at the next ALL-CAPS/Title header-ish line.
        if (l === "" && body.length > 0) break;
        if (/^[A-Z][A-Za-z ]{2,30}:?$/.test(l) && l === l.toUpperCase() && body.length > 0) break;
        if (l) body.push(l);
      }
      if (body.length) return body.join("\n");
    }
  }
  return null;
}

export function parseWithFallback(text: string): ParsedResume {
  const out: ParsedResume = {};
  const head = firstNonEmptyLines(text, 8);

  const nameLine = head.find(looksLikeName);
  if (nameLine) {
    const parts = nameLine.split(/\s+/);
    out.firstName = parts[0];
    out.lastName = parts.slice(1).join(" ");
  }

  const email = text.match(EMAIL_RE);
  if (email) out.email = email[0];

  const phone = text.match(PHONE_RE);
  if (phone) out.phone = phone[0].trim();

  const urls = text.match(URL_RE) ?? [];
  for (const u of urls) {
    const low = u.toLowerCase();
    if (!out.linkedin && low.includes("linkedin.com")) out.linkedin = u;
    else if (!out.github && low.includes("github.com")) out.github = u;
    else if (!out.website && !low.includes("linkedin.com") && !low.includes("github.com")) out.website = u;
  }

  const skillsBlock = extractSection(text, ["skills", "technical skills", "technologies"]);
  if (skillsBlock) {
    const skills = skillsBlock
      .split(/\r?\n/)
      .flatMap((line) =>
        line
          .replace(/^[^:,]{1,40}:\s*/, "")
          .split(/[,•|\u2022]+/),
      )
      .map((s) => s.replace(/^[-*]\s*/, "").trim())
      .filter((s) => s.length > 0 && s.length < 40);
    if (skills.length) out.skills = Array.from(new Set(skills)).slice(0, 40);
  }

  const summaryBlock = extractSection(text, ["summary", "objective", "profile", "about"]);
  if (summaryBlock) out.summary = summaryBlock.replace(/\n/g, " ").slice(0, 600);

  return out;
}
