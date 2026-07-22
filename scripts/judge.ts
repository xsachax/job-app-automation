import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/db";
import { scoreAllJobs } from "../lib/judge/judge";
import { buildJudgeBatch, applyJudgeScores, type JudgeScoreInput } from "../lib/judge/agent";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function num(name: string): number | undefined {
  const value = flag(name);
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function doScore() {
  const result = await scoreAllJobs({
    onlyUnscored: hasFlag("only-unscored"),
    country: flag("country"),
    limit: num("limit"),
    force: hasFlag("force"),
  });
  console.log(
    `Deterministic judge: ${result.scored} scored, ${result.preservedAgent} agent scores preserved ` +
      `(${result.scanned} scanned).`,
  );
}

async function doExport() {
  const batch = await buildJudgeBatch({
    topN: num("topN") ?? num("limit"),
    country: flag("country"),
    out: flag("out"),
  });
  console.log(`Exported ${batch.count} job(s) for agent judge review -> ${batch.outputPath}`);
  console.log(`  resume skills : ${batch.resume.skills.slice(0, 12).join(", ") || "(none on file)"}`);
  if (batch.count === 0) {
    console.log("  Nothing to review. Run `npm run judge -- score` first or adjust --country.");
  } else {
    console.log("Next: score each item, write {\"scores\":[...]}, then run `npm run judge:apply -- <scores.json>`.");
  }
}

interface ScoresFile {
  scores?: JudgeScoreInput[];
}

async function doApply() {
  const inPath = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : flag("in");
  if (!inPath) {
    console.error("apply requires <file> or --in <file> containing {\"scores\":[...]} or a bare array.");
    process.exit(1);
  }
  const raw = readFileSync(resolve(inPath), "utf8");
  const parsed = JSON.parse(raw) as ScoresFile | JudgeScoreInput[];
  const scores = Array.isArray(parsed) ? parsed : (parsed.scores ?? []);
  if (!Array.isArray(scores) || scores.length === 0) {
    console.error("No scores found in file.");
    process.exit(1);
  }
  const result = await applyJudgeScores(scores);
  console.log(`Applied ${result.updated} agent judge score(s).`);
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length}:`);
    for (const skipped of result.skipped) console.log(`  - ${skipped.id}: ${skipped.reason}`);
  }
}

async function main() {
  const cmd = process.argv[2] ?? "score";
  switch (cmd) {
    case "score":
      return doScore();
    case "export":
      return doExport();
    case "apply":
      return doApply();
    default:
      console.error("Usage: judge <score|export|apply> [flags]");
      process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
