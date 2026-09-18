"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isTier,
  type Tier,
  type TierListAction,
  type TierListKind,
} from "@/lib/tiers";
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
  itemsKey: TierListKind;
  field: string;
}

type TierListResponse = Partial<Record<TierListKind, RawTierItem[]>> & {
  listEditVersion?: number;
};

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

  const effectiveItems = useCallback(
    (rows: TierItem[]) => {
      const byKey = new Map(rows.map((item) => [item.key, item]));
      for (const record of controller.rankedRecords()) {
        if (!byKey.has(record.key)) {
          byKey.set(record.key, { ...record, count: 0 });
        }
      }
      return [...byKey.values()].map((item) => ({
        ...item,
        ...controller.effective(item.key),
      }));
    },
    [controller],
  );

  const syncFromController = useCallback(() => {
    if (!mountedRef.current) return;
    setItems(effectiveItems);
    setSaveStatus(controller.status);
    setPersistenceError(controller.error);
  }, [controller, effectiveItems]);

  const assignTier = useCallback(
    (key: string, tier: Tier | null) => controller.assign(key, tier),
    [controller],
  );
  const retrySaves = useCallback(() => controller.retry(), [controller]);
  const saveNow = useCallback(() => controller.saveNow(), [controller]);
  const replaceTiers = useCallback(
    async (action: TierListAction) => {
      const result = await controller.replace(action);
      return result.assignments.length;
    },
    [controller],
  );

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    let requestedListVersion = controller.listEditVersion;
    const unsubscribe = controller.subscribe(() => {
      syncFromController();
      if (controller.listEditVersion > requestedListVersion) {
        requestedListVersion = controller.listEditVersion;
        void loadItems();
      }
    });

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

    async function loadItems() {
      try {
        const data = await api<TierListResponse>(endpoint);
        if (!active) return;
        const listEditVersion = data.listEditVersion ?? 0;
        if (!Number.isSafeInteger(listEditVersion) || listEditVersion < 0) {
          throw new Error("server returned an invalid tier list version");
        }
        if (listEditVersion < controller.listEditVersion) return;
        requestedListVersion = listEditVersion;
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
        controller.hydrate(hydration, listEditVersion);
        setItems(effectiveItems(rows));
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
    }
    void loadItems();

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
    effectiveItems,
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
    replaceTiers,
    retrySaves,
    saveNow,
  };
}
