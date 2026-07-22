// Tier-2 resume/skills fit scoring.
//
// This is the DETERMINISTIC baseline matcher: it compares a job against the
// user's resume (skills, roles held, summary, full text) and returns a 0..100
// fit score with human-readable reasons. It is dependency-free and needs no API
// key, so it runs everywhere (cron included).
//
// A richer, judgement-based score is produced separately by the Copilot agent
// (see lib/matching/agent.ts) and overrides this baseline when available.

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
    const norm = normalizePhrase(skill);
    if (!norm) continue;
    const hit = norm.includes(" ")
      ? postingText.includes(norm) // multi-word: substring match
      : postingTokens.has(norm); // single word: exact token match
    if (hit) matchedSkills.push(skill);
  }
  let skillScore = 0;
  if (skills.length > 0 && matchedSkills.length > 0) {
    const coverage = matchedSkills.length / skills.length; // 0..1
    // Reward both breadth (coverage) and a floor for absolute hits.
    skillScore = Math.min(55, coverage * 45 + Math.min(matchedSkills.length, 5) * 4);
    reasons.push(
      `resume skills present: ${matchedSkills.slice(0, 8).join(", ")}` +
        (matchedSkills.length > 8 ? `, +${matchedSkills.length - 8} more` : ""),
    );
  } else if (skills.length === 0) {
    reasons.push("no resume skills on file — fit is title-based only");
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
    reasons.push(`title aligns with prior role "${bestRole}"`);
  }

  // --- Summary / broad keyword resonance ---
  const summaryTerms = new Set(
    [...tokenize(resume.summary), ...tokenize(resume.text)]
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
  let resonance = 0;
  const echoed: string[] = [];
  for (const t of postingTokens) {
    if (t.length >= 4 && !STOPWORDS.has(t) && summaryTerms.has(t)) {
      echoed.push(t);
    }
  }
  if (echoed.length > 0) {
    resonance = Math.min(20, echoed.length * 2.5);
    reasons.push(`resume echoes posting terms: ${echoed.slice(0, 6).join(", ")}`);
  }

  // --- Missing signals: prominent posting keywords the resume never mentions ---
  const missingSignals: string[] = [];
  if (skills.length > 0) {
    const resumeTerms = new Set([
      ...skills.map((s) => normalizePhrase(s)),
      ...summaryTerms,
    ]);
    const freq = new Map<string, number>();
    for (const t of tokenize(job.description)) {
      if (t.length >= 4 && !STOPWORDS.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    const prominent = [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .filter((t) => !resumeTerms.has(t) && !postingTitleHas(job.title, t));
    for (const t of prominent) {
      if (missingSignals.length >= 6) break;
      missingSignals.push(t);
    }
  }

  const score = clamp(skillScore + titleScore + resonance);
  if (reasons.length === 0) reasons.push("weak resume overlap");
  return { score, reasons, matchedSkills, missingSignals };
}

function postingTitleHas(title: string, term: string): boolean {
  return new Set(tokenize(title)).has(term);
}
