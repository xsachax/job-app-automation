# Job Application Pipeline

A local-first pipeline that **discovers currently-open entry-level software roles**
(SWE, DevOps, ML, and related) at ~40 big-tech / well-known / VC-backed companies and
surfaces them in a dashboard as two separate queues — **United States** and **Canada** —
sorted newest-first with date filters. Each card links straight to the real posting; you
apply yourself. Nothing is auto-filled or submitted.

The queue targets roles that are **entry-level or ask for ≤ 2 years of experience**, at
**bachelor's-degree-or-below** level (Masters/PhD-required roles are filtered out).

> **Focus:** the project is currently **discovery-only**. Auto-apply and resume matching
> are **paused** — the code is retained (see [Paused features](#paused-features)) but the
> dashboard just finds jobs and links out. Workday postings are flagged in a separate list.

---

## Discovery pipeline

Postings are pulled directly from each company's careers backend. 34 companies expose a
usable public JSON API (Greenhouse, Ashby, Amazon, Uber, Netflix, Snap, Phenom, Spotify,
Workday CXS) and are fetched server-side; the rest are client-rendered or bot-gated and
are either scraped with Playwright (Apple) or surfaced via a pinned search URL.

```bash
# Fetch fresh US/CA entry-level roles from every API company (deduped upsert)
npm run discover

# Only specific companies
npm run discover -- Amazon Stripe OpenAI

# Keep every software role, skip the ≤2-YoE gate
npm run discover -- --all-levels

# Playwright-scrape the client-rendered sites (Apple supported; rest reported)
npm run discover:browser

# Live confirmation table of every company's endpoint + US/CA entry counts
npm run discovery:verify
```

Roles are filtered to US/Canada and classified as entry-level up front, then upserted into
the `Job` table deduped by `system:externalId` (or a content fingerprint). Browse them on
the **Jobs** page (US / CA tabs) and see coverage on the **Companies** page.

---

## Features

- **Company-site discovery** — 33 public-API companies + Playwright scraping for Apple,
  classified to US/Canada entry-level roles. See [Discovery pipeline](#discovery-pipeline).
- **Two separate queues** — US and Canada, newest-first, with last-24h / 7d / 30d filters.
- **Dedup so nothing is listed twice** (see [below](#dedup--never-apply-twice)).
- **Entry-level gate** — software role, not senior, ≤ 2 years experience, no advanced
  degree required. "No experience specified" passes.
- **Link-out only** — every card opens the real posting; you fill the application.
- **Workday flagging** — surfaced in a separate list.
- **Clean dashboard** — Overview, Jobs (US/CA), Companies, Workday.

### Paused features

Auto-apply (human approval gate, DRY-RUN submission, live Playwright fillers) and two-tier
resume matching remain in the codebase (`lib/applications/**`, `lib/matching/**`, their API
routes and the Profile/Criteria/Sources pages) but are **unlinked from the nav** and not
part of the discovery flow. They can be re-enabled later.

## Tech stack

Next.js 16 (App Router) · React 19 · Prisma 6 + SQLite · TypeScript · Tailwind v4 ·
Playwright (discovery browser scraper + optional live submission) · Vitest.

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

# 4. Discover fresh US/CA entry-level roles (hits live public career APIs)
npm run discover

# 5. (optional) Playwright-scrape Apple
npm run discover:browser -- Apple

# 6. Launch the dashboard
npm run dev
# open http://localhost:3000
```

---

## Dashboard tour

| Page | What you do there |
| --- | --- |
| **Overview** | Pipeline stats, current apply mode, recent source runs. |
| **Jobs** | Time-sorted queue of matched postings. Filter by date posted (24h / 7d / 30d / all), sort by **Newest first** or **Best match**, filter by status / search. Draft → review the exact fields → **Confirm & send**, or Reject. |
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

### Company catalog (seeded by default)

`npm run db:seed` wires up a curated catalog of **70+ companies** that hire in the
US/Canada and use easy-apply ATSes — big tech (Airbnb, Roblox, Waymo…), known
scale-ups (Stripe, Databricks, Figma, OpenAI, Notion…), and startups backed by
**Y Combinator / a16z / Greylock** (Ramp, Vanta, Cursor, Harvey, Vercel…). Every
token in [`lib/sources/catalog.ts`](lib/sources/catalog.ts) is verified live against
its public job-board API, so a fresh scan pulls **~12k real postings** on the first run.

To vet new tokens before adding them to the catalog:

```bash
npm run sources:probe   # probes candidate Greenhouse/Lever/Ashby boards, prints the live ones
```

## The queue (Jobs page)

The Jobs page is a **queue ordered by time posted** (`postedAt`, falling back to when we
first saw the job). Controls:

- **Date posted** — `Last 24 hours`, `Last 7 days`, `Last 30 days`, `All time`.
- **Sort** — `Newest first` (default) or `Best match first` (rule score).
- **Status** filter + free-text search on title/company.

The API backs this at `GET /api/jobs?sort=posted|score&since=24h|7d|30d|all`.

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

Matching is **two-tier** so cheap, universal scoring happens on every scan and the
expensive, judgement-based scoring is targeted and re-runnable.

**Tier 1 — rule score (always, over everything).** `lib/matching/score.ts` scores
each job 0–100 against your *criteria*: title match, boost keywords, location/remote
fit, seniority — with hard exclusions via `excludeKeywords`. Deterministic, no LLM.
Stored on `Match.score`.

**Tier 2 — resume fit (skills + experience).** `lib/matching/resume.ts` scores each
job 0–100 against your *resume* (parsed skills, prior roles, summary, full text):
skill coverage, title alignment, keyword resonance, and notable posting requirements
missing from your resume. This deterministic **baseline** runs at the end of every
scan and after **Refresh Profile**, stored on `Match.resumeScore`
(`matchProvider = "deterministic"`).

**Tier 2, agent-in-the-loop (optional, powered by Copilot — no API key).** For nuanced
judgement (transferable experience, seniority, hard-requirement gaps) the Copilot agent
itself scores the shortlist during a session:

```bash
npm run match:export              # writes .match/review.json: top jobs + your resume
                                  #   flags: -- --limit 25 --min 40 --all --out <file>
# → the agent reads that file, scores each job's resume fit, and writes
#   {"scores":[{jobId,score,reasons,summary,recommend}]} to a file
npm run match:apply -- --in <file>   # persists agent scores (matchProvider = "agent")

npm run match:rescore             # recompute the deterministic baseline on demand
                                  #   (agent scores at the current resume version are kept)
```

Agent scores override the baseline and show as an **`agent`** fit badge in the Jobs
page (deterministic ones show **`auto`**). Because each score is stamped with the
resume version used, a new resume (via Refresh Profile) marks scores stale and
re-queues those jobs for review. The dashboard's **Re-score fit** button and
`POST /api/match/rescore` run the baseline pass; `GET /api/match/review` returns the
current shortlist.

> **Scrape everything, then match** — jobs are always stored and deduped first, so
> changing your criteria or resume re-scores instantly with no re-scraping.

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
npm test          # vitest: dedup, scoring, resume matching, adapters, resume parser, full pipeline
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # production build
npm run e2e       # Playwright: dashboard flows against an isolated seeded DB
```

Unit tests run against an isolated `prisma/test.db` (migrated fresh each run) and mock all
network calls, so the suite is offline and deterministic.

### End-to-end (Playwright)

`npm run e2e` boots the real production dashboard against a throwaway SQLite database
seeded by `scripts/e2e-seed.ts` (US + CA entry-level discovery fixtures plus one Workday
flag). It exercises the US/CA queue tabs, newest-first ordering, the date-posted filter,
the queue count, the Companies page, and the Workday flag-only list — with no live network
calls. First run needs the browser: `npx playwright install chromium`. Open the last HTML
report with `npm run e2e:report`.

The discovery **runtime** browser scraper (`npm run discover:browser`) is separate and
intentionally kept **out of CI** — it needs a real browser and live network.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, in two jobs:

- **unit** — `npm ci` → `prisma generate` → lint → typecheck → `npm test` → build.
- **e2e** — `npm ci` → `prisma generate` → install Chromium → build → `npm run e2e`
  (uploads the Playwright HTML report as an artifact on failure).

Both run on Node 22 / Ubuntu with no secrets — everything is offline.

## Project structure

```
app/                 Next.js dashboard (pages) + API routes under app/api
  page.tsx           Overview (discovery stats)
  jobs/              US/CA discovery queue (link-out cards)
  companies/         coverage table (API + browser sources)
  workday/           Workday flag-only list
lib/
  discovery/         companies.ts (catalog), adapters.ts (API fetchers),
                     browser.ts (Playwright scraper), entryLevel.ts (classifiers), run.ts
  sources/           legacy pluggable-source engine (dedup/normalize reused by discovery)
  matching/          score/resume/agent — PAUSED (retained, unlinked)
  applications/      draft, human-gate, dry-run/live submit — PAUSED (retained, unlinked)
prisma/              schema, migrations, seed
scripts/             discover (API), discover --browser, verify-queries, e2e-seed
test/                vitest suite
e2e/                 Playwright specs (smoke, queue, discovery)
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
