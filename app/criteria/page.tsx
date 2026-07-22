"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";

interface Criteria {
  titles: string[];
  locations: string[];
  keywords: string[];
  excludeKeywords: string[];
  remoteOnly: boolean;
  seniority: string[];
}

const EMPTY: Criteria = {
  titles: [],
  locations: [],
  keywords: [],
  excludeKeywords: [],
  remoteOnly: false,
  seniority: [],
};

const LIST_FIELDS: { name: keyof Criteria; label: string; help: string }[] = [
  { name: "titles", label: "Target titles", help: "Roles you want. A job matches if its title contains any of these." },
  { name: "locations", label: "Locations", help: "Preferred locations. Leave empty to allow anywhere." },
  { name: "keywords", label: "Boost keywords", help: "Words that raise a job's score when present." },
  { name: "excludeKeywords", label: "Exclude keywords", help: "Jobs containing any of these are filtered out." },
  { name: "seniority", label: "Seniority", help: "e.g. junior, mid, senior. Empty = any." },
];

export default function CriteriaPage() {
  const [criteria, setCriteria] = useState<Criteria>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCriteria({ ...EMPTY, ...(await api<Criteria>("/api/criteria")) });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const saved = await api<Criteria>("/api/criteria", {
        method: "PUT",
        body: JSON.stringify(criteria),
      });
      setCriteria({ ...EMPTY, ...saved });
      setMsg("Criteria saved. New scans and re-scores will use these.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      <PageHeader title="Criteria" subtitle="What counts as a match. Used for scoring and filtering during scans." />

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

      <div className={cls.card + " space-y-5"}>
        {LIST_FIELDS.map((f) => (
          <div key={String(f.name)}>
            <label className={cls.label}>{f.label} (comma-separated)</label>
            <input
              className={cls.input + " mt-1"}
              value={(criteria[f.name] as string[]).join(", ")}
              onChange={(e) =>
                setCriteria({
                  ...criteria,
                  [f.name]: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="mt-1 text-xs text-gray-400">{f.help}</p>
          </div>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={criteria.remoteOnly}
            onChange={(e) => setCriteria({ ...criteria, remoteOnly: e.target.checked })}
          />
          Remote only
        </label>

        <div>
          <button onClick={save} disabled={saving} className={cls.btnGreen}>
            {saving ? "Saving…" : "Save criteria"}
          </button>
        </div>
      </div>
    </div>
  );
}
