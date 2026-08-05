"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";
import {
  isGoogleChromeBrowser,
  syncAutofillProfile,
} from "@/lib/chromeExtension";
import type { ProfileData } from "@/lib/settings";

type Profile = ProfileData;

interface RefreshResult {
  provider: string;
  source: string;
  updatedFields: string[];
}

interface ResumeAssetStatus {
  fileName: string;
  size: number;
  source: string;
  updatedAt: string;
}

interface JudgeResult {
  scanned: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
}

interface ConnectionSummary {
  importedAt: string;
  total: number;
  distinctCompanies: number;
  topCompanies: { company: string; count: number }[];
}

interface ConnectionImportResult extends ConnectionSummary {
  imported: number;
  parsedRows: number;
  skippedNoCompany: number;
}

async function loadResumeAssetStatus(): Promise<ResumeAssetStatus | null> {
  const response = await fetch("/api/profile/resume", {
    method: "HEAD",
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not read the saved resume PDF (${response.status}).`);
  }

  const fileName = response.headers.get("x-resume-filename");
  const size = Number(response.headers.get("x-resume-size"));
  const source = response.headers.get("x-resume-source");
  const updatedAt = response.headers.get("x-resume-updated-at");
  if (!fileName || !Number.isFinite(size) || !source || !updatedAt) {
    throw new Error("The saved resume PDF metadata is incomplete.");
  }

  return {
    fileName,
    size,
    source: decodeURIComponent(source),
    updatedAt,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinCsv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function booleanChoice(value: boolean | null | undefined): string {
  return value === true ? "yes" : value === false ? "no" : "";
}

function parseBooleanChoice(value: string): boolean | null {
  return value === "yes" ? true : value === "no" ? false : null;
}

function FieldShell({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={cls.label}>{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function Chips({ items, empty }: { items: string[] | undefined; empty: string }) {
  const list = items ?? [];
  if (!list.length) return <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{empty}</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((item) => (
        <span
          key={item}
          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function CountryAutofillSection({
  title,
  locationLabel,
  locationPlaceholder,
  location,
  workAuthorized,
  requiresSponsorship,
  onLocationChange,
  onAuthorizationChange,
  onSponsorshipChange,
}: {
  title: string;
  locationLabel: string;
  locationPlaceholder: string;
  location?: string;
  workAuthorized?: boolean | null;
  requiresSponsorship?: boolean | null;
  onLocationChange: (value: string) => void;
  onAuthorizationChange: (value: boolean | null) => void;
  onSponsorshipChange: (value: boolean | null) => void;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 grid gap-4">
        <FieldShell label={locationLabel}>
          <input
            aria-label={locationLabel}
            className={cls.input}
            value={location ?? ""}
            placeholder={locationPlaceholder}
            onChange={(event) => onLocationChange(event.target.value)}
          />
        </FieldShell>
        <FieldShell label="Do you have work authorization?">
          <select
            aria-label="Do you have work authorization?"
            className={cls.input}
            value={booleanChoice(workAuthorized)}
            onChange={(event) =>
              onAuthorizationChange(parseBooleanChoice(event.target.value))
            }
          >
            <option value="">Select an answer</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FieldShell>
        <FieldShell label="Do you need visa sponsorship?">
          <select
            aria-label="Do you need visa sponsorship?"
            className={cls.input}
            value={booleanChoice(requiresSponsorship)}
            onChange={(event) =>
              onSponsorshipChange(parseBooleanChoice(event.target.value))
            }
          >
            <option value="">Select an answer</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FieldShell>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [judging, setJudging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeAsset, setResumeAsset] = useState<ResumeAssetStatus | null>(null);
  const [resumeStatusLoaded, setResumeStatusLoaded] = useState(false);
  const [resumePreviewOpen, setResumePreviewOpen] = useState(false);

  const [connSummary, setConnSummary] = useState<ConnectionSummary | null>(null);
  const [connText, setConnText] = useState("");
  const [importingConn, setImportingConn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<Profile>("/api/profile");
        if (active) setProfile(data);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    (async () => {
      try {
        const data = await api<ConnectionSummary>("/api/connections");
        if (active) setConnSummary(data);
      } catch {
        /* connections are optional; ignore load failure */
      }
    })();
    (async () => {
      try {
        const asset = await loadResumeAssetStatus();
        if (active) setResumeAsset(asset);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setResumeStatusLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function setField<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function reloadProfile(): Promise<Profile> {
    const loaded = await api<Profile>("/api/profile");
    setProfile(loaded);
    return loaded;
  }

  async function reloadResumeAssetStatus(): Promise<ResumeAssetStatus | null> {
    const asset = await loadResumeAssetStatus();
    setResumeAsset(asset);
    setResumeStatusLoaded(true);
    if (!asset) setResumePreviewOpen(false);
    return asset;
  }

  async function persistProfile(): Promise<Profile> {
    const saved = await api<Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
    await reloadResumeAssetStatus();
    return saved;
  }

  async function syncSavedProfile(saved: Profile): Promise<string> {
    if (!isGoogleChromeBrowser()) return "";
    try {
      await syncAutofillProfile(saved);
      return " Chrome autofill synced.";
    } catch {
      return " Chrome autofill was not connected; jobs sync it automatically when available.";
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistProfile();
      setProfile(saved);
      const syncMessage = await syncSavedProfile(saved);
      setMessage(`Profile saved. The judge will use these details on the next run.${syncMessage}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function refreshResume() {
    setRefreshing(true);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistProfile();
      setProfile(saved);
      const result = await api<RefreshResult>("/api/profile/refresh", {
        method: "POST",
        body: JSON.stringify({ source: saved.resumeUrl || saved.resumeSource || undefined }),
      });
      const refreshed = await reloadProfile();
      await reloadResumeAssetStatus();
      const syncMessage = await syncSavedProfile(refreshed);
      const filled = result.updatedFields.length ? ` Updated: ${result.updatedFields.join(", ")}.` : "";
      setMessage(`Resume PDF saved locally.${filled} Run the judge to re-score jobs with it.${syncMessage}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setRefreshing(false);
    }
  }

  async function runJudge() {
    setJudging(true);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistProfile();
      setProfile(saved);
      const syncMessage = await syncSavedProfile(saved);
      const result = await api<JudgeResult>("/api/judge/score", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        `Judge complete: ${result.scored} scored, ${result.preservedAgent} agent scores preserved, ${result.scanned} scanned.${syncMessage}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setJudging(false);
    }
  }

  async function importConnections(csv: string) {
    const content = csv.trim();
    if (!content) {
      setError("Paste your Connections.csv contents or choose the file first.");
      return;
    }
    setImportingConn(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<ConnectionImportResult>("/api/connections", {
        method: "POST",
        body: JSON.stringify({ csv: content }),
      });
      setConnSummary(result);
      setConnText("");
      setMessage(
        `Imported ${result.imported.toLocaleString()} connections across ${result.distinctCompanies.toLocaleString()} companies. Job cards now flag warm intros.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportingConn(false);
    }
  }

  async function clearConnections() {
    setImportingConn(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api<ConnectionSummary>("/api/connections", { method: "DELETE" });
      setConnSummary(data);
      setMessage("Cleared imported connections.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportingConn(false);
    }
  }

  async function onConnFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      await importConnections(text);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading profile…</p>;
  }

  const resumeSourceMatches =
    resumeAsset &&
    (profile.resumeUrl ?? "").trim() === resumeAsset.source.trim();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Your profile"
        subtitle="Keep résumé, application autofill, and judge signals in one local profile. Contact details are used only for autofill and never influence fit scores."
      >
        <button
          onClick={runJudge}
          disabled={saving || judging}
          className={`${cls.btnPrimary} dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400`}
        >
          {judging ? "Judging…" : "Re-run judge"}
        </button>
      </PageHeader>

      {message && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className={cls.card}>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">
              Application autofill
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Saved with your app profile. The Chrome extension syncs automatically when
              you save or open a job.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <FieldShell label="First name">
                <input
                  aria-label="First name"
                  className={cls.input}
                  value={profile.firstName ?? ""}
                  autoComplete="given-name"
                  onChange={(e) => setField("firstName", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Preferred name">
                <input
                  aria-label="Preferred name"
                  className={cls.input}
                  value={profile.preferredName ?? ""}
                  autoComplete="nickname"
                  onChange={(e) => setField("preferredName", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Last name">
                <input
                  aria-label="Last name"
                  className={cls.input}
                  value={profile.lastName ?? ""}
                  autoComplete="family-name"
                  onChange={(e) => setField("lastName", e.target.value)}
                />
              </FieldShell>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldShell label="Email">
                <input
                  aria-label="Email"
                  type="email"
                  className={cls.input}
                  value={profile.email ?? ""}
                  autoComplete="email"
                  onChange={(e) => setField("email", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Phone">
                <input
                  aria-label="Phone"
                  type="tel"
                  className={cls.input}
                  value={profile.phone ?? ""}
                  autoComplete="tel"
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </FieldShell>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <FieldShell label="LinkedIn URL">
                <input
                  aria-label="LinkedIn URL"
                  type="url"
                  className={cls.input}
                  value={profile.linkedin ?? ""}
                  onChange={(e) => setField("linkedin", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="GitHub URL">
                <input
                  aria-label="GitHub URL"
                  type="url"
                  className={cls.input}
                  value={profile.github ?? ""}
                  onChange={(e) => setField("github", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Portfolio or website URL">
                <input
                  aria-label="Portfolio or website URL"
                  type="url"
                  className={cls.input}
                  value={profile.website || profile.portfolio || ""}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      website: e.target.value,
                      portfolio: "",
                    }))
                  }
                />
              </FieldShell>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <CountryAutofillSection
                title="Jobs in the United States"
                locationLabel="US location"
                locationPlaceholder="New York, NY or Remote"
                location={profile.usLocation}
                workAuthorized={profile.usWorkAuthorized}
                requiresSponsorship={profile.usRequiresSponsorship}
                onLocationChange={(value) => setField("usLocation", value)}
                onAuthorizationChange={(value) =>
                  setField("usWorkAuthorized", value)
                }
                onSponsorshipChange={(value) =>
                  setField("usRequiresSponsorship", value)
                }
              />
              <CountryAutofillSection
                title="Jobs in Canada"
                locationLabel="Canada location"
                locationPlaceholder="Toronto, ON or Remote"
                location={profile.caLocation}
                workAuthorized={profile.caWorkAuthorized}
                requiresSponsorship={profile.caRequiresSponsorship}
                onLocationChange={(value) => setField("caLocation", value)}
                onAuthorizationChange={(value) =>
                  setField("caWorkAuthorized", value)
                }
                onSponsorshipChange={(value) =>
                  setField("caRequiresSponsorship", value)
                }
              />
            </div>

            <div className="mt-4">
              <FieldShell
                label="Default cover letter"
                hint="Optional. Review and customize it for every application."
              >
                <textarea
                  aria-label="Default cover letter"
                  className={`${cls.input} min-h-32`}
                  value={profile.coverLetterTemplate ?? ""}
                  onChange={(e) => setField("coverLetterTemplate", e.target.value)}
                />
              </FieldShell>
            </div>
          </section>

          <section className={cls.card}>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">Resume source</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Add a public GitHub PDF file or Google Drive PDF share link. The
              PDF is downloaded and stored locally for résumé uploads, while
              its parsed text remains available to the judge.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <FieldShell label="Résumé PDF link">
                <input
                  className={`${cls.input} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  type="url"
                  value={profile.resumeUrl ?? ""}
                  placeholder="https://github.com/you/resume/blob/main/resume.pdf"
                  onChange={(e) => setField("resumeUrl", e.target.value)}
                />
              </FieldShell>
              <div className="flex items-end">
                <button
                  onClick={refreshResume}
                  disabled={refreshing}
                  className={`${cls.btn} h-[38px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`}
                >
                  {refreshing ? "Saving PDF…" : "Save resume PDF"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              Only public GitHub and Google Drive PDF links are accepted.
            </p>

            {resumeStatusLoaded && (
              <div
                className={`mt-4 rounded-xl border p-4 ${
                  resumeAsset
                    ? resumeSourceMatches
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                      : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                    : "border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950"
                }`}
              >
                {resumeAsset ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          resumeSourceMatches
                            ? "text-emerald-800 dark:text-emerald-200"
                            : "text-amber-800 dark:text-amber-200"
                        }`}
                      >
                        {resumeSourceMatches ? "PDF saved" : "PDF on file"}
                      </p>
                      <p className="mt-1 truncate text-sm text-gray-800 dark:text-gray-200">
                        {resumeAsset.fileName}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {formatFileSize(resumeAsset.size)} | Saved{" "}
                        {formatSavedAt(resumeAsset.updatedAt)}
                      </p>
                      {!resumeSourceMatches && (
                        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                          This PDF is from the previously saved link. Save the new
                          link to replace it.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cls.btn}
                        onClick={() => setResumePreviewOpen((open) => !open)}
                      >
                        {resumePreviewOpen ? "Hide preview" : "Preview PDF"}
                      </button>
                      <a className={cls.btn} href="/api/profile/resume" download>
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      No PDF saved
                    </p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Add a link above and select Save resume PDF.
                    </p>
                  </div>
                )}
              </div>
            )}

            {resumeAsset && resumePreviewOpen && (
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <h3 className="text-sm font-semibold">Saved resume preview</h3>
                  <button
                    type="button"
                    className={cls.btn}
                    onClick={() => setResumePreviewOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <iframe
                  className="h-[36rem] w-full bg-white"
                  src={`/api/profile/resume?preview=1&updated=${encodeURIComponent(
                    resumeAsset.updatedAt,
                  )}`}
                  title="Saved resume PDF preview"
                />
              </div>
            )}
          </section>

          <section className={cls.card}>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">Judge signals</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Keep these concise. They become the deterministic baseline and the context exported to the Copilot agent.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldShell label="Target roles" hint="Comma-separated roles the judge should prefer.">
                <input
                  className={`${cls.input} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={joinCsv(profile.targetRoles)}
                  placeholder="Software Engineer, Full-stack Developer"
                  onChange={(e) => setField("targetRoles", splitCsv(e.target.value))}
                />
                <Chips items={profile.targetRoles} empty="No target roles yet." />
              </FieldShell>
              <FieldShell label="Skills" hint="Comma-separated technologies, tools, and domains.">
                <input
                  className={`${cls.input} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={joinCsv(profile.skills)}
                  placeholder="TypeScript, React, Python, SQL"
                  onChange={(e) => setField("skills", splitCsv(e.target.value))}
                />
                <Chips items={profile.skills} empty="No skills yet." />
              </FieldShell>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldShell label="Short summary">
                <textarea
                  className={`${cls.input} min-h-28 placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={profile.summary ?? ""}
                  placeholder="Entry-level software engineer focused on product engineering and reliable systems."
                  onChange={(e) => setField("summary", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Qualifications" hint="Degree, graduation date, internships, projects, authorization, or location constraints.">
                <textarea
                  className={`${cls.input} min-h-28 placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={profile.qualifications ?? ""}
                  placeholder="B.S. Computer Science, May 2026. Built ..."
                  onChange={(e) => setField("qualifications", e.target.value)}
                />
              </FieldShell>
            </div>
          </section>

          <section className={cls.card}>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">
                  LinkedIn connections
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  Import your connections so job cards flag companies where you already know
                  someone — a warm intro is the fastest way past the resume pile.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                🤝 Warm intros
              </span>
            </div>

            {connSummary && connSummary.total > 0 ? (
              <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/30">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    <span className="text-lg font-semibold text-teal-800 dark:text-teal-200">
                      {connSummary.total.toLocaleString()}
                    </span>{" "}
                    connections
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    <span className="text-lg font-semibold text-teal-800 dark:text-teal-200">
                      {connSummary.distinctCompanies.toLocaleString()}
                    </span>{" "}
                    companies
                  </span>
                  {connSummary.importedAt && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Imported {new Date(connSummary.importedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {connSummary.topCompanies.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {connSummary.topCompanies.map((c) => (
                      <span
                        key={c.company}
                        className="rounded-full border border-teal-200 bg-white px-2 py-0.5 text-xs font-medium text-teal-800 dark:border-teal-800 dark:bg-gray-900 dark:text-teal-200"
                      >
                        {c.company} · {c.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                No connections imported yet.
              </p>
            )}

            <ol className="mt-4 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <li>
                1. On LinkedIn, go to <span className="font-medium">Settings → Data privacy → Get a copy of your data</span>.
              </li>
              <li>
                2. Pick <span className="font-medium">Connections</span>, request the archive, then download <span className="font-medium">Connections.csv</span> from the email or page.
              </li>
              <li>3. Upload the file below (or paste its contents). It is parsed locally and never leaves this machine.</li>
            </ol>

            <div className="mt-4 grid gap-3">
              <FieldShell label="Upload Connections.csv">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={importingConn}
                  onChange={(e) => void onConnFile(e.target.files?.[0])}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-teal-700 disabled:opacity-50 dark:text-gray-300"
                />
              </FieldShell>
              <FieldShell label="…or paste the CSV contents" hint="Handy when the download opens in your browser.">
                <textarea
                  className={`${cls.input} min-h-28 font-mono text-xs placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={connText}
                  placeholder={'First Name,Last Name,URL,Email Address,Company,Position,Connected On'}
                  onChange={(e) => setConnText(e.target.value)}
                />
              </FieldShell>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void importConnections(connText)}
                  disabled={importingConn || !connText.trim()}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                >
                  {importingConn ? "Importing…" : "Import pasted CSV"}
                </button>
                {connSummary && connSummary.total > 0 && (
                  <button
                    onClick={() => void clearConnections()}
                    disabled={importingConn}
                    className={`${cls.btnDanger} py-2`}
                  >
                    Clear connections
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={cls.card}>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">Next step</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Save first, then run the judge. Deterministic scores fill every eligible discovery job without overwriting agent-reviewed fits.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className={`${cls.btnPrimary} dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400`}
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <button
                onClick={runJudge}
                disabled={saving || judging}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-200 dark:hover:bg-indigo-950"
              >
                {judging ? "Running judge…" : "Save and re-run judge"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-950">
            <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">What the judge reads</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>• target roles for title alignment</li>
              <li>• skills for exact posting overlap</li>
              <li>• summary, qualifications, and resume text for broader context</li>
              <li>• date posted for the freshness boost</li>
              <li>• agent review exports for the strongest deterministic matches</li>
            </ul>
            <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              It never reads your name, contact details, or demographic / EEO answers — those
              never influence a fit score.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
