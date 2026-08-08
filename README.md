# Job Application Pipeline

A local-first pipeline that **discovers currently-open entry-level software roles**
(SWE, DevOps, ML, and related) at 70+ big-tech / well-known / VC-backed companies and
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
> a durable **application profile**, **company/location tier boards**, and a **tier-first
> fit judge** that ranks discovered roles against your preferences and résumé. Legacy
> auto-apply fillers are retained but unused (see
> [Paused features](#paused-features)). Workday postings are flagged in a separate list.

---

## Discovery pipeline

Postings are pulled directly from each company's careers backend. 78 companies expose a
usable public JSON API (Greenhouse, Ashby, Lever, Amazon, Uber, Netflix, Snap, Phenom,
Spotify, Workday CXS) — including a block of quant / high-frequency trading firms (Jane
Street, Point72, Optiver, Jump, IMC, Tower Research, Squarepoint, Qube, WorldQuant, AQR,
DRW, HRT…) — and are fetched server-side; the rest are client-rendered or bot-gated and
are either scraped with Playwright (Apple and Shopify) or surfaced via a pinned search URL.

```bash
# Fetch fresh US/CA entry-level roles from every API company (deduped upsert)
npm run discover

# Only specific companies
npm run discover -- Amazon Stripe OpenAI

# Keep every software role, skip the ≤2-YoE gate
npm run discover -- --all-levels

# Playwright-scrape the supported client-rendered sites
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

### Posting availability and safe closure

Discovery never deletes a job. Each catalog source has durable run records and per-job
sightings. A posting moves through `open → suspect → closed` using conservative evidence:

- failed, disabled, partial, or implausibly truncated source runs never count as misses;
- a successful full-board Greenhouse, Lever, or Ashby response is authoritative, while
  search-limited APIs, browser scrapes, YC expansion, and community boards cannot prove
  closure by disappearance alone;
- a newly missing posting is marked **Rechecking** and verified through its direct URL with
  bounded concurrency; HTTP 404/410 or an explicit closed-page message closes it immediately;
- otherwise, closure requires two complete authoritative misses. Aggregator disappearance
  alone never closes a role.

The first complete run for each source only seeds evidence for existing rows, so enabling this
logic cannot hide legacy jobs immediately. Confirmed closures leave the canonical `Job`,
application status, score, and timestamps intact and appear under **Jobs → Archived closed**.
If a direct source sees the same requisition again, that row reopens instead of being duplicated.

---

## Features

- **Company-site discovery** — 78 public-API companies (incl. quant / HFT firms) + Playwright
  scraping for Apple and Shopify, plus community GitHub job boards (SimplifyJobs, vanshb03) for the long
  tail of employers, classified to US/Canada entry-level roles. See [Discovery pipeline](#discovery-pipeline).
- **Two separate queues** — US and Canada, newest-first, with last-24h / 7d / 30d filters.
- **Rate-safe dashboard refreshes** — the shared scrape control enforces a durable two-hour
  cooldown and shows a live countdown before the next run can start.
- **Evidence-based availability** — incomplete runs cannot close jobs; missing postings are
  rechecked, confirmed closures are archived rather than deleted, and reappearing requisitions
  reopen with their saved/applied history intact.
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
  card; **new** (< 48h), **30d+ old**, **Rechecking**, and **Closed** postings are labeled
  distinctly.
- **Optional Chrome autofill assistant** — open a posting from the Jobs page, fill recognized
  fields from a profile stored in Chrome, track progress in both the posting and dashboard,
  and list every unknown or manual field. It has a global off switch and never submits.
- **Warm-intro tagging** — import your LinkedIn **Connections.csv** on the Profile page and
  every card at a company where you already know someone gets a 🤝 badge. Hover or focus the
  badge to see every matching connection's name and role. A **Warm intro** filter narrows the
  queue to just those. Matching is local and
  normalized (`lib/connections/*`), so "Amazon Web Services (AWS)" matches the catalog's
  "Amazon" and "Jane Street Capital" matches "Jane Street". See [below](#warm-intros-linkedin-connections).
- **Tier-first fit judge** — company tier selects a strict score band; résumé fit, location,
  freshness, experience, and pay only rank jobs within that band. A lower-tier company can
  never outrank a higher-tier company, and the maximum score is 97. See below.
- **Comprehensive application profile** — the **Profile** page stores country-specific
  location/work authorization, education, GPAs and test scores, citizenship, clearances,
  software-industry experience, prior employers, compensation expectations, common application
  defaults, explicit voluntary demographics, a saved résumé PDF, target roles, skills, and
  qualifications.
- **Durable editing** — profile changes auto-save with per-field conflict protection and a
  session draft; company and location tier edits use an ordered retryable save queue, so
  switching pages does not discard work.
- **Dark mode + dense layout** — full light/dark theming with a no-FOUC init.
- **Dedup so nothing is listed twice** — including cross-source (a role found on both a
  company site and an aggregator board collapses into one card). See [below](#dedup--never-apply-twice).
- **Entry-level gate** — software role, not senior, ≤ 2 years experience, no advanced
  degree required. "No experience specified" passes. (Tunable in Settings.)
- **Safe application handoff** — every card opens the real posting. Without the optional
  extension it is a normal link; with the extension connected, the assistant opens beside the
  form and waits for you to start autofill from its protected panel.
- **Workday flagging** — surfaced in a separate list.
- **Clean dashboard** — Overview, Jobs (US/CA), Companies, Judge, company/location tiers,
  Profile, Settings, Extension, and Workday.

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
| **Jobs** | Time-sorted US / CA queues of active postings plus an Archived closed view that preserves application history. Filter by category, date, skills, sponsorship, employment type, source, min salary, min fit, remote, warm intro and applied status; sort by newest / company / best fit / salary. Each active card links out or launches the optional autofill assistant, tracks its progress, and lets you mark status. |
| **Companies** | Coverage of every API and browser-scraped source. |
| **Judge** | Review scoring coverage and signal definitions, set a salary target, monitor exact processed/total progress, and re-score all eligible jobs. |
| **Company tiers** | Drag employers from S through F. The tier is authoritative: it selects the job's final score band. Unrated companies use E. |
| **Location tiers** | Rank places from S through F. Location preference adjusts placement only within the company band; unrated locations are neutral. |
| **Extension** | Install the optional Chrome extension and see its live connection status. |
| **Settings** | Edit discovery configuration — countries, max YoE, degree/internship gates, keywords, scraper query terms, per-source enable/disable. |
| **Profile** | Manage automatically saved country-specific application details, education and qualifications, recurring application defaults, voluntary self-identification answers, a saved résumé PDF from GitHub or Google Drive, Judge signals, and your LinkedIn Connections.csv, then run the Judge. |
| **Workday** | Read-only list of flagged Workday jobs with apply links. |

---

## Chrome autofill extension (optional)

The Manifest V3 extension is plain JavaScript under `apps/chrome-extension`; loading it
unpacked is enough for local use:

1. Start the dashboard and select **Extension** in the sidebar.
2. Enable **Developer mode**, click **Load unpacked**, and select this repository's
   `apps/chrome-extension` directory.
3. Add your application details on **Profile → Application autofill**, then save.
4. On **Jobs**, click a posting title or **Open** action. The extension opens the application
   with a progress panel. Click **Autofill ready fields**, then review every answer.

The app profile is the source of truth. A mapped autofill copy and application progress stay
in that Chrome profile via `chrome.storage.local`.
The assistant combines labels, accessibility text, nearby prompts, browser autocomplete hints,
and ATS metadata instead of relying on exact field names. It supports native and custom controls,
dynamic steps, open shadow roots, and embedded forms from Greenhouse, Lever, Ashby, Workday,
SmartRecruiters, iCIMS, Oracle/Taleo, and SAP SuccessFactors. Uncertain matches are left blank
and highlighted for review. The saved PDF is attached only to recognized résumé fields;
Greenhouse-style school/degree lists and delayed portal dropdowns are matched semantically.
Multi-location questions select only locations ranked S through C on the location tier board;
consent checkboxes and other uploads stay manual. The extension never submits an application.
Application pages receive only field-availability flags until you explicitly click autofill.
Turn it off globally from its browser-owned popup. If it is off, disconnected, or not configured,
dashboard job links behave as normal external links. The unpacked extension has a stable ID, so
no ID copy/paste is needed.

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
first saw the job), split into **United States** and **Canada** tabs. **Open & rechecking**
is the default; **Archived closed** exposes confirmed closures without losing saved/applied
state. Controls:

- **Date posted** — `Last 24 hours`, `Last 7 days`, `Last 30 days`, `All time`.
- **Sort** — `Newest` (default), `Company`, `Best fit`, or `Salary`.
- **Facets** — category (Big Tech / AI Lab / Quant / Startup), skills (match-all),
  sponsorship, employment type, source, applied status — each showing live counts — plus
  **min salary**, **min fit**, **remote only**, **warm intro** (jobs where you have a LinkedIn
  connection, shown only once connections are imported) and free-text search on title/company.
- **Card actions** — `Open posting ↗` (normal link or extension-assisted handoff) and status buttons (`Save`,
  `Mark applied`, `Dismiss`, `Clear`). **New** (< 48h), **30d+ old**, **Rechecking**, and
  **Closed** badges distinguish age from actual availability evidence.

The API backs this at `GET /api/jobs?view=discovery&country=US|CA&availability=active|closed&sort=posted|company|fit|salary`
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
`ConnectionSet` row and surfaced via `GET/POST/DELETE /api/connections`. Job-list responses
embed a small preview; opening a connection badge lazily fetches the complete local list for
that company. Re-import monthly to stay current.

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

Company names are canonicalized before ingest and tier/connection matching, so variants such
as casing changes or legal suffixes share one employer. To repair historical rows after adding
an alias, run `npm run companies:dedupe`.

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

The Judge ranks **already-discovered** jobs. Company tier is authoritative and chooses a
strict, non-overlapping final score band:

| Company tier | Final score band |
| --- | ---: |
| S | 84–97 |
| A | 70–83 |
| B | 56–69 |
| C | 42–55 |
| D | 28–41 |
| E or unrated | 14–27 |
| F | 0–13 |

The deterministic or Copilot-reviewed résumé assessment is retained separately as a raw
0–100 base score. Résumé overlap plus location tier, freshness, required experience, and pay
then position the job **inside** its company band; they cannot promote or demote it across a
tier boundary. Final evidence is rebuilt on each run so changing tiers or context cannot
leave stale explanations behind.

```bash
npm run judge                     # deterministic pass over every eligible job
                                  #   flags: -- --country US --limit N --only-unscored --force
npm run judge:export              # writes .match/judge-review.json: top jobs + your résumé
                                  #   flags: -- --country US --topN 25 --out <file>
# → the Copilot agent writes {"scores":[{id,score,summary,fits:[],gaps:[]}]}
npm run judge:apply -- <scores.json>   # persists agent scores (fitProvider = "agent")
```

Deterministic scores show an **`auto`** fit badge; Copilot-reviewed résumé evidence shows
**`agent`**. Applying agent evidence immediately re-bands the final score using the current
company and contextual signals. `POST /api/judge/score`, `GET /api/judge/score`, and
`GET /api/judge/status` back the shared progress display on Judge, Profile, and both tier
boards. Sort/filter the queue by **Best fit** / **min fit** to surface the strongest matches.

> **Scrape everything, then judge** — jobs are always stored and deduped first, so
> retuning Settings or importing a new résumé re-scores instantly with no re-scraping.

## Import your info (Profile)

The **Profile** page is the local source of truth for both the Judge and extension. It covers
contact information; separate US/Canada country, city, work-authorization, sponsorship, and
citizenship answers; school, degree, discipline, graduation date, relevant and non-internship
software-industry experience, previous employers, target total compensation, certifications,
GPAs, SAT/ACT/GRE scores, security clearances, accommodations, "how did you hear about us,"
explicit Hispanic/Latino and transgender answers, other voluntary demographics, and
résumé/cover-letter data. Contact and demographic answers are autofill-only and never influence
Judge scores.

A **résumé PDF URL** is fetched and parsed server-side, with **pasted résumé text** as a
fallback. **Fetch text** writes a `ResumeVersion` and non-destructively fills blank Judge
signals; **Save and re-run judge** flushes pending profile changes before scoring. Normal
field edits auto-save after a short delay, persist a session draft until acknowledged by the
server, and flush when the page is hidden or closed.

The same page hosts **LinkedIn connections** import (upload/paste `Connections.csv`) for
warm-intro tagging — see [Warm intros](#warm-intros-linkedin-connections).

---

## Scheduled scanning

```bash
npm run cron     # runs on SCAN_CRON (default: every 30 min), scans immediately on start
```

The cron process only **discovers and scores** jobs — it never submits. Submission
always stays behind the dashboard's human gate.

## Legacy live-submission scaffolding (paused)

This is not part of the current discovery/autofill workflow. The retained scaffolding is
intentionally hard to trigger by accident:

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
network calls, so the suite is offline and deterministic. Coverage includes migrations,
deduplication, source adapters, enrichment, profile persistence, tier-first scoring, agent
evidence, connections, and the configurable classifier.

### End-to-end (Playwright)

`npm run e2e` boots the real production dashboard against a throwaway SQLite database
seeded by `scripts/e2e-seed.ts` (US + CA entry-level discovery fixtures — enriched with
skills/salary/sponsorship/fit — plus one Workday flag). It exercises the US/CA queue tabs,
newest-first ordering, the date-posted and **min-fit** filters, the queue count, enriched
card display, the **applied-status** flow, connection hover details, durable profile/tier
editing, Judge progress, the Companies page, and the Workday flag-only list — with no live
network calls. First run needs the browser:
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
  judge/             score status, axes, salary target and exact run progress
  tiers/             company S–F board (authoritative score bands)
  location-tiers/    location S–F board (within-band preference)
  settings/          configurable discovery pipeline editor
  profile/           persistent application profile, résumé, judge signals, connections
  extension/         Chrome extension install and connection status
  workday/           Workday flag-only list
  api/               jobs, config, judge, profile, tiers, connections, extension, …
apps/
  chrome-extension/  unpacked Manifest V3 extension (popup, form panel, icons)
lib/
  chromeExtension.ts typed dashboard ↔ Chrome extension messaging client
  company-names.ts   shared employer aliases/canonicalization
  connections/       LinkedIn CSV parsing, normalization and local storage
  discovery/         catalog, adapters.ts (API fetchers), browser.ts (Playwright),
                     entryLevel.ts (config-driven classifiers), enrich.ts, config.ts, run.ts
  judge/             tier-first scoring, progress coordination, agent export/apply
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
  Chrome restricts dashboard communication to the loopback URL patterns declared in the
  extension manifest, and the extension never submits an application.
- Prefers **official ATS APIs** over scraping.
- **Workday** is flag-only by design.
- **Discord (deferred):** scraping a Discord channel you're only a member of would require
  either an official bot (which you can't add) or a self-bot (against Discord's ToS), so
  it's intentionally left out. If a channel republishes an upstream feed, add that feed as
  an `rss`/`json`/`github-repo` source instead.

Use responsibly and within each site's Terms of Service.
