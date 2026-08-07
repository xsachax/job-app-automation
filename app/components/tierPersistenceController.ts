"use client";

import { isTier, type Tier } from "@/lib/tiers";
import { api } from "./api";

const DRAFT_PREFIX = "job-pipeline-tier-draft-v1";
const TAB_ID_KEY = "job-pipeline-tier-tab-id-v1";
const VERSION_SCALE = 1000;

export type TierSaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export interface VersionedTierEdit {
  tier: Tier | null;
  editVersion: number;
}

export interface TierHydrationRecord extends VersionedTierEdit {
  key: string;
}

interface StoredTierDraft {
  edits: Record<string, VersionedTierEdit>;
}

interface SharedTierState {
  endpoint: string;
  field: string;
  pending: Map<string, VersionedTierEdit>;
  confirmed: Map<string, VersionedTierEdit>;
  queue: Promise<void>;
  listeners: Set<() => void>;
  inFlight: number;
  error: string | null;
}

interface TierMutationResponse {
  tier: unknown;
  editVersion: unknown;
}

const controllers = new Map<string, TierPersistenceController>();
let fallbackTabId = "";
let tabNonce: number | null = null;
let lastEditVersion = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTabId(): string {
  if (fallbackTabId) return fallbackTabId;
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) {
      fallbackTabId = existing;
      return existing;
    }
    const created = globalThis.crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, created);
    fallbackTabId = created;
    return created;
  } catch {
    fallbackTabId = globalThis.crypto.randomUUID();
    return fallbackTabId;
  }
}

function nextEditVersion(): number {
  tabNonce ??= Math.floor(Math.random() * VERSION_SCALE);
  const candidate = Date.now() * VERSION_SCALE + tabNonce;
  lastEditVersion = Math.max(candidate, lastEditVersion + 1);
  return lastEditVersion;
}

function storagePrefix(endpoint: string): string {
  return `${DRAFT_PREFIX}:${encodeURIComponent(endpoint)}:`;
}

function ownStorageKey(endpoint: string): string {
  return `${storagePrefix(endpoint)}${getTabId()}`;
}

function parseDraft(value: string | null): StoredTierDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.edits)) return null;
    const edits: Record<string, VersionedTierEdit> = {};
    for (const [key, raw] of Object.entries(parsed.edits)) {
      if (
        !isRecord(raw) ||
        !(raw.tier === null || isTier(raw.tier)) ||
        typeof raw.editVersion !== "number" ||
        !Number.isSafeInteger(raw.editVersion) ||
        raw.editVersion <= 0
      ) {
        continue;
      }
      edits[key] = {
        tier: raw.tier,
        editVersion: raw.editVersion,
      };
    }
    return { edits };
  } catch {
    return null;
  }
}

function draftStorageKeys(endpoint: string): string[] {
  const prefix = storagePrefix(endpoint);
  try {
    return Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => Boolean(key?.startsWith(prefix)));
  } catch {
    return [];
  }
}

function mergeStoredDrafts(state: SharedTierState): boolean {
  let changed = false;
  for (const storageKey of draftStorageKeys(state.endpoint)) {
    let draft: StoredTierDraft | null = null;
    try {
      draft = parseDraft(localStorage.getItem(storageKey));
    } catch {
      continue;
    }
    for (const [key, edit] of Object.entries(draft?.edits ?? {})) {
      lastEditVersion = Math.max(lastEditVersion, edit.editVersion);
      const confirmedVersion =
        state.confirmed.get(key)?.editVersion ?? 0;
      const pendingVersion = state.pending.get(key)?.editVersion ?? 0;
      if (
        edit.editVersion > confirmedVersion &&
        edit.editVersion > pendingVersion
      ) {
        state.pending.set(key, edit);
        changed = true;
      }
    }
  }
  return changed;
}

function writeOwnDraft(state: SharedTierState) {
  try {
    const key = ownStorageKey(state.endpoint);
    if (state.pending.size === 0) {
      localStorage.removeItem(key);
      return;
    }
    const draft: StoredTierDraft = {
      edits: Object.fromEntries(state.pending),
    };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Immediate server saves still protect edits when browser storage is blocked.
  }
}

function pruneStoredDrafts(state: SharedTierState) {
  for (const storageKey of draftStorageKeys(state.endpoint)) {
    try {
      const draft = parseDraft(localStorage.getItem(storageKey));
      if (!draft) continue;
      const remaining = Object.fromEntries(
        Object.entries(draft.edits).filter(([key, edit]) => {
          const confirmed = state.confirmed.get(key);
          return !confirmed || confirmed.editVersion < edit.editVersion;
        }),
      );
      if (Object.keys(remaining).length) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ edits: remaining } satisfies StoredTierDraft),
        );
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // A malformed or unavailable storage entry cannot affect server state.
    }
  }
}

function notify(state: SharedTierState) {
  for (const listener of state.listeners) listener();
}

function effectiveEdit(
  state: SharedTierState,
  key: string,
): VersionedTierEdit {
  const confirmed = state.confirmed.get(key) ?? {
    tier: null,
    editVersion: 0,
  };
  const pending = state.pending.get(key);
  return pending && pending.editVersion > confirmed.editVersion
    ? pending
    : confirmed;
}

function reconcilePending(state: SharedTierState) {
  for (const [key, pending] of state.pending) {
    const confirmed = state.confirmed.get(key);
    if (confirmed && confirmed.editVersion >= pending.editVersion) {
      state.pending.delete(key);
    }
  }
}

async function sendEdit(
  state: SharedTierState,
  key: string,
  edit: VersionedTierEdit,
  keepalive: boolean,
) {
  state.inFlight += 1;
  state.error = null;
  notify(state);
  try {
    const result = await api<TierMutationResponse>(state.endpoint, {
      method: "PUT",
      body: JSON.stringify({
        [state.field]: key,
        tier: edit.tier,
        editVersion: edit.editVersion,
      }),
      keepalive,
    });
    if (
      !(result.tier === null || isTier(result.tier)) ||
      typeof result.editVersion !== "number" ||
      !Number.isSafeInteger(result.editVersion) ||
      result.editVersion <= 0
    ) {
      throw new Error("server returned an invalid tier save response");
    }

    const confirmed = state.confirmed.get(key);
    if (!confirmed || result.editVersion >= confirmed.editVersion) {
      state.confirmed.set(key, {
        tier: result.tier,
        editVersion: result.editVersion,
      });
    }
    reconcilePending(state);
    writeOwnDraft(state);
    pruneStoredDrafts(state);
  } catch (error) {
    state.error = `Could not save ${key}: ${(error as Error).message}`;
    writeOwnDraft(state);
    throw error;
  } finally {
    state.inFlight -= 1;
    notify(state);
  }
}

async function flushSnapshot(
  state: SharedTierState,
  keepalive: boolean,
) {
  const snapshot = [...state.pending.entries()];
  for (const [key, edit] of snapshot) {
    if (state.pending.get(key)?.editVersion !== edit.editVersion) continue;
    await sendEdit(state, key, edit, keepalive);
  }
}

function enqueueFlush(state: SharedTierState): Promise<void> {
  const request = state.queue
    .catch(() => undefined)
    .then(() => flushSnapshot(state, false));
  state.queue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export class TierPersistenceController {
  private constructor(private readonly state: SharedTierState) {}

  static create(endpoint: string, field: string) {
    return new TierPersistenceController({
      endpoint,
      field,
      pending: new Map(),
      confirmed: new Map(),
      queue: Promise.resolve(),
      listeners: new Set(),
      inFlight: 0,
      error: null,
    });
  }

  get endpoint(): string {
    return this.state.endpoint;
  }

  get status(): TierSaveStatus {
    if (this.state.error) return "error";
    if (this.state.inFlight > 0) return "saving";
    if (this.state.pending.size > 0) return "pending";
    return "saved";
  }

  get error(): string | null {
    return this.state.error;
  }

  effective(key: string): VersionedTierEdit {
    return effectiveEdit(this.state, key);
  }

  subscribe(listener: () => void): () => void {
    this.state.listeners.add(listener);
    return () => this.state.listeners.delete(listener);
  }

  hydrate(records: TierHydrationRecord[]) {
    for (const record of records) {
      const existing = this.state.confirmed.get(record.key);
      if (!existing || record.editVersion >= existing.editVersion) {
        this.state.confirmed.set(record.key, {
          tier: record.tier,
          editVersion: record.editVersion,
        });
      }
    }
    reconcilePending(this.state);
    mergeStoredDrafts(this.state);
    reconcilePending(this.state);
    pruneStoredDrafts(this.state);
    notify(this.state);
    if (this.state.pending.size > 0) {
      void enqueueFlush(this.state).catch(() => undefined);
    }
  }

  assign(key: string, tier: Tier | null) {
    this.state.pending.set(key, {
      tier,
      editVersion: nextEditVersion(),
    });
    this.state.error = null;
    writeOwnDraft(this.state);
    notify(this.state);
    void enqueueFlush(this.state).catch(() => undefined);
  }

  recoverStoredDrafts() {
    if (!mergeStoredDrafts(this.state)) return;
    this.state.error = null;
    notify(this.state);
    void enqueueFlush(this.state).catch(() => undefined);
  }

  matchesStorageKey(key: string | null): boolean {
    return Boolean(key?.startsWith(storagePrefix(this.state.endpoint)));
  }

  retry(): Promise<void> {
    return enqueueFlush(this.state);
  }

  async saveNow() {
    while (this.state.pending.size > 0) {
      await enqueueFlush(this.state);
    }
  }

  flushForLifecycle() {
    const snapshot = [...this.state.pending.entries()];
    if (!snapshot.length) return;
    void Promise.all(
      snapshot.map(([key, edit]) =>
        sendEdit(this.state, key, edit, true),
      ),
    ).catch(() => undefined);
  }
}

export function getTierPersistenceController(
  endpoint: string,
  field: string,
): TierPersistenceController {
  const key = `${endpoint}\u0000${field}`;
  const existing = controllers.get(key);
  if (existing) return existing;
  const created = TierPersistenceController.create(endpoint, field);
  controllers.set(key, created);
  return created;
}
