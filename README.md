# Job Application Pipeline

A local-first, semi-automated **A→Z job application pipeline**. You give it search
criteria and your resume; it scrapes fresh postings from job boards on a schedule,
scores them against your criteria, and prepares complete applications for the easy
ATSes (**Greenhouse, Lever, Ashby**). Nothing is ever submitted without you clicking
**Confirm & send** — a mandatory human approval gate.

Workday postings are **detected and flagged only** — never auto-applied — and listed
separately so you can handle them by hand.

> **Safety first:** submission runs in **DRY-RUN by default**. Applications are fully
> prepared and recorded, but nothing is sent until you explicitly switch to live mode.

---

## Features

- **Pluggable sources** — Greenhouse, Lever, Ashby, GitHub repos (structured
  `listings.json`), RSS/Atom, and generic JSON endpoints. Add/remove/enable/disable
  and "Run now" from the dashboard.
- **Three-layer dedup so you never apply twice** (see [below](#dedup--never-apply-twice)).
- **Rule-based fit scoring** against your criteria — deterministic, no API key needed.
- **Human approval gate** — every application parks at `pending_approval`; you review
  the exact fields that will be sent, then confirm.
- **Refresh Profile** — re-reads your latest resume, parses it, and fills any blank
  application fields (OpenAI if a key is set, otherwise a deterministic fallback parser).
- **Workday flagging** — surfaced in a separate list, never auto-applied.
- **Scheduled scans** via cron.
- **Clean dashboard** — Overview, Jobs, Sources, Workday, Profile, Criteria.

## Tech stack

Next.js 16 (App Router) · React 19 · Prisma 6 + SQLite · TypeScript · Tailwind v4 ·
node-cron · Vitest. Playwright is used only for optional live submission (not installed
by default).

---

## Quickstart

```bash
# 1. Install deps
npm install

# 2. Configure environment (defaults are safe)
cp .env.example .env

# 3. Set up the database
npm run db:migrate
npm run db:generate

# 4. Seed example sources + a demo profile/criteria
npm run db:seed

# 5. Pull fresh jobs once (hits live public ATS APIs)
npm run scan

# 6. Launch the dashboard
npm run dev
# open http://localhost:3000
```

The seed adds example sources (Figma, GitLab, Palantir, Ramp, and the SimplifyJobs
new-grad GitHub feed) plus a **placeholder** demo identity so the flow works out of the
box. Replace it with your own details on the **Profile** page.

---

## Dashboard tour

| Page | What you do there |
| --- | --- |
| **Overview** | Pipeline stats, current apply mode, recent source runs. |
| **Jobs** | Matched postings sorted by fit score. Draft → review the exact fields → **Confirm & send**, or Reject. Filter by status / search. |
| **Sources** | Add / remove / enable / disable job boards and run them on demand. |
| **Workday** | Read-only list of flagged Workday jobs with apply links. |
| **Profile** | Edit every field applications ask for, and **Refresh Profile** from your resume. |
| **Criteria** | Target titles, locations, boost/exclude keywords, remote-only, seniority. |

### The apply flow (human gate)

```
scan → job matched → Draft → pending_approval → [you review] → Confirm & send → submitted
                                                              ↘ Reject → rejected
```

`Confirm & send` calls the submitter, which is **DRY-RUN unless `APPLY_MODE=live`**. In
dry-run the intended submission is recorded (so dedup/history is accurate) but nothing
leaves your machine.

---

## Sources

Each source is an adapter behind a common interface. Configure them in the dashboard or
seed them. Built-in kinds:

| Kind | Config |
| --- | --- |
| `greenhouse` | `company` (board token, e.g. `figma`) |
| `lever` | `company` (slug, e.g. `palantir`) |
| `ashby` | `company` (board name, e.g. `ramp`) |
| `github-repo` | `owner`, `repo`, `path` (e.g. a `listings.json`), optional `ref`, `limit` |
| `rss` | `url` |
| `json` | `url`, optional `itemsPath`, `mapping` |

All sources feed the same dedup + scoring layer, so overlapping feeds (e.g. an
aggregator that links to a Greenhouse board) collapse into one canonical job.

## Dedup — never apply twice

Three independent guards:

1. **Canonical identity** — every job gets a unique `dedupeKey`
   (`atsType:externalId` when known, otherwise a `company|title|location` hash).
   Ingest is an upsert, so re-scans and cross-source overlaps collapse into one job;
   each source that saw it is recorded as a *sighting*.
2. **Application idempotency** — `applications.jobId` is UNIQUE. If an application is
   already `drafted`/`pending_approval`/`submitted`, drafting again is a no-op.
3. **Repost / fuzzy guard** — a `company|normalized-title|location` fingerprint (with
   seniority markers stripped) blocks applying to a re-posted job that already has an
   in-flight or submitted application under a different id.

## Matching / scoring

`lib/matching/score.ts` scores each job 0–100 against your criteria: title match,
boost keywords, location/remote fit, seniority — with hard exclusions via
`excludeKeywords`. It's deterministic and needs no LLM.

## Refresh Profile & resume parsing

**Refresh Profile** reads `resumeSource` (a local `.txt`/`.md`/`.json`/`.html` path or a
URL), parses it, saves a `ResumeVersion`, and **non-destructively** fills only the
profile fields you've left blank. Parsing uses OpenAI when `OPENAI_API_KEY` is set,
otherwise a dependency-free regex parser. (PDF/DOCX aren't parsed directly — convert to
text first.)

---

## Scheduled scanning

```bash
npm run cron     # runs on SCAN_CRON (default: every 30 min), scans immediately on start
```

The cron process only **discovers and scores** jobs — it never submits. Submission
always stays behind the dashboard's human gate.

## Going live (optional, advanced)

Live submission is intentionally hard to trigger by accident:

1. `npm install playwright && npx playwright install chromium`
2. Set `APPLY_MODE=live` in `.env`.
3. Set the per-ATS guard for the boards you want (`GH_AUTO_SUBMIT=1`, `LEVER_AUTO_SUBMIT=1`).

Even then, submission only happens when *you* click **Confirm & send** on a specific job.
The Playwright fillers in `lib/applications/live/` are scaffolds — review and adapt them
to each form before trusting them.

---

## Testing

```bash
npm test          # vitest: dedup, scoring, adapters, resume parser, full pipeline
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # production build
```

Tests run against an isolated `prisma/test.db` (migrated fresh each run) and mock all
network calls, so the suite is offline and deterministic.

## Project structure

```
app/                 Next.js dashboard (pages) + API routes under app/api
lib/
  sources/           adapters, dedup/normalize, run engine, registry
  matching/          rule-based scoring
  applications/      draft, human-gate service, dry-run/live submit
  profile/           resume extraction + Refresh Profile
  llm/               resume parsing (OpenAI + deterministic fallback)
  settings.ts        Profile & Criteria singletons
prisma/              schema, migrations, seed
scripts/             scan (one-off) + cron (scheduled)
test/                vitest suite
sample-data/         a sample resume for the demo profile
```

---

## Privacy & compliance

- **Local-first.** Your data and keys live in `.env` / the local SQLite DB and are never
  committed (`.env*` and `*.db` are gitignored).
- Prefers **official ATS APIs** over scraping.
- **Workday** is flag-only by design.
- **Discord (deferred):** scraping a Discord channel you're only a member of would require
  either an official bot (which you can't add) or a self-bot (against Discord's ToS), so
  it's intentionally left out. If a channel republishes an upstream feed, add that feed as
  an `rss`/`json`/`github-repo` source instead.

Use responsibly and within each site's Terms of Service.
