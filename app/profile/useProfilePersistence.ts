"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { api } from "../components/api";
import type { ProfileData } from "@/lib/settings";
import {
  PROFILE_FIELD_VERSIONS_KEY,
  type ProfileFieldVersions,
} from "@/lib/profile/versioning";

const PROFILE_DRAFT_KEY = "job-pipeline-profile-draft-v1";
const AUTOSAVE_DELAY_MS = 600;

type Profile = ProfileData;
type ProfileChanges = Record<string, unknown>;
export type ProfileSaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

interface StoredProfileDraft {
  changes: ProfileChanges;
  fieldVersions: ProfileFieldVersions;
}

const sharedPendingChanges: ProfileChanges = {};
const sharedPendingVersions: ProfileFieldVersions = {};
let sharedSaveQueue: Promise<void> = Promise.resolve();
let lastFieldVersion = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextFieldVersion(): number {
  lastFieldVersion = Math.max(Date.now(), lastFieldVersion + 1);
  return lastFieldVersion;
}

function readDraft(): StoredProfileDraft {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(PROFILE_DRAFT_KEY) || "null",
    ) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.changes)) {
      return { changes: {}, fieldVersions: {} };
    }
    const fieldVersions = isRecord(parsed.fieldVersions)
      ? Object.fromEntries(
          Object.entries(parsed.fieldVersions).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" && Number.isFinite(entry[1]),
          ),
        )
      : {};
    return { changes: parsed.changes, fieldVersions };
  } catch {
    return { changes: {}, fieldVersions: {} };
  }
}

function writeDraft() {
  try {
    if (!Object.keys(sharedPendingChanges).length) {
      sessionStorage.removeItem(PROFILE_DRAFT_KEY);
      return;
    }
    const draft: StoredProfileDraft = {
      changes: sharedPendingChanges,
      fieldVersions: sharedPendingVersions,
    };
    sessionStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Server autosave still protects edits when session storage is unavailable.
  }
}

function changedValues(current: Profile, next: Profile): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
    if (!Object.is(current[key], next[key])) {
      changes[key] = next[key];
    }
  }
  return changes;
}

export function useProfilePersistence() {
  const [profile, setProfileState] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<ProfileSaveStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const profileRef = useRef<Profile>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const enqueueSave = useCallback(
    (
      changes: ProfileChanges,
      fieldVersions: ProfileFieldVersions,
      keepalive = false,
    ): Promise<Profile> => {
      if (!Object.keys(changes).length) {
        return Promise.resolve(profileRef.current);
      }

      const request = sharedSaveQueue
        .catch(() => undefined)
        .then(async () => {
          if (mountedRef.current) setSaveStatus("saving");
          const saved = await api<Profile>("/api/profile", {
            method: "PUT",
            body: JSON.stringify({
              ...changes,
              [PROFILE_FIELD_VERSIONS_KEY]: fieldVersions,
            }),
            keepalive,
          });

          for (const key of Object.keys(changes)) {
            if (sharedPendingVersions[key] === fieldVersions[key]) {
              delete sharedPendingChanges[key];
              delete sharedPendingVersions[key];
            }
          }
          writeDraft();

          const next = { ...saved, ...sharedPendingChanges };
          profileRef.current = next;
          if (mountedRef.current) {
            setProfileState(next);
            setSaveStatus(
              Object.keys(sharedPendingChanges).length ? "pending" : "saved",
            );
            setPersistenceError(null);
          }
          return next;
        });

      sharedSaveQueue = request.then(
        () => undefined,
        () => undefined,
      );
      request.catch((error: unknown) => {
        writeDraft();
        if (mountedRef.current) {
          setSaveStatus("error");
          setPersistenceError(
            `Could not save profile changes: ${(error as Error).message}`,
          );
        }
      });
      return request;
    },
    [],
  );

  const savePending = useCallback(
    (keepalive = false) =>
      enqueueSave(
        { ...sharedPendingChanges },
        { ...sharedPendingVersions },
        keepalive,
      ),
    [enqueueSave],
  );

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void savePending().then(
        () => {
          if (mountedRef.current && !Object.keys(sharedPendingChanges).length) {
            setSaveStatus("saved");
            setPersistenceError(null);
          }
        },
        () => undefined,
      );
    }, AUTOSAVE_DELAY_MS);
  }, [savePending]);

  const updateProfile = useCallback(
    (update: SetStateAction<Profile>) => {
      const current = profileRef.current;
      const next =
        typeof update === "function"
          ? (update as (profile: Profile) => Profile)(current)
          : update;
      const changes = changedValues(current, next);
      if (!Object.keys(changes).length) return;

      profileRef.current = next;
      for (const [key, value] of Object.entries(changes)) {
        sharedPendingChanges[key] = value;
        sharedPendingVersions[key] = nextFieldVersion();
      }
      writeDraft();
      setProfileState(next);
      setSaveStatus("pending");
      setPersistenceError(null);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const replaceProfile = useCallback(
    (saved: Profile) => {
      const pending = { ...sharedPendingChanges };
      const next = { ...saved, ...pending };
      profileRef.current = next;
      setProfileState(next);
      setPersistenceError(null);

      if (Object.keys(pending).length) {
        writeDraft();
        setSaveStatus("pending");
        scheduleAutosave();
        return;
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      writeDraft();
      setSaveStatus("saved");
    },
    [scheduleAutosave],
  );

  const saveNow = useCallback(async () => {
    while (Object.keys(sharedPendingChanges).length) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      await savePending();
    }
    return profileRef.current;
  }, [savePending]);

  const reloadProfile = useCallback(async () => {
    await saveNow();
    const loaded = await api<Profile>("/api/profile");
    replaceProfile(loaded);
    return profileRef.current;
  }, [replaceProfile, saveNow]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const flushPending = () => {
      if (Object.keys(sharedPendingChanges).length) {
        void savePending(true);
      }
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPending();
    };

    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", flushWhenHidden);

    void (async () => {
      try {
        const saved = await api<Profile>("/api/profile");
        if (!active) return;
        const draft = readDraft();
        for (const [key, value] of Object.entries(draft.changes)) {
          const version =
            draft.fieldVersions[key] ??
            sharedPendingVersions[key] ??
            nextFieldVersion();
          if (version >= (sharedPendingVersions[key] ?? 0)) {
            sharedPendingChanges[key] = value;
            sharedPendingVersions[key] = version;
            lastFieldVersion = Math.max(lastFieldVersion, version);
          }
        }
        writeDraft();
        const next = { ...saved, ...sharedPendingChanges };
        profileRef.current = next;
        setProfileState(next);
        setSaveStatus(
          Object.keys(sharedPendingChanges).length ? "pending" : "idle",
        );
        if (Object.keys(sharedPendingChanges).length) scheduleAutosave();
      } catch (error) {
        if (active) {
          setPersistenceError((error as Error).message);
          setSaveStatus("error");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      mountedRef.current = false;
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      flushPending();
    };
  }, [savePending, scheduleAutosave]);

  return {
    profile,
    loading,
    saveStatus,
    persistenceError,
    updateProfile,
    replaceProfile,
    saveNow,
    reloadProfile,
  };
}
