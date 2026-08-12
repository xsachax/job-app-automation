"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { DiscoveryConfigData } from "@/lib/discovery/config";
import {
  DEFAULT_DISCOVERY_CONFIG,
  DEFAULT_YC_CONFIG,
} from "@/lib/discovery/config";
import { formatDiscoveryScope } from "@/lib/discovery/scope-copy";
import { GOLDEN_JOB_SCORE_FLOOR } from "@/lib/jobs/golden";
import type { Criteria } from "@/lib/matching/score";
import type { ProfileData } from "@/lib/settings";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";

interface ConfigResponse {
  config: DiscoveryConfigData;
  sources: string[];
}

interface ScopeContext {
  criteria: Criteria;
  profile: Pick<ProfileData, "targetRoles">;
}

type ExternalJudgeProvider = "openai" | "anthropic";

interface JudgeProviderSummary {
  model: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
}

interface JudgeProviderSettings extends JudgeProviderSummary {
  provider: ExternalJudgeProvider;
  providers: Record<ExternalJudgeProvider, JudgeProviderSummary>;
  copilotConnected: boolean;
  copilotHasPriority: boolean;
  effectiveProvider: "deterministic" | "copilot" | ExternalJudgeProvider;
  enhancedAvailable: boolean;
  status: string;
}

const helper = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const fieldShell = "rounded-lg border border-gray-200 p-4 dark:border-gray-800";
const checkbox =
  "mt-0.5 h-4 w-4 rounded border-gray-300 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-gray-700 dark:accent-indigo-400 dark:focus-visible:outline-indigo-400";

function parseList(value: string): string[] {
  return value
    .split(/[,\n]/)
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
  const [goldenTitleKeywordsText, setGoldenTitleKeywordsText] = useState("");
  const [goldenDescriptionKeywordsText, setGoldenDescriptionKeywordsText] =
    useState("");
  const [scopeContext, setScopeContext] = useState<ScopeContext | null>(null);
  const [judgeProvider, setJudgeProvider] =
    useState<JudgeProviderSettings | null>(null);
  const [providerChoice, setProviderChoice] =
    useState<ExternalJudgeProvider>("openai");
  const [judgeModel, setJudgeModel] = useState("");
  const [judgeApiKey, setJudgeApiKey] = useState("");
  const [savingJudgeProvider, setSavingJudgeProvider] = useState(false);

  function applyJudgeProviderSettings(settings: JudgeProviderSettings) {
    setJudgeProvider(settings);
    setProviderChoice(settings.provider);
    setJudgeModel(settings.model);
    setJudgeApiKey("");
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [data, criteria, profile, providerSettings] = await Promise.all([
          api<ConfigResponse>("/api/config"),
          api<Criteria>("/api/criteria"),
          api<ProfileData>("/api/profile"),
          api<JudgeProviderSettings>("/api/settings/judge-provider"),
        ]);
        if (!active) return;
        setConfig(data.config);
        setSources(data.sources);
        setRoleKeywordsText(listText(data.config.roleKeywords));
        setExcludeTitleKeywordsText(listText(data.config.excludeTitleKeywords));
        setQueryTermsText(listText(data.config.queryTerms));
        setGoldenTitleKeywordsText(
          listText(data.config.goldenJobs.titleKeywords),
        );
        setGoldenDescriptionKeywordsText(
          listText(data.config.goldenJobs.descriptionKeywords),
        );
        setScopeContext({
          criteria,
          profile: { targetRoles: profile.targetRoles },
        });
        applyJudgeProviderSettings(providerSettings);
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
      const [data, criteria, profile, providerSettings] = await Promise.all([
        api<ConfigResponse>("/api/config"),
        api<Criteria>("/api/criteria"),
        api<ProfileData>("/api/profile"),
        api<JudgeProviderSettings>("/api/settings/judge-provider"),
      ]);
      setConfig(data.config);
      setSources(data.sources);
      setRoleKeywordsText(listText(data.config.roleKeywords));
      setExcludeTitleKeywordsText(listText(data.config.excludeTitleKeywords));
      setQueryTermsText(listText(data.config.queryTerms));
      setGoldenTitleKeywordsText(
        listText(data.config.goldenJobs.titleKeywords),
      );
      setGoldenDescriptionKeywordsText(
        listText(data.config.goldenJobs.descriptionKeywords),
      );
      setScopeContext({
        criteria,
        profile: { targetRoles: profile.targetRoles },
      });
      applyJudgeProviderSettings(providerSettings);
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

  function updateGoldenJobs(
    patch: Partial<DiscoveryConfigData["goldenJobs"]>,
  ) {
    setConfig((current) =>
      current
        ? {
            ...current,
            goldenJobs: { ...current.goldenJobs, ...patch },
          }
        : current,
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

  async function saveConfig(
    payload: Partial<DiscoveryConfigData>,
  ): Promise<DiscoveryConfigData | null> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      return await api<DiscoveryConfigData>("/api/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function persist(payload: DiscoveryConfigData, successMessage: string) {
    const saved = await saveConfig(payload);
    if (!saved) return;
    setConfig(saved);
    setRoleKeywordsText(listText(saved.roleKeywords));
    setExcludeTitleKeywordsText(listText(saved.excludeTitleKeywords));
    setQueryTermsText(listText(saved.queryTerms));
    setGoldenTitleKeywordsText(listText(saved.goldenJobs.titleKeywords));
    setGoldenDescriptionKeywordsText(
      listText(saved.goldenJobs.descriptionKeywords),
    );
    setMessage(successMessage);
  }

  function goldenJobsDraft(config: DiscoveryConfigData) {
    return {
      ...config.goldenJobs,
      titleKeywords: parseList(goldenTitleKeywordsText),
      descriptionKeywords: parseList(goldenDescriptionKeywordsText),
    };
  }

  async function saveGoldenJobs() {
    if (!config) return;
    const saved = await saveConfig({ goldenJobs: goldenJobsDraft(config) });
    if (!saved) return;
    setConfig((current) =>
      current ? { ...current, goldenJobs: saved.goldenJobs } : saved,
    );
    setGoldenTitleKeywordsText(listText(saved.goldenJobs.titleKeywords));
    setGoldenDescriptionKeywordsText(
      listText(saved.goldenJobs.descriptionKeywords),
    );
    setMessage(
      "Golden job settings saved. Filtering updates immediately; rerun Judge to refresh scores.",
    );
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
        goldenJobs: goldenJobsDraft(config),
      },
      "Settings saved. Golden filtering updates immediately; rerun Judge to refresh scores.",
    );
  }

  async function resetDefaults() {
    await persist(
      DEFAULT_DISCOVERY_CONFIG,
      "Settings reset. Golden filtering updates immediately; rerun Judge to refresh scores.",
    );
  }

  function selectJudgeProvider(provider: ExternalJudgeProvider) {
    setProviderChoice(provider);
    setJudgeModel(
      judgeProvider?.providers[provider].model ??
        (provider === "openai"
          ? "gpt-4o-mini"
          : "claude-3-5-haiku-latest"),
    );
    setJudgeApiKey("");
    setError(null);
    setMessage(null);
  }

  async function saveJudgeProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingJudgeProvider(true);
    setError(null);
    setMessage(null);
    try {
      const payload: {
        provider: ExternalJudgeProvider;
        model: string | null;
        apiKey?: string;
      } = {
        provider: providerChoice,
        model: judgeModel.trim() || null,
      };
      if (judgeApiKey) payload.apiKey = judgeApiKey;
      const saved = await api<JudgeProviderSettings>(
        "/api/settings/judge-provider",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      applyJudgeProviderSettings(saved);
      setMessage(
        `${providerChoice === "openai" ? "OpenAI" : "Anthropic"} AI provider settings saved.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingJudgeProvider(false);
    }
  }

  async function clearJudgeProviderKey() {
    setSavingJudgeProvider(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api<JudgeProviderSettings>(
        "/api/settings/judge-provider",
        {
          method: "PUT",
          body: JSON.stringify({
            provider: providerChoice,
            model: judgeModel.trim() || null,
            apiKey: null,
          }),
        },
      );
      applyJudgeProviderSettings(saved);
      setMessage(
        `${providerChoice === "openai" ? "OpenAI" : "Anthropic"} API key cleared.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingJudgeProvider(false);
    }
  }

  const countryOptions = uniqueSorted(["US", "CA", ...(config?.countries ?? [])]);
  const disabledCount = config?.disabledSources.length ?? 0;
  const scopeCopy =
    config && scopeContext
      ? formatDiscoveryScope({
          config: {
            ...config,
            roleKeywords: parseList(roleKeywordsText),
            queryTerms: parseList(queryTermsText),
          },
          ...scopeContext,
        })
      : null;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure discovery and the server-side AI provider used by Judge and optional assisted autofill."
      />

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && judgeProvider && (
        <form
          onSubmit={saveJudgeProvider}
          className={cls.card + " mb-6 space-y-5"}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                AI provider: Judge + assisted autofill
              </h2>
              <p className={helper}>
                API keys are stored only in the server&apos;s local SQLite
                database. They can power enhanced Judge scoring and the
                extension&apos;s optional assisted-fill pass, and are never
                returned to this page after saving.
              </p>
            </div>
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (judgeProvider.copilotConnected
                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")
              }
            >
              {judgeProvider.copilotConnected
                ? "Copilot Judge connected: priority"
                : "Copilot Judge not marked connected"}
            </span>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
            <p>
              <strong>Judge:</strong> {judgeProvider.status}
            </p>
            <p className="mt-2">
              <strong>Assisted autofill:</strong> Uses the selected provider key
              first. If the key is missing or its request fails, the server tries
              the locally authenticated Copilot CLI.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="judge-provider" className={cls.label}>
                External AI provider
              </label>
              <select
                id="judge-provider"
                className={cls.input + " mt-2"}
                value={providerChoice}
                onChange={(event) =>
                  selectJudgeProvider(
                    event.target.value as ExternalJudgeProvider,
                  )
                }
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <p className={helper}>
                Judge uses this when <code>COPILOT_JUDGE_CONNECTED</code> is not{" "}
                <code>1</code>. Assisted autofill tries this provider before
                Copilot.
              </p>
            </div>

            <div>
              <label htmlFor="judge-model" className={cls.label}>
                Model
              </label>
              <input
                id="judge-model"
                className={cls.input + " mt-2"}
                value={judgeModel}
                maxLength={100}
                onChange={(event) => setJudgeModel(event.target.value)}
                autoComplete="off"
              />
              <p className={helper}>
                Optional. Clear it to restore the provider default.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="judge-api-key" className={cls.label}>
              {providerChoice === "openai" ? "OpenAI" : "Anthropic"} API key
            </label>
            <input
              id="judge-api-key"
              type="password"
              className={cls.input + " mt-2"}
              value={judgeApiKey}
              maxLength={512}
              autoComplete="new-password"
              placeholder={
                judgeProvider.providers[providerChoice].hasApiKey
                  ? `${judgeProvider.providers[providerChoice].apiKeyHint} configured; leave blank to keep`
                  : "Enter a server-side API key"
              }
              onChange={(event) => setJudgeApiKey(event.target.value)}
            />
            <p className={helper}>
              {judgeProvider.providers[providerChoice].hasApiKey
                ? `A key ending in ${judgeProvider.providers[providerChoice].apiKeyHint?.slice(-4)} is configured.`
                : "No key is configured for this provider."}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={cls.btn}
              disabled={
                savingJudgeProvider ||
                !judgeProvider.providers[providerChoice].hasApiKey
              }
              onClick={clearJudgeProviderKey}
            >
              Clear API key
            </button>
            <button
              type="submit"
              className={cls.btnPrimary}
              disabled={savingJudgeProvider}
            >
              {savingJudgeProvider ? "Saving..." : "Save AI provider"}
            </button>
          </div>
        </form>
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
                  These filters decide which roles and locations survive the next scrape.
                </p>
                {scopeCopy && (
                  <p className="mt-3 max-w-3xl text-sm text-gray-700 dark:text-gray-300">
                    <strong>Current draft:</strong> {scopeCopy.summary}
                  </p>
                )}
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
                  Roles requiring more experience than this are excluded from future discovery results.
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
                        Keeps internship-style postings alongside other in-scope roles.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className={cls.card} data-testid="golden-job-settings">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Golden jobs</h2>
                <p className={helper}>
                  Promote precise early-career matches above the normal queue
                  order. After Judge runs, every match receives a final score of
                  at least {GOLDEN_JOB_SCORE_FLOOR}.
                </p>
              </div>
              <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
                {GOLDEN_JOB_SCORE_FLOOR}+ after Judge
              </span>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 transition-colors hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 dark:hover:bg-blue-950/35">
              <input
                type="checkbox"
                className={checkbox}
                checked={config.goldenJobs.enabled}
                onChange={(event) =>
                  updateGoldenJobs({ enabled: event.target.checked })
                }
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Enable golden-job matching
                </span>
                <span className="mt-1 block text-xs text-gray-600 dark:text-gray-300">
                  Controls the Golden filter, queue promotion, API flag, and
                  Judge score floor from this single saved configuration.
                </span>
              </span>
            </label>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <label htmlFor="goldenTitleKeywords" className={cls.label}>
                  Golden title keywords
                </label>
                <p className={helper}>
                  Comma- or line-separated exact phrases matched against
                  normalized job titles. Punctuation and case are ignored.
                </p>
                <textarea
                  id="goldenTitleKeywords"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={goldenTitleKeywordsText}
                  onChange={(event) => {
                    setGoldenTitleKeywordsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="new grad, new graduate, graduate, 2027"
                />
              </div>

              <div>
                <label
                  htmlFor="goldenDescriptionKeywords"
                  className={cls.label}
                >
                  Golden description phrases
                </label>
                <p className={helper}>
                  Use precise early-career phrases only. Defaults deliberately
                  avoid ordinary requirements such as undergraduate degree.
                </p>
                <textarea
                  id="goldenDescriptionKeywords"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={goldenDescriptionKeywordsText}
                  onChange={(event) => {
                    setGoldenDescriptionKeywordsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="new grad, class of 2027, graduating in 2027"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-blue-200 pt-4 dark:border-blue-900">
              <p className={helper + " mt-0"}>
                Save Golden changes here without changing other settings drafts.
              </p>
              <button
                type="button"
                className={cls.btnPrimary}
                disabled={saving}
                onClick={saveGoldenJobs}
              >
                {saving ? "Saving..." : "Save Golden jobs"}
              </button>
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
                  Comma-separated extra role keywords that broaden what counts as in-scope.
                </p>
                <textarea
                  id="roleKeywords"
                  className={cls.input + " mt-2 min-h-28 resize-y"}
                  value={roleKeywordsText}
                  onChange={(event) => {
                    setRoleKeywordsText(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="account executive, data scientist, security"
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
                  placeholder="account executive, data scientist, platform engineer"
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
              Discovery scope changes apply on the next run. Golden matching
              updates immediately; rerun Judge after changes to refresh score
              floors.
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
