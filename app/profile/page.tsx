"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";

interface Profile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  portfolio?: string;
  summary?: string;
  skills?: string[];
  resumeUrl?: string;
  resumeText?: string;
  targetRoles?: string[];
  qualifications?: string;
  resumeSource?: string;
  resumePath?: string;
  coverLetterTemplate?: string;
  [key: string]: unknown;
}

interface RefreshResult {
  provider: string;
  source: string;
  updatedFields: string[];
  resumeScored?: number;
  jobFitScored?: number;
}

interface JudgeResult {
  scanned: number;
  scored: number;
  preservedAgent: number;
  skipped: number;
}

const CONTACT_FIELDS: { name: keyof Profile; label: string; placeholder?: string; type?: string }[] = [
  { name: "firstName", label: "First name", placeholder: "Sacha" },
  { name: "lastName", label: "Last name", placeholder: "Lee" },
  { name: "email", label: "Email", placeholder: "you@example.com", type: "email" },
  { name: "phone", label: "Phone", placeholder: "+1 555 0100", type: "tel" },
  { name: "location", label: "Location", placeholder: "City, country" },
  { name: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
  { name: "github", label: "GitHub", placeholder: "https://github.com/..." },
  { name: "portfolio", label: "Portfolio", placeholder: "https://..." },
];

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinCsv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [judging, setJudging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      active = false;
    };
  }, []);

  const resumeTextCount = useMemo(() => (profile.resumeText ?? "").trim().length, [profile.resumeText]);

  function setField<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function reloadProfile() {
    setProfile(await api<Profile>("/api/profile"));
  }

  async function persistProfile(): Promise<Profile> {
    return api<Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await persistProfile();
      setProfile(saved);
      setMessage("Profile saved. The judge will use these details on the next run.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function refreshResume() {
    setRefreshing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<RefreshResult>("/api/profile/refresh", {
        method: "POST",
        body: JSON.stringify({ source: profile.resumeUrl || profile.resumeSource || undefined }),
      });
      await reloadProfile();
      const filled = result.updatedFields.length ? ` Updated: ${result.updatedFields.join(", ")}.` : "";
      const scored = result.jobFitScored ?? result.resumeScored ?? 0;
      setMessage(`Resume refreshed via ${result.provider}.${filled} Re-scored ${scored} jobs.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
      const result = await api<JudgeResult>("/api/judge/score", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        `Judge complete: ${result.scored} scored, ${result.preservedAgent} agent scores preserved, ${result.scanned} scanned.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setJudging(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Loading profile…</p>;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import your info"
        subtitle="Add the resume and qualification signals the post-scrape judge should use to rank discovered roles."
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">Contact details</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  These fields identify you in exports and keep the resume parser from guessing.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Saved locally
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {CONTACT_FIELDS.map((field) => (
                <FieldShell key={String(field.name)} label={field.label}>
                  <input
                    className={`${cls.input} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                    type={field.type ?? "text"}
                    value={(profile[field.name] as string) ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setField(field.name, e.target.value as never)}
                  />
                </FieldShell>
              ))}
            </div>
          </section>

          <section className={cls.card}>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">Resume source</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Paste a direct PDF link when you have one. If parsing is unavailable, paste the resume text below and the judge will use that instead.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <FieldShell label="Resume PDF URL" hint="Use a stable sharing URL that the server can fetch.">
                <input
                  className={`${cls.input} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={profile.resumeUrl ?? ""}
                  placeholder="https://example.com/resume.pdf"
                  onChange={(e) => setField("resumeUrl", e.target.value)}
                />
              </FieldShell>
              <div className="flex items-end">
                <button
                  onClick={refreshResume}
                  disabled={refreshing}
                  className={`${cls.btn} h-10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`}
                >
                  {refreshing ? "Refreshing…" : "Fetch text"}
                </button>
              </div>
            </div>
            <div className="mt-4">
              <FieldShell label="Pasted or parsed resume text" hint={`${resumeTextCount.toLocaleString()} characters available to the judge.`}>
                <textarea
                  className={`${cls.input} min-h-48 placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                  value={profile.resumeText ?? ""}
                  placeholder="Paste plain text from your resume if the PDF URL cannot be parsed."
                  onChange={(e) => setField("resumeText", e.target.value)}
                />
              </FieldShell>
            </div>
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
              <li>• agent review exports for the strongest deterministic matches</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
