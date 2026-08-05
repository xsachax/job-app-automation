# Job Application Pipeline

A local-first pipeline that **discovers currently-open entry-level software roles**
(SWE, DevOps, ML, and related) at ~40 big-tech / well-known / VC-backed companies and
surfaces them in a dashboard as two separate queues — **United States** and **Canada** —
sorted newest-first with date filters. Each card links straight to the real posting; you
apply yourself, or optionally launch a local Chrome extension that fills known fields and
highlights anything needing your answer. Nothing is submitted automatically.

The queue targets roles that are **entry-level or ask for ≤ 2 years of experience**, at
**bachelor's-degree-or-below** level (Masters/PhD-required roles are filtered out).

> **Focus:** discovery remains the core workflow. The optional local Chrome extension assists
> with form filling only after you open a posting; it never submits. On top of discovery the
> project adds a **configurable pipeline**
> (Settings), **enriched, filterable job cards**, **applied-status tracking**, **dark mode**,
> **personal-info import**, and a **post-scrape fit judge** that ranks discovered roles
> against your résumé. Legacy auto-apply fillers are retained but unused (see
> [Paused features](#paused-features)). Workday postings are flagged in a separate list.

---

## Discovery pipeline

Postings are pulled directly from each company's careers backend. 76 companies expose a
usable public JSON API (Greenhouse, Ashby, Lever, Amazon, Uber, Netflix, Snap, Phenom,
Spotify, Workday CXS) — including a block of quant / high-frequency trading firms (Jane
Street, Point72, Optiver, Jump, IMC, Tower Research, Squarepoint, Qube, WorldQuant, AQR,
DRW, HRT…) — and are fetched server-side; the rest are client-rendered or bot-gated and
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

### Y Combinator expansion (config-driven, no hardcoded list)

Beyond the named companies, one aggregator source expands to **any currently-hiring YC
company from the last few years** without hardcoding tokens. It pulls the community
[`yc-oss`](https://yc-oss.github.io/api/companies/hiring.json) hiring directory, keeps the
recent + established + US/CA companies (batch window, team-size floor/ceiling), then
**resolves each company's public ATS** (Greenhouse / Lever / Ashby) from its own website and
reuses the per-ATS fetchers — so every posting still flows through the normal entry-level /
country / enrichment filters. Resolved boards are cached in `YcAtsCache` (positive 30d,
negative 7d), so the first run crawls sites once and later runs are near-instant. Tune the
window/floor/cap/concurrency in **Settings → Y Combinator expansion**.

```bash
npm run discover -- "Y Combinator"
```

---

## Features

- **Company-site discovery** — 76 public-API companies (incl. quant / HFT firms) + Playwright
  scraping for Apple, plus community GitHub job boards (SimplifyJobs, vanshb03) for the long
  tail of employers, classified to US/Canada entry-level roles. See [Discovery pipeline](#discovery-pipeline).
- **Two separate queues** — US and Canada, newest-first, with last-24h / 7d / 30d filters.
- **Configurable, nothing hardcoded** — countries, max years of experience, degree/
  internship gates, extra role/exclude keywords, scraper query terms and per-source
  enable/disable all live in the **Settings** page (backed by a `DiscoveryConfig` record).
  Come back in two years, retune, re-scrape. See [Configuration & the fit judge](#configuration--the-fit-judge).
- **Enriched job cards** — each posting carries a filterable data shape: normalized
  **salary range**, **required skills**, **visa-sponsorship** signal, and **employment
  type**, extracted deterministically at ingest (no API key).
- **Strong filtering** — filter the queue by **company category** (Big Tech / AI Lab / Quant
  / Startup), skills (match-all), sponsorship, employment type, source, minimum salary,
  minimum fit, remote, applied status, plus text search; sort by newest / company / best fit
  / salary.
- **Company categories** — every card is tagged and colour-badged by employer type (Big Tech,
  AI Lab, Quant, Startup, or Other for aggregated board employers). Derived on read from a
  single classifier (`lib/discovery/categories.ts`), so re-tagging or adding a firm needs no
  migration; the Overview shows a per-category roll-up.
- **Applied tracking** — mark a job `saved` / `applied` / `dismissed` (etc.) right on the
  card; **new** (< 48h) and **stale** (> 30d) postings are styled distinctly.
- **Optional Chrome autofill assistant** — open a posting from the Jobs page, fill recognized
  fields from a profile stored in Chrome, track progress in both the posting and dashboard,
  and list every unknown or manual field. It has a global off switch and never submits.
- **Warm-intro tagging** — import your LinkedIn **Connections.csv** on the Profile page and
  every card at a company where you already know someone gets a 🤝 badge (with names/roles in
  the tooltip). A **Warm intro** filter narrows the queue to just those. Matching is local and
  normalized (`lib/connections/*`), so "Amazon Web Services (AWS)" matches the catalog's
  "Amazon" and "Jane Street Capital" matches "Jane Street". See [below](#warm-intros-linkedin-connections).
- **Post-scrape fit judge** — rank every discovered role against your résumé/skills with a
  deterministic baseline, optionally upgraded by the Copilot agent. See below.
- **Import your info** — the **Profile** page imports contact details, a résumé PDF URL (or
  pasted text), target roles, skills and qualifications the judge scores against.
- **Dark mode + dense layout** — full light/dark theming with a no-FOUC init.
- **Dedup so nothing is listed twice** — including cross-source (a role found on both a
  company site and an aggregator board collapses into one card). See [below](#dedup--never-apply-twice).
- **Entry-level gate** — software role, not senior, ≤ 2 years experience, no advanced
  degree required. "No experience specified" passes. (Tunable in Settings.)
- **Safe application handoff** — every card opens the real posting. Without the optional
  extension it is a normal link; with the extension connected, the assistant opens beside the
  form and waits for you to start autofill from Chrome's browser-owned extension popup.
- **Workday flagging** — surfaced in a separate list.
- **Clean dashboard** — Overview, Jobs (US/CA), Companies, Settings, Profile, Workday.

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

# 4. (optional) Seed the source catalog + a demo profile/criteria
npm run db:seed

# 5. Discover fresh US/CA entry-level roles (hits live public career APIs)
npm run discover

# 6. (optional) Playwright-scrape Apple
npm run discover:browser -- Apple

# 7. (optional) Score discovered roles against your résumé
npm run judge

# 8. Launch the dashboard
npm run dev
# open http://localhost:3000 — then tune Settings, import your info on Profile,
# and hit "Re-run judge"
```

The Chrome extension is optional and needs no build or Web Store publication. Follow
[Chrome autofill extension](#chrome-autofill-extension-optional) after the dashboard starts.

---

## Dashboard tour

| Page | What you do there |
| --- | --- |
| **Overview** | Discovery stats, US/CA entry-level counts, companies covered, by-category and by-company breakdowns. |
| **Jobs** | Time-sorted US / CA queues of discovered postings. Filter by category, date, skills, sponsorship, employment type, source, min salary, min fit, remote, warm intro and applied status; sort by newest / company / best fit / salary. Each card links out or launches the optional autofill assistant, tracks its progress, and lets you mark status. |
| **Companies** | Coverage of every API and browser-scraped source. |
| **Settings** | Connect/test the optional Chrome extension and edit discovery configuration — countries, max YoE, degree/internship gates, keywords, scraper query terms, per-source enable/disable. |
| **Profile** | Import your contact details, résumé PDF URL (or pasted text), target roles, skills and qualifications, and your LinkedIn Connections.csv (for warm-intro tagging), then run the fit judge. |
| **Workday** | Read-only list of flagged Workday jobs with apply links. |

---

## Chrome autofill extension (optional)

The Manifest V3 extension is plain JavaScript under `apps/chrome-extension`; loading it
unpacked is enough for local use:

1. Start the dashboard with `npm run dev` and open `http://localhost:3000`.
   The sidebar's **Install extension** button jumps directly to this setup panel.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select
   this repository's `apps/chrome-extension` directory.
3. Open the extension's options page. Fill the local profile and keep **Allowed dashboard
   origin** set to `http://localhost:3000` (or the exact `localhost` / `127.0.0.1` origin
   where your dashboard runs).
4. Copy the extension ID shown there. In dashboard **Settings → Chrome autofill extension**,
   paste it and click **Save and test**.
5. On **Jobs**, click a posting title or **Open** action. The extension opens the application
   with a progress panel. After reviewing the page, open the extension from Chrome's toolbar
   and click **Autofill current page**.

The profile and application progress stay in that Chrome profile via `chrome.storage.local`.
The assistant skips uploads and consent checkboxes, reports unknown fields, and never presses
a submit button. Turn it off globally from its browser-owned popup. If it is off,
disconnected, or not configured, dashboard job links behave as normal external links.

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
first saw the job), split into **United States** and **Canada** tabs. Controls:

- **Date posted** — `Last 24 hours`, `Last 7 days`, `Last 30 days`, `All time`.
- **Sort** — `Newest` (default), `Company`, `Best fit`, or `Salary`.
- **Facets** — category (Big Tech / AI Lab / Quant / Startup), skills (match-all),
  sponsorship, employment type, source, applied status — each showing live counts — plus
  **min salary**, **min fit**, **remote only**, **warm intro** (jobs where you have a LinkedIn
  connection, shown only once connections are imported) and free-text search on title/company.
- **Card actions** — `Open posting ↗` (normal link or extension-assisted handoff) and status buttons (`Save`,
  `Mark applied`, `Dismiss`, `Clear`). **New** (< 48h) cards and **stale** (> 30d) cards
  are styled distinctly.

The API backs this at `GET /api/jobs?view=discovery&country=US|CA&sort=posted|company|fit|salary`
`&since=24h|7d|30d|all&category=…&skills=…&sponsorship=…&status=…&employmentType=…&source=…`
`&salaryMin=…&fitMin=…&remote=1&connections=1&q=…`. Available filter values (including
`withConnections`) come from `GET /api/jobs/facets`; `PATCH /api/jobs/:id` records applied
status.

## Warm intros (LinkedIn connections)

There is **no LinkedIn API** for your connection list (deprecated years ago; scraping breaks
their ToS), so the compliant path is your own data export:

1. On LinkedIn: **Settings → Data privacy → Get a copy of your data → Connections**.
2. Request the archive, then download **Connections.csv**.
3. On the **Profile** page, upload the file (or paste its contents) under *LinkedIn
   connections*. It is parsed **locally** — nothing is uploaded anywhere.

The importer (`lib/connections/parse.ts`) handles LinkedIn's `Notes:` preamble and quoted
fields; `lib/connections/normalize.ts` reduces both a connection's free-text employer and a
job's catalog company to a shared key (dropping corporate/industry suffixes and resolving a
few aliases), so matches survive spelling differences. The set is stored as a single
`ConnectionSet` row and surfaced via `GET/POST/DELETE /api/connections`. Re-import monthly to
stay current.

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

## Configuration & the fit judge

### Configurable discovery (Settings)

Nothing about *what* to scrape is hardcoded. A single `DiscoveryConfig` record (edited on
the **Settings** page, read by the runner) drives every run:

- **Countries** to bucket postings into (US and CA out of the box).
- **Maximum required years of experience**, **exclude advanced-degree** and **include
  internships** gates — the entry-level classifier reads these instead of fixed constants.
- **Role keywords / excluded title keywords** to widen or narrow what counts.
- **Scraper query terms** handed to each source, and **per-source enable/disable**.

`lib/discovery/config.ts` (`getDiscoveryConfig` / `saveDiscoveryConfig` /
`toEntryLevelOptions`) is the backbone; `GET|PUT /api/config` is the editor API. Defaults
preserve the original behavior, so an empty config scrapes exactly as before.

### Enrichment (at ingest, no API key)

`lib/discovery/enrich.ts` deterministically extracts, for every posting: **skills** (from a
curated vocabulary), a normalized **salary** range (`salaryMin/Max/Currency` + the raw
string), a **visa-sponsorship** signal (`offers` / `none` / `citizenship`), and
**employment type**. These populate the filterable card shape and the Jobs facets.

### Fit judge (post-scrape, powered by Copilot — no API key)

The judge ranks **already-discovered** jobs against your imported résumé/skills and writes
`fitScore` / `fitReasons` / `fitSummary` / `fitProvider` straight onto each `Job`.

```bash
npm run judge                     # deterministic pass over every eligible job
                                  #   flags: -- --country US --limit N --only-unscored --force
npm run judge:export              # writes .match/judge-review.json: top jobs + your résumé
                                  #   flags: -- --country US --topN 25 --out <file>
# → the Copilot agent scores each item and writes {"scores":[{id,score,summary,reasons}]}
npm run judge:apply -- <scores.json>   # persists agent scores (fitProvider = "agent")
```

Deterministic scores show an **`auto`** fit badge; agent scores show **`agent`** and win
over the baseline. `POST /api/judge/score` and `GET /api/judge/review` back the Profile
page's **Re-run judge** button. Sort/filter the queue by **Best fit** / **min fit** to
surface the strongest matches first.

> **Scrape everything, then judge** — jobs are always stored and deduped first, so
> retuning Settings or importing a new résumé re-scores instantly with no re-scraping.

## Import your info (Profile)

The **Profile** page ("Import your info") stores the signals the judge reads: contact
details, a **résumé PDF URL** (fetched + parsed server-side, with a graceful fallback to
**pasted résumé text** when parsing isn't available), plus **target roles**, **skills**,
a **summary** and **qualifications**. **Fetch text** pulls a résumé URL into a
`ResumeVersion` and non-destructively fills blank fields; **Save and re-run judge**
persists your profile and re-scores the queue in one click. PDF parsing uses the optional
`pdf-parse` package when installed, otherwise paste text directly.

The same page hosts **LinkedIn connections** import (upload/paste `Connections.csv`) for
warm-intro tagging — see [Warm intros](#warm-intros-linkedin-connections).

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
network calls, so the suite is offline and deterministic (350 tests, incl. the fit judge,
enrichment, and configurable-classifier coverage).

### End-to-end (Playwright)

`npm run e2e` boots the real production dashboard against a throwaway SQLite database
seeded by `scripts/e2e-seed.ts` (US + CA entry-level discovery fixtures — enriched with
skills/salary/sponsorship/fit — plus one Workday flag). It exercises the US/CA queue tabs,
newest-first ordering, the date-posted and **min-fit** filters, the queue count, enriched
card display, the **applied-status** flow, the Companies page, and the Workday flag-only
list — with no live network calls. First run needs the browser:
`npx playwright install chromium`. Open the last HTML report with `npm run e2e:report`.

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
  jobs/              US/CA discovery queue (link-out cards) + components/jobs/*
  companies/         coverage table (API + browser sources)
  settings/          configurable discovery pipeline editor
  profile/           "Import your info" — résumé + judge signals
  workday/           Workday flag-only list
  api/               jobs (+ facets, [id]), config, judge (score/review), profile, …
apps/
  chrome-extension/  unpacked Manifest V3 extension (popup, options, form panel, icons)
lib/
  chromeExtension.ts typed dashboard ↔ Chrome extension messaging client
  discovery/         catalog, adapters.ts (API fetchers), browser.ts (Playwright),
                     entryLevel.ts (config-driven classifiers), enrich.ts, config.ts, run.ts
  judge/             judge.ts (deterministic Job fit), agent.ts (export/apply)
  profile/           resume.ts, pdf.ts (résumé fetch/parse), refresh.ts
  jobs/              shape.ts (API row shaping)
  sources/           legacy pluggable-source engine (dedup/normalize reused by discovery)
  matching/          score/resume/agent — reused by the judge; auto-apply tiers PAUSED
  applications/      draft, human-gate, dry-run/live submit — PAUSED (retained, unlinked)
prisma/              schema, migrations, seed
scripts/             discover (API / --browser), judge, verify-queries, e2e-seed
test/                vitest suite
e2e/                 Playwright specs (smoke, queue, discovery, jobs-actions, extension)
```


---

## Privacy & compliance

- **Local-first.** Your data and keys live in `.env` / the local SQLite DB and are never
  committed (`.env*` and `*.db` are gitignored).
- The optional extension profile and live application progress use `chrome.storage.local`.
  Dashboard communication is restricted to the exact localhost origin configured in the
  extension options, and the extension never submits an application.
- Prefers **official ATS APIs** over scraping.
- **Workday** is flag-only by design.
- **Discord (deferred):** scraping a Discord channel you're only a member of would require
  either an official bot (which you can't add) or a self-bot (against Discord's ToS), so
  it's intentionally left out. If a channel republishes an upstream feed, add that feed as
  an `rss`/`json`/`github-repo` source instead.

Use responsibly and within each site's Terms of Service.
