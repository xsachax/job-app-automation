// Tier-2 resume/skills fit scoring.
//
// This is the DETERMINISTIC baseline matcher: it compares a job against the
// user's resume (skills, roles held, summary, full text) and returns a 0..100
// fit score with human-readable reasons. It is dependency-free and needs no API
// key, so it runs everywhere (cron included).
//
// A richer, judgement-based score is produced separately by the Copilot agent
// (see lib/matching/agent.ts) and overrides this baseline when available.

import { SKILL_VOCAB, skillVariants } from "../discovery/enrich";

export interface ResumeContext {
  skills?: string[]; // parsed skills from the resume
  titles?: string[]; // roles/titles the candidate has held
  summary?: string; // resume summary / objective
  text?: string; // full resume plain text (used for broad keyword coverage)
}

export interface ResumeJobInput {
  title: string;
  description?: string | null;
  company?: string | null;
  skills?: string[];
}

export interface ResumeScoreResult {
  score: number; // 0..100
  reasons: string[];
  matchedSkills: string[]; // resume skills found in the posting
  missingSignals: string[]; // notable posting keywords absent from the resume
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "your", "have", "this",
  "that", "who", "all", "can", "job", "role", "team", "work", "working", "we", "a",
  "an", "to", "of", "in", "on", "as", "at", "be", "or", "is", "it", "by", "from",
  "experience", "years", "year", "including", "ability", "strong", "using", "us",
  "new", "help", "build", "building", "across", "into", "within", "per", "etc",
  "such", "more", "most", "other", "well", "like", "make", "made", "get", "join",
  "looking", "seeking", "responsibilities", "requirements", "qualifications",
]);

const RESONANCE_STOPWORDS = new Set([
  ...STOPWORDS,
  "computer",
  "company",
  "data",
  "developer",
  "development",
  "engineer",
  "engineering",
  "focused",
  "full",
  "level",
  "market",
  "product",
  "science",
  "software",
  "stack",
  "systems",
  "technical",
  "technology",
]);

const SIGNAL_NOISE = new Set([
  "amp",
  "button",
  "class",
  "div",
  "href",
  "html",
  "http",
  "https",
  "local",
  "nbsp",
  "quot",
  "render",
  "renderer",
  "section",
  "span",
  "start",
  "style",
]);

const TRUSTED_SKILL_SIGNALS = new Set(
  SKILL_VOCAB.map((skill) => normalizePhrase(skill)),
);

function tokenize(s: string | null | undefined): string[] {
  return (
    (s || "").toLowerCase().match(/[a-z0-9+#.]+/g)?.map((t) => t.replace(/\.+$/, "")).filter(Boolean) ??
    []
  );
}

// A skill phrase can be multi-word ("machine learning"); match it as a substring
// against normalized text, and also token-match single words.
function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
}

function phraseAppears(text: string, phrase: string): boolean {
  const tokens = new Set(tokenize(text));
  return skillVariants(phrase).some((variant) => {
    const normalized = normalizePhrase(variant);
    if (!normalized) return false;
    return normalized.includes(" ")
      ? text.includes(normalized)
      : tokens.has(normalized);
  });
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function usefulSignal(value: string): boolean {
  if (!TRUSTED_SKILL_SIGNALS.has(normalizePhrase(value))) return false;
  const tokens = tokenize(value);
  return tokens.some(
    (token) =>
      !RESONANCE_STOPWORDS.has(token) &&
      !SIGNAL_NOISE.has(token) &&
      !/^\d+$/.test(token),
  );
}

function addMissingSignal(signals: string[], value: string): void {
  const normalized = normalizePhrase(value);
  if (!normalized) return;
  const relatedIndex = signals.findIndex((signal) => {
    const existing = normalizePhrase(signal);
    return existing.includes(normalized) || normalized.includes(existing);
  });
  if (relatedIndex < 0) {
    signals.push(value);
    return;
  }
  if (normalized.length > normalizePhrase(signals[relatedIndex]).length) {
    signals[relatedIndex] = value;
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Score how well a job matches the candidate's resume.
 *
 * Weighting (before clamp):
 *  - Skill coverage (up to 55): fraction of resume skills the posting mentions,
 *    plus a floor bonus for any overlap so a few precise hits still register.
 *  - Title/role alignment (up to 25): overlap between the job title and roles the
 *    candidate has held.
 *  - Summary/keyword resonance (up to 20): resume summary/text terms echoed in the
 *    posting — a soft signal that the domain lines up.
 */
export function scoreResumeFit(job: ResumeJobInput, resume: ResumeContext): ResumeScoreResult {
  const reasons: string[] = [];
  const skills = (resume.skills ?? []).map((s) => s.trim()).filter(Boolean);
  const postingText = normalizePhrase(`${job.title} ${job.description ?? ""}`);
  const postingTokens = new Set(tokenize(postingText));

  // --- Skill coverage ---
  const matchedSkills: string[] = [];
  for (const skill of skills) {
    if (phraseAppears(postingText, skill)) matchedSkills.push(skill);
  }
  let skillScore = 0;
  if (skills.length > 0 && matchedSkills.length > 0) {
    const coverage = matchedSkills.length / skills.length; // 0..1
    // Reward both breadth (coverage) and a floor for absolute hits.
    skillScore = Math.min(55, coverage * 45 + Math.min(matchedSkills.length, 5) * 4);
    reasons.push(
      `Matches ${matchedSkills.length} résumé ${
        matchedSkills.length === 1 ? "skill" : "skills"
      }: ${humanList(matchedSkills.slice(0, 5))}` +
        (matchedSkills.length > 5 ? `, plus ${matchedSkills.length - 5} more` : ""),
    );
  } else if (skills.length === 0) {
    reasons.push("No résumé skills are on file, so the score relies on role and experience text");
  }

  // --- Title / role alignment ---
  const titleTokens = new Set(tokenize(job.title));
  let titleScore = 0;
  let bestRole = "";
  for (const role of resume.titles ?? []) {
    const rt = tokenize(role).filter((t) => !STOPWORDS.has(t));
    if (rt.length === 0) continue;
    const hits = rt.filter((t) => titleTokens.has(t)).length;
    const frac = hits / rt.length;
    if (frac > 0 && frac * 25 > titleScore) {
      titleScore = frac * 25;
      bestRole = role;
    }
  }
  if (titleScore > 0) {
    reasons.push(`Role aligns with the target title "${bestRole}"`);
  }

  // --- Summary / broad keyword resonance ---
  const summaryTerms = new Set(
    [...tokenize(resume.summary), ...tokenize(resume.text)]
      .filter(
        (t) =>
          t.length >= 4 &&
          !RESONANCE_STOPWORDS.has(t) &&
          !SIGNAL_NOISE.has(t) &&
          !/^\d+$/.test(t),
      ),
  );
  let resonance = 0;
  const echoed: string[] = [];
  for (const t of postingTokens) {
    if (t.length >= 4 && !RESONANCE_STOPWORDS.has(t) && summaryTerms.has(t)) {
      echoed.push(t);
    }
  }
  if (echoed.length > 0) {
    resonance = Math.min(20, echoed.length * 2.5);
    reasons.push(`Résumé evidence overlaps on ${humanList(echoed.slice(0, 6))}`);
  }

  // --- Missing signals: structured posting skills and prominent repeated terms ---
  const missingSignals: string[] = [];
  if (skills.length > 0) {
    const resumeText = normalizePhrase(
      `${skills.join(" ")} ${resume.summary ?? ""} ${resume.text ?? ""}`,
    );
    const companyText = normalizePhrase(job.company ?? "");
    for (const skill of (job.skills ?? []).filter(usefulSignal)) {
      if (missingSignals.length >= 6) break;
      const normalizedSkill = normalizePhrase(skill);
      if (
        !phraseAppears(resumeText, skill) &&
        (!companyText || !companyText.includes(normalizedSkill))
      ) {
        addMissingSignal(missingSignals, skill);
      }
    }

  }

  const score = clamp(skillScore + titleScore + resonance);
  if (reasons.length === 0) reasons.push("Limited direct résumé overlap");
  return { score, reasons, matchedSkills, missingSignals };
}
