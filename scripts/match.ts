import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prisma } from "../lib/db";
import {
  buildReviewBatch,
  applyAgentScores,
  rescoreResumeFit,
  type AgentScore,
} from "../lib/matching/agent";

// Agent-in-the-loop resume matching CLI.
//
//   npm run match:export   [-- --limit 25 --min 40 --all --out <file>]
//   npm run match:apply    -- --in <file>
//   npm run match:rescore
//
// Typical Copilot session flow:
//   1. `npm run match:export`  -> writes .match/review.json
//   2. read that file, score each job's resume fit, write .match/scores.json
//      as {"scores":[{jobId,score,reasons,summary,recommend}]}
//   3. `npm run match:apply -- --in .match/scores.json`

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function num(name: string): number | undefined {
  const v = flag(name);
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function doExport() {
  const batch = await buildReviewBatch({
    limit: num("limit"),
    minScore: num("min"),
    includeAgentScored: hasFlag("all"),
  });
  const out = resolve(flag("out") ?? ".match/review.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(batch, null, 2));

  console.log(`Exported ${batch.count} job(s) for resume review -> ${out}`);
  console.log(`  resume source : ${batch.resumeSource} (version ${batch.resumeVersionId ?? "none"})`);
  console.log(`  resume skills : ${batch.resume.skills.slice(0, 12).join(", ") || "(none on file)"}`);
  if (batch.count === 0) {
    console.log("  Nothing to review. Run a scan, lower --min, or pass --all to re-review.");
  } else {
    console.log("\nNext: score each item, then run `npm run match:apply -- --in <scores.json>`.");
    console.log(`Instructions: ${batch.instructions}`);
  }
}

interface ScoresFile {
  scores?: AgentScore[];
}

async function doApply() {
  const inPath = flag("in");
  if (!inPath) {
    console.error("apply requires --in <file> containing {\"scores\":[...]} or a bare array.");
    process.exit(1);
  }
  const raw = readFileSync(resolve(inPath), "utf8");
  const parsed = JSON.parse(raw) as ScoresFile | AgentScore[];
  const scores = Array.isArray(parsed) ? parsed : (parsed.scores ?? []);
  if (!Array.isArray(scores) || scores.length === 0) {
    console.error("No scores found in file.");
    process.exit(1);
  }
  const result = await applyAgentScores(scores);
  console.log(`Applied ${result.updated} agent score(s) (resume version ${result.resumeVersionId ?? "none"}).`);
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length}:`);
    for (const s of result.skipped) console.log(`  - ${s.jobId}: ${s.reason}`);
  }
}

async function doRescore() {
  const r = await rescoreResumeFit();
  console.log(
    `Deterministic resume rescore: ${r.scored} scored, ${r.preservedAgent} agent scores preserved ` +
      `(source: ${r.source}, version ${r.resumeVersionId ?? "none"}).`,
  );
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "export":
      return doExport();
    case "apply":
      return doApply();
    case "rescore":
      return doRescore();
    default:
      console.error("Usage: match <export|apply|rescore> [flags]");
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
