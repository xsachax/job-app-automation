"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { DiscoveryConfigData } from "@/lib/discovery/config";
import { DEFAULT_YC_CONFIG } from "@/lib/discovery/config";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";

interface ConfigResponse {
  config: DiscoveryConfigData;
  sources: string[];
}

const DEFAULT_CONFIG: DiscoveryConfigData = {
  countries: ["US", "CA"],
  maxYoE: 2,
  excludeAdvancedDegree: true,
  includeInternships: false,
  roleKeywords: [],
  excludeTitleKeywords: [],
  queryTerms: [],
  disabledSources: [],
  yc: DEFAULT_YC_CONFIG,
};

const helper = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const fieldShell = "rounded-lg border border-gray-200 p-4 dark:border-gray-800";
const checkbox =
  "mt-0.5 h-4 w-4 rounded border-gray-300 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-gray-700 dark:accent-indigo-400 dark:focus-visible:outline-indigo-400";

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(values: string[]): string {
  return values.join(", ");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function normalizeCountry(value: string): string {
  return value.trim().toUpperCase();
}

export default function SettingsPage() {
  const [config, setConfig] = useState<DiscoveryConfigData | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newCountry, setNewCountry] = useState("");
  const [roleKeywordsText, setRoleKeywordsText] = useState("");
  const [excludeTitleKeywordsText, setExcludeTitleKeywordsText] = useState("");
  const [queryTermsText, setQueryTermsText] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<ConfigResponse>("/api/config");
        if (!active) return;
        setConfig(data.config);
        setSources(data.sources);
        setRoleKeywordsText(listText(data.config.roleKeywords));
        setExcludeTitleKeywordsText(listText(data.config.excludeTitleKeywords));
        setQueryTermsText(listText(data.config.queryTerms));
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function reloadConfig() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api<ConfigResponse>("/api/config");
      setConfig(data.config);
      setSources(data.sources);
      setRoleKeywordsText(listText(data.config.roleKeywords));
      setExcludeTitleKeywordsText(listText(data.config.excludeTitleKeywords));
      setQueryTermsText(listText(data.config.queryTerms));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(patch: Partial<DiscoveryConfigData>) {
    setConfig((current) => (current ? { ...current, ...patch } : current));
    setError(null);
    setMessage(null);
  }

  function updateYc(patch: Partial<DiscoveryConfigData["yc"]>) {
    setConfig((current) =>
      current ? { ...current, yc: { ...(current.yc ?? DEFAULT_YC_CONFIG), ...patch } } : current,
    );
    setError(null);
    setMessage(null);
  }

  function toggleCountry(country: string) {
    if (!config) return;
    const next = config.countries.includes(country)
      ? config.countries.filter((item) => item !== country)
      : [...config.countries, country];
    updateConfig({ countries: uniqueSorted(next) });
  }

  function addCountry() {
    const country = normalizeCountry(newCountry);
    if (!country || !config) return;
    updateConfig({ countries: uniqueSorted([...config.countries, country]) });
    setNewCountry("");
  }

  function toggleSource(source: string) {
    if (!config) return;
    const next = config.disabledSources.includes(source)
      ? config.disabledSources.filter((item) => item !== source)
      : [...config.disabledSources, source];
    updateConfig({ disabledSources: uniqueSorted(next) });
  }

  async function persist(payload: DiscoveryConfigData, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api<DiscoveryConfigData>("/api/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setConfig(saved);
      setRoleKeywordsText(listText(saved.roleKeywords));
      setExcludeTitleKeywordsText(listText(saved.excludeTitleKeywords));
      setQueryTermsText(listText(saved.queryTerms));
      setMessage(successMessage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    await persist(
      {
        ...config,
        roleKeywords: parseList(roleKeywordsText),
        excludeTitleKeywords: parseList(excludeTitleKeywordsText),
        queryTerms: parseList(queryTermsText),
      },
      "Discovery settings saved.",
    );
  }

  async function resetDefaults() {
    await persist(DEFAULT_CONFIG, "Discovery settings reset to defaults.");
  }

  const countryOptions = uniqueSorted(["US", "CA", ...(config?.countries ?? [])]);
  const disabledCount = config?.disabledSources.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Edit the stored discovery configuration that drives the next scrape."
      />

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {message} Changes take effect on the next <code>npm run discover</code> run.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className={cls.card}>
          <p className={cls.muted + " text-sm"}>Loading discovery settings…</p>
        </div>
      ) : !config ? (
        <div className={cls.card}>
          <h2 className="text-lg font-semibold">Settings unavailable</h2>
          <p className={helper}>The discovery configuration could not be loaded.</p>
          <button type="button" onClick={reloadConfig} className={cls.btn + " mt-4"}>
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={saveSettings} className="space-y-6">
          <section className={cls.card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Discovery scope</h2>
                <p className={helper}>
                  These filters decide which locations and seniority levels survive the next scrape.
                </p>
              </div>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
                Next run only
              </span>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <fieldset className={fieldShell}>
                <legend className="text-sm font-medium">Countries</legend>
                <p className={helper}>
                  Keep postings classified into these country buckets. US and CA are ready-made;
                  add other country codes if your scraper sources cover them.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {countryOptions.map((country) => {
                    const checked = config.countries.includes(country);
                    return (
                      <label
                        key={country}
                        className={
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                          (checked
                            ? "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/70")
                        }
                      >
                        <input
                          type="checkbox"
                          className={checkbox}
                          checked={checked}
                          onChange={() => toggleCountry(country)}
                        />
                        {country}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    className={cls.input}
                    value={newCountry}
                    onChange={(event) => setNewCountry(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCountry();
                      }
                    }}
                    placeholder="Add country code, e.g. GB"
                    aria-label="Add country code"
                  />
                  <button type="button" onClick={addCountry} className={cls.btn}>
                    Add
                  </button>
                </div>
              </fieldset>

              <div className={fieldShell}>
                <label htmlFor="maxYoE" className={cls.label}>
                  Maximum required years of experience
                </label>
                <p className={helper}>
                  Roles requiring more experience than this are excluded from future entry-level lists.
                </p>
                <input
                  id="maxYoE"
                  type="number"
                  min={0}
                  max={40}
                  className={cls.input + " mt-3 max-w-32"}
                  value={config.maxYoE}
                  onChange={(event) => updateConfig({ maxYoE: Number(event.target.value) })}
                />

                <div className="mt-5 space-y-3">
                  <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/70">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={config.excludeAdvancedDegree}
                      onChange={(event) =>
                        updateConfig({ excludeAdvancedDegree: event.target.checked })
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                        Exclude advanced-degree requirements
                      </span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        Drops jobs that clearly require a Master&apos;s or PhD during classification.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/70">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={config.includeInternships}
                      onChange={(event) => updateConfig({ includeInternships: event.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include internships and co-ops
                      </span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        Keeps internship-style postings alongside new-grad and full-time roles.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className={cls.card}>
            <h2 className="text-lg font-semibold">Keyword tuning</h2>
            <p className={helper}>
              Adjust how broad each future scrape should be before classification and title filtering.
            </p>
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <div>
                <label htmlFor="roleKeywords" className={cls.label}>
                  Role keywords
                </label>
                <p className={helper}>
                  Comma-separated extra role keywords that broaden what counts as in-scope beyond the
                  built-in software vocabulary.
                </p>
                <textarea
                  id="roleKeywords"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={roleKeywordsText}
                  onChange={(event) => {
                    setRoleKeywordsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="security, data scientist, machine learning"
                />
              </div>

              <div>
                <label htmlFor="excludeTitleKeywords" className={cls.label}>
                  Excluded title keywords
                </label>
                <p className={helper}>
                  Comma-separated title terms to reject after scraping, useful for removing senior,
                  sales, or non-engineering roles.
                </p>
                <textarea
                  id="excludeTitleKeywords"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={excludeTitleKeywordsText}
                  onChange={(event) => {
                    setExcludeTitleKeywordsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="principal, staff, manager"
                />
              </div>

              <div>
                <label htmlFor="queryTerms" className={cls.label}>
                  Scraper query terms
                </label>
                <p className={helper}>
                  Comma-separated search terms handed to each scraper. Leave empty to use each
                  source&apos;s default query set.
                </p>
                <textarea
                  id="queryTerms"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={queryTermsText}
                  onChange={(event) => {
                    setQueryTermsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="software engineer, backend, platform"
                />
              </div>
            </div>
          </section>

          <section className={cls.card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Y Combinator expansion</h2>
                <p className={helper}>
                  The <strong>Y Combinator</strong> source pulls the live directory of hiring YC
                  companies, keeps the recent + established ones, resolves each company&apos;s public
                  ATS (Greenhouse / Lever / Ashby) and merges their roles into your lists. Disable it
                  under Disabled sources below. Resolved boards are cached, so only the first run pays
                  the crawl cost.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {(config.yc ?? DEFAULT_YC_CONFIG).yearsBack}y window
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  {
                    key: "yearsBack",
                    label: "Batch window (years)",
                    hint: "Only companies from a YC batch within this many years qualify.",
                    min: 1,
                    max: 30,
                  },
                  {
                    key: "minTeamSize",
                    label: "Minimum team size",
                    hint: "A coarse traction / success signal. Smaller teams are skipped.",
                    min: 0,
                    max: 100000,
                  },
                  {
                    key: "maxTeamSize",
                    label: "Maximum team size",
                    hint: "Keeps the list startup-shaped. 0 means no ceiling.",
                    min: 0,
                    max: 1000000,
                  },
                  {
                    key: "maxCompanies",
                    label: "Max companies / run",
                    hint: "Caps how many companies are ATS-resolved per run.",
                    min: 1,
                    max: 6000,
                  },
                  {
                    key: "concurrency",
                    label: "Resolver concurrency",
                    hint: "Parallel website lookups while resolving ATS backends.",
                    min: 1,
                    max: 32,
                  },
                ] as const
              ).map((f) => (
                <div key={f.key} className={fieldShell}>
                  <label htmlFor={`yc-${f.key}`} className={cls.label}>
                    {f.label}
                  </label>
                  <p className={helper}>{f.hint}</p>
                  <input
                    id={`yc-${f.key}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    className={cls.input + " mt-3 max-w-36"}
                    value={(config.yc ?? DEFAULT_YC_CONFIG)[f.key]}
                    onChange={(event) => updateYc({ [f.key]: Number(event.target.value) })}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className={cls.card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Disabled sources</h2>
                <p className={helper}>
                  Skip selected company or board sources on the next discovery run without removing them
                  from the scraper catalog.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {disabledCount} disabled
              </span>
            </div>

            {sources.length === 0 ? (
              <p className={helper}>No scrapable sources were returned by the config API.</p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map((source) => {
                  const checked = config.disabledSources.includes(source);
                  return (
                    <label
                      key={source}
                      className={
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors " +
                        (checked
                          ? "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/70")
                      }
                    >
                      <input
                        type="checkbox"
                        className={checkbox}
                        checked={checked}
                        onChange={() => toggleSource(source)}
                      />
                      <span className="truncate" title={source}>
                        {source}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Changes are stored now and used by the next <code>npm run discover</code> run.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetDefaults} disabled={saving} className={cls.btn}>
                Reset to defaults
              </button>
              <button type="submit" disabled={saving} className={cls.btnPrimary}>
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
