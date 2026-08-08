# Google Careers apply monitor

This temporary monitor checks one Google Careers posting for an enabled,
actionable apply control. It monitors observed state; it does not forecast
whether or when the posting will change, and it never submits an application.

- Target: <https://www.google.com/about/careers/applications/jobs/results/78703249065943750>
- Monitoring window: `2026-08-08T07:33:12Z` through
  `2026-08-15T07:33:12Z` (expiry is exclusive)
- Workflow: `.github/workflows/google-job-monitor.yml`

## Detection

A development-time comparison used one bounded GET for the target and one for
the known-working reference. The working page had a server-rendered anchor
identified as `apply-action-button` with an enabled, same-origin
`/about/careers/applications/apply?jobId=...` URL. The target had no such
control. Full page captures are not stored; tests use small synthetic fixtures.

Availability requires all of the following:

1. A complete Google Careers job result page whose canonical URL has the
   target posting ID.
2. The expected Google Careers base URL.
3. An anchor identified as `apply-action-button`.
4. An enabled same-origin apply URL with a non-empty `jobId`.

Visible `Apply` text, a page that merely exists, embedded URLs, disabled
controls, controls inside comments/templates/hidden ancestry, or an unfamiliar
layout cannot produce `available`.

| Status | Exit | Meaning |
| --- | ---: | --- |
| `available` | 0 | The full actionable structural signal is present. |
| `unavailable` | 10 | A valid job page has no apply control, or its known control is disabled. |
| `unknown` | 20 | The response cannot be trusted or the detector is uncertain. No notification is sent. |
| `not_started` | 30 | The UTC monitoring window has not started; no request is made. |
| `expired` | 31 | The UTC expiry was reached; no request is made. |

Blocks, consent pages, captchas, 403/429/5xx responses, unexpected content
types or redirects, malformed or oversized HTML, network errors, and timeouts
are all `unknown`. A 429 `Retry-After` value is reported in JSON, but the
monitor does not retry.

## Local commands

Install the repository normally:

```sh
npm ci
```

Run the focused offline suite:

```sh
npm run test:google-job-monitor
```

Run the detector against a synthetic fixture without network access:

```sh
npm run google-job:monitor -- \
  --fixture scripts/custom/google-job-monitor/fixtures/positive.html
```

Run one live target check:

```sh
npm run google-job:monitor
```

The CLI prints one JSON object and uses the exit codes above. A live invocation
makes one GET, plus at most three same-posting redirects. It uses a descriptive
User-Agent, a 15-second total timeout, a 4 MiB body limit, and no retries.

## Schedule and rate

The workflow is scheduled every 30 minutes at minutes 7 and 37. If enabled for
the full seven-day window, that is at most 336 scheduled target checks. This
halves the request rate of a 15-minute schedule while retaining a maximum
nominal detection delay of about 30 minutes. GitHub scheduling delays can
reduce the actual count. The positive reference is not polled. Manual live dry
runs add one target check each.

Scheduled production checks are disabled by default. They run only while the
UTC window is active and the repository variable
`GOOGLE_JOB_MONITOR_ENABLED` is exactly `true`. At or after
`2026-08-15T07:33:12Z`, the workflow exits before checkout or any target
request. Concurrency prevents overlapping runs.

Before every eligible target request, the workflow checks for the uniquely
labeled and titled production availability issue. Once that issue exists in
either open or closed state, availability is treated as terminal and all later
target requests are skipped. The distinct TEST issue never trips this check.

## Delivery test and activation

No SMTP, SMS, email address, phone number, or custom token is required. The
notifier uses the workflow's short-lived `GITHUB_TOKEN` to create one issue
assigned to and mentioning `xsachax`; GitHub supplies email/push delivery.

After merging the workflow to the default branch:

1. Manually dispatch `Google Careers apply monitor` with
   `mode=notification-test`.
2. Confirm delivery of the issue titled
   `[TEST] Google Careers monitor notification delivery`. It explicitly says
   that no live check occurred and never claims availability.
3. Close the test issue to clean it up.
4. Enable production scheduling only after delivery is confirmed:

   ```sh
   gh variable set GOOGLE_JOB_MONITOR_ENABLED \
     --repo xsachax/job-app-automation --body true
   ```

`detector-test` runs only the synthetic offline suite. `live-dry-run` performs
one live check but never notifies. `monitor-once` is rejected until the
repository variable is enabled.

## Stop early

To stop scheduled monitoring immediately, set the repository-native control
variable to `false`:

```sh
gh variable set GOOGLE_JOB_MONITOR_ENABLED \
  --repo xsachax/job-app-automation --body false
```

The scheduled job is then skipped before checkout, GitHub issue lookup, or
target network access. No secret is involved. Setting it back to `true` within
the active UTC window resumes monitoring, so only do that after an explicit
request. Manual live modes should not be dispatched after a stop request.

Production and test notifications each use a distinct fixed label and title.
The notifier searches open and closed issues before creation, so repeated runs
cannot spam duplicates. The production issue also becomes the terminal state
that suppresses future target requests. Detection emits data; the separate
notifier consumes only the status and check time. That boundary can later be
replaced without changing fetch or detection behavior.

## Cleanup

At the end of the window, set the repository variable to `false` or delete it,
then remove the temporary workflow and this custom script directory in a normal
cleanup change. The expiry already prevents post-window target requests, but
removing the schedule avoids unnecessary no-op workflow starts.
