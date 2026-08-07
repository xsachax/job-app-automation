"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTier, type Tier } from "@/lib/tiers";
import { api } from "./api";
import {
  getTierPersistenceController,
  type TierHydrationRecord,
  type TierSaveStatus,
} from "./tierPersistenceController";

export type { TierSaveStatus } from "./tierPersistenceController";

export interface TierItem {
  key: string;
  count: number;
  tier: Tier | null;
  editVersion: number;
}

interface RawTierItem extends Record<string, unknown> {
  count: number;
  tier: string | null;
  editVersion?: number;
}

interface UseTierPersistenceOptions {
  endpoint: string;
  itemsKey: string;
  field: string;
}

export function useTierPersistence({
  endpoint,
  itemsKey,
  field,
}: UseTierPersistenceOptions) {
  const controller = useMemo(
    () => getTierPersistenceController(endpoint, field),
    [endpoint, field],
  );
  const [items, setItems] = useState<TierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] =
    useState<TierSaveStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(
    null,
  );
  const mountedRef = useRef(false);

  const syncFromController = useCallback(() => {
    if (!mountedRef.current) return;
    setItems((current) =>
      current.map((item) => {
        const edit = controller.effective(item.key);
        return {
          ...item,
          tier: edit.tier,
          editVersion: edit.editVersion,
        };
      }),
    );
    setSaveStatus(controller.status);
    setPersistenceError(controller.error);
  }, [controller]);

  const assignTier = useCallback(
    (key: string, tier: Tier | null) => controller.assign(key, tier),
    [controller],
  );
  const retrySaves = useCallback(() => controller.retry(), [controller]);
  const saveNow = useCallback(() => controller.saveNow(), [controller]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const unsubscribe = controller.subscribe(syncFromController);

    const onStorage = (event: StorageEvent) => {
      if (controller.matchesStorageKey(event.key)) {
        controller.recoverStoredDrafts();
      }
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        controller.flushForLifecycle();
      }
    };
    const flushOnPageHide = () => controller.flushForLifecycle();

    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", flushOnPageHide);
    document.addEventListener("visibilitychange", flushWhenHidden);

    void (async () => {
      try {
        const data = await api<Record<string, RawTierItem[]>>(endpoint);
        if (!active) return;
        const rows = (data[itemsKey] ?? [])
          .map((raw) => {
            const key = String(raw[field] ?? "");
            const tier = isTier(raw.tier) ? raw.tier : null;
            const editVersion =
              typeof raw.editVersion === "number" &&
              Number.isSafeInteger(raw.editVersion) &&
              raw.editVersion >= 0
                ? raw.editVersion
                : 0;
            return {
              key,
              count: raw.count,
              tier,
              editVersion,
            };
          })
          .filter((item) => item.key);
        const hydration: TierHydrationRecord[] = rows.map(
          ({ key, tier, editVersion }) => ({
            key,
            tier,
            editVersion,
          }),
        );
        controller.hydrate(hydration);
        setItems(
          rows.map((item) => {
            const edit = controller.effective(item.key);
            return {
              ...item,
              tier: edit.tier,
              editVersion: edit.editVersion,
            };
          }),
        );
        setSaveStatus(controller.status);
        setPersistenceError(controller.error);
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
      unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", flushOnPageHide);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      controller.flushForLifecycle();
    };
  }, [
    controller,
    endpoint,
    field,
    itemsKey,
    syncFromController,
  ]);

  return {
    items,
    loading,
    saveStatus,
    persistenceError,
    assignTier,
    retrySaves,
    saveNow,
  };
}
