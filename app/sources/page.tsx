"use client";

import { useEffect, useState } from "react";
import { api } from "../components/api";
import { cls, PageHeader } from "../components/ui";
import { SOURCE_KINDS, kindMeta } from "@/lib/sources/kinds";

interface Source {
  id: string;
  name: string;
  kind: string;
  config: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  lastJobCount: number;
  _count?: { sightings: number };
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>(SOURCE_KINDS[0].kind);
  const [config, setConfig] = useState<Record<string, string>>({});

  async function reload() {
    try {
      setSources(await api<Source[]>("/api/sources"));
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
        const data = await api<Source[]>("/api/sources");
        if (active) setSources(data);
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

  const meta = kindMeta(kind);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("add");
    try {
      const cleanConfig: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) if (v.trim()) cleanConfig[k] = v.trim();
      await api("/api/sources", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || kind, kind, config: cleanConfig }),
      });
      setName("");
      setConfig({});
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runSource(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/sources/${id}/run`, { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      await reload();
    }
  }

  async function toggle(s: Source) {
    setBusy(s.id);
    try {
      await api(`/api/sources/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Source) {
    if (!confirm(`Delete source "${s.name}"? Its job sightings will be removed.`)) return;
    setBusy(s.id);
    try {
      await api(`/api/sources/${s.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Sources" subtitle="Job boards this pipeline scrapes. All feed the shared dedup layer." />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={addSource} className={cls.card + " mb-8"}>
        <h2 className="mb-4 text-lg font-semibold">Add a source</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={cls.label}>Name</label>
            <input
              className={cls.input + " mt-1"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Figma (Greenhouse)"
            />
          </div>
          <div>
            <label className={cls.label}>Kind</label>
            <select
              className={cls.input + " mt-1"}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setConfig({});
              }}
            >
              {SOURCE_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {meta && <p className="mt-3 text-xs text-gray-500">{meta.blurb}</p>}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {meta?.fields.map((f) => (
            <div key={f.name}>
              <label className={cls.label}>
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              <input
                className={cls.input + " mt-1"}
                value={config[f.name] ?? ""}
                onChange={(e) => setConfig({ ...config, [f.name]: e.target.value })}
                placeholder={f.placeholder}
              />
              {f.help && <p className="mt-1 text-xs text-gray-400">{f.help}</p>}
            </div>
          ))}
        </div>

        <div className="mt-5">
          <button type="submit" disabled={busy === "add"} className={cls.btnPrimary}>
            {busy === "add" ? "Adding…" : "Add source"}
          </button>
        </div>
      </form>

      <h2 className="mb-3 text-lg font-semibold">
        Configured sources {loading ? "" : `(${sources.length})`}
      </h2>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-gray-500">No sources yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className={cls.card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {s.kind}
                    </span>
                    {!s.enabled && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs text-gray-400">{s.config}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    {s.lastStatus ? (
                      <>
                        <span
                          className={
                            "font-medium " +
                            (s.lastStatus === "ok" ? "text-green-600" : "text-red-600")
                          }
                        >
                          {s.lastStatus}
                        </span>
                        {s.lastMessage ? ` — ${s.lastMessage}` : ""}
                        {s.lastRunAt ? ` · ${new Date(s.lastRunAt).toLocaleString()}` : ""}
                      </>
                    ) : (
                      "never run"
                    )}
                    {typeof s._count?.sightings === "number" && (
                      <> · {s._count.sightings} sightings</>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runSource(s.id)}
                    disabled={busy === s.id}
                    className={cls.btnPrimary}
                  >
                    {busy === s.id ? "Running…" : "Run now"}
                  </button>
                  <button onClick={() => toggle(s)} disabled={busy === s.id} className={cls.btn}>
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(s)} disabled={busy === s.id} className={cls.btnDanger}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
