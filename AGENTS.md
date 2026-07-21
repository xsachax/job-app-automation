<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent-in-the-loop resume matching

Tier-2 resume fit is powered by *you* (the Copilot agent), not an API key. When the user
asks to review/score matches against their resume:

1. `npm run match:export` — writes `.match/review.json` (shortlisted jobs + parsed resume + criteria).
2. Read that file. For each item, judge resume fit: skill/domain overlap, seniority, and
   hard-requirement gaps. Reward transferable experience; penalize missing must-haves.
3. Write `{"scores":[{jobId,score,reasons:[],summary,recommend}]}` to a file, then
   `npm run match:apply -- --in <file>`.

`score` is 0–100 resume fit (not the rule score). Scores are stamped with the resume
version, so `npm run match:rescore` keeps current agent scores and a new resume re-queues
review. Implementation: `lib/matching/agent.ts` + `lib/matching/resume.ts`.
