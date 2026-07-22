"use client";

import { useEffect, useState } from "react";
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
  workAuthorized?: boolean;
  requiresSponsorship?: boolean;
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  resumeSource?: string;
  resumePath?: string;
  coverLetterTemplate?: string;
  [key: string]: unknown;
}

interface RefreshResult {
  provider: string;
  source: string;
  updatedFields: string[];
}

const TEXT_FIELDS: { name: keyof Profile; label: string; placeholder?: string }[] = [
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "location", label: "Location", placeholder: "City, Country" },
  { name: "linkedin", label: "LinkedIn URL" },
  { name: "github", label: "GitHub URL" },
  { name: "website", label: "Website" },
  { name: "portfolio", label: "Portfolio URL" },
];

const EEO_FIELDS: { name: keyof Profile; label: string }[] = [
  { name: "gender", label: "Gender" },
  { name: "raceEthnicity", label: "Race / ethnicity" },
  { name: "veteranStatus", label: "Veteran status" },
  { name: "disabilityStatus", label: "Disability status" },
];

function triToStr(v: boolean | undefined): string {
  return v === true ? "yes" : v === false ? "no" : "";
}
function strToTri(s: string): boolean | undefined {
  return s === "yes" ? true : s === "no" ? false : undefined;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setProfile(await api<Profile>("/api/profile"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

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

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const saved = await api<Profile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setProfile(saved);
      setMsg("Profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api<RefreshResult>("/api/profile/refresh", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setMsg(
        r.updatedFields.length
          ? `Refreshed via ${r.provider}. Filled: ${r.updatedFields.join(", ")}.`
          : `Refreshed via ${r.provider}. No blank fields to fill.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Canonical answers used to pre-fill applications. Refresh pulls your latest resume."
      >
        <button onClick={refresh} disabled={refreshing} className={cls.btnPrimary}>
          {refreshing ? "Refreshing…" : "Refresh profile"}
        </button>
      </PageHeader>

      {msg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {msg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <section className={cls.card}>
          <h2 className="mb-4 text-lg font-semibold">Personal & links</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <div key={String(f.name)}>
                <label className={cls.label}>{f.label}</label>
                <input
                  className={cls.input + " mt-1"}
                  value={(profile[f.name] as string) ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value as never)}
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <label className={cls.label}>Skills (comma-separated)</label>
            <input
              className={cls.input + " mt-1"}
              value={(profile.skills ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "skills",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div className="mt-4">
            <label className={cls.label}>Summary</label>
            <textarea
              className={cls.input + " mt-1 min-h-24"}
              value={profile.summary ?? ""}
              onChange={(e) => set("summary", e.target.value)}
            />
          </div>
        </section>

        <section className={cls.card}>
          <h2 className="mb-4 text-lg font-semibold">Resume</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={cls.label}>Resume source (path or URL)</label>
              <input
                className={cls.input + " mt-1"}
                value={profile.resumeSource ?? ""}
                placeholder="/Users/you/resume.txt or https://…"
                onChange={(e) => set("resumeSource", e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">Refresh reads this to update fields.</p>
            </div>
            <div>
              <label className={cls.label}>Resume file to attach</label>
              <input
                className={cls.input + " mt-1"}
                value={profile.resumePath ?? ""}
                placeholder="/Users/you/resume.pdf"
                onChange={(e) => set("resumePath", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className={cls.label}>Cover letter template</label>
            <textarea
              className={cls.input + " mt-1 min-h-24"}
              value={profile.coverLetterTemplate ?? ""}
              placeholder="Dear {company} team, …"
              onChange={(e) => set("coverLetterTemplate", e.target.value)}
            />
          </div>
        </section>

        <section className={cls.card}>
          <h2 className="mb-4 text-lg font-semibold">Eligibility & EEO (optional)</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={cls.label}>Authorized to work?</label>
              <select
                className={cls.input + " mt-1"}
                value={triToStr(profile.workAuthorized)}
                onChange={(e) => set("workAuthorized", strToTri(e.target.value) as never)}
              >
                <option value="">Prefer not to say</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className={cls.label}>Requires sponsorship?</label>
              <select
                className={cls.input + " mt-1"}
                value={triToStr(profile.requiresSponsorship)}
                onChange={(e) => set("requiresSponsorship", strToTri(e.target.value) as never)}
              >
                <option value="">Prefer not to say</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {EEO_FIELDS.map((f) => (
              <div key={String(f.name)}>
                <label className={cls.label}>{f.label}</label>
                <input
                  className={cls.input + " mt-1"}
                  value={(profile[f.name] as string) ?? ""}
                  onChange={(e) => set(f.name, e.target.value as never)}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className={cls.btnGreen}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
