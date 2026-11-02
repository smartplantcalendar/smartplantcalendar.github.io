"use client";

/**
 * Single client-side source of truth for the current visitor:
 *   - auth state (Supabase browser session, when configured),
 *   - their gardens / plantings / tasks,
 *   - their saved location and time zone.
 * Signed-in users go through server actions (validated + RLS). Guests use
 * browser storage, which the UI labels clearly as "this device only".
 */
import type { User } from "@supabase/supabase-js";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlanAction,
  createTaskAction,
  deletePlantingAction,
  deleteTaskAction,
  importLocalDataAction,
  loadUserDataAction,
  saveLocationAction,
  updatePlantingStatusAction,
  updateTaskAction,
  type ActionResult,
} from "@/data-access/user-data";
import type { PlanRequest, TaskInput, TaskPatch } from "@/domain/schemas";
import type { Crop, PlantingStatus, Task, UserDataSnapshot } from "@/domain/types";
import { DEFAULT_TIMEZONE, todayInTimeZone } from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/env";
import {
  applyTaskPatch,
  clearLocal,
  EMPTY_SNAPSHOT,
  localAddTask,
  localCreatePlan,
  localDeletePlanting,
  readLocal,
  readLocation,
  toImportPayload,
  writeLocal,
  writeLocation,
  type SavedLocation,
} from "@/lib/local-store";
import { persistLocation, type LocationSaveResult } from "@/lib/location-save";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { normalizeLocation } from "@/domain/location";

interface ProfileLocationRow {
  region_id: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  location_label?: string | null;
  location_source?: string | null;
  location_accuracy_m?: number | string | null;
  elevation_m?: number | string | null;
  external_geo_consent?: boolean | null;
  location_confirmed_at?: string | null;
  location_country?: string | null;
  location_label_source?: string | null;
}

function profileToLocation(p: ProfileLocationRow): SavedLocation | null {
  if (p.latitude == null || p.longitude == null) {
    return normalizeLocation({ regionId: p.region_id, zone: p.zone, timezone: p.timezone ?? DEFAULT_TIMEZONE });
  }
  if (!p.location_source) {
    return normalizeLocation({ regionId: p.region_id, zone: p.zone, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone });
  }
  return normalizeLocation({
    version: 2,
    source: p.location_source,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyM: p.location_accuracy_m == null ? null : Number(p.location_accuracy_m),
    label: p.location_label ?? "",
    regionId: p.region_id,
    zone: p.zone,
    zoneSource: "manual",
    elevationM: p.elevation_m == null ? null : Number(p.elevation_m),
    timezone: p.timezone || DEFAULT_TIMEZONE,
    externalConsent: Boolean(p.external_geo_consent),
    confirmedAt: p.location_confirmed_at ?? new Date(0).toISOString(),
    countryCode: p.location_country ?? null,
    labelSource: p.location_label_source ?? undefined,
  });
}

export type DataMode = "loading" | "local" | "remote";
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const OFFLINE = "لا يوجد اتصال بالإنترنت. تحقق من الاتصال ثم حاول مرة أخرى.";
const LOCAL_WRITE_FAILED = "تعذّر الحفظ في هذا المتصفح (قد يكون التصفح الخاص مفعّلًا أو المساحة ممتلئة).";

interface AppData {
  mode: DataMode;
  user: User | null;
  isAdmin: boolean;
  data: UserDataSnapshot;
  error: string | null;
  timezone: string;
  today: string;
  location: SavedLocation | null;
  localItemsToImport: number;
  setLocation: (loc: SavedLocation | null) => Promise<LocationSaveResult>;
  reload: () => Promise<void>;
  createPlan: (input: PlanRequest, crop: Crop) => Promise<Result<{ plantingId: string; gardenId: string }>>;
  addTask: (input: TaskInput) => Promise<Result<Task>>;
  updateTask: (id: string, patch: TaskPatch) => Promise<Result<Task>>;
  deleteTask: (id: string) => Promise<Result>;
  setPlantingStatus: (id: string, status: PlantingStatus) => Promise<Result>;
  deletePlanting: (id: string) => Promise<Result>;
  importLocalData: () => Promise<Result<{ plans: number; tasks: number }>>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

async function callAction<T>(fn: () => Promise<ActionResult<T>>): Promise<Result<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: OFFLINE };
  try {
    return await fn();
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم. حاول مرة أخرى بعد قليل." };
  }
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DataMode>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<UserDataSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocationState] = useState<SavedLocation | null>(null);
  const [localItemsToImport, setLocalItemsToImport] = useState(0);
  const [today, setToday] = useState(() => todayInTimeZone(DEFAULT_TIMEZONE));
  const dataRef = useRef(data);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  const timezone = location?.timezone || DEFAULT_TIMEZONE;

  // Keep "today" correct across midnight in the user's time zone.
  useEffect(() => {
    const tick = () => setToday(todayInTimeZone(timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  const loadRemote = useCallback(async () => {
    const res = await callAction(() => loadUserDataAction());
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  const enterLocal = useCallback(() => {
    setUser(null);
    setIsAdmin(false);
    setData(readLocal());
    setLocationState(readLocation());
    setMode("local");
  }, []);

  const enterRemote = useCallback(
    async (u: User) => {
      setUser(u);
      setMode("remote");
      const local = readLocal();
      setLocalItemsToImport(local.plantings.length + local.tasks.filter((t) => !t.plantingId).length);
      const supabase = getBrowserSupabase();
      if (supabase) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, region_id, zone, latitude, longitude, timezone, location_label, location_source, location_accuracy_m, elevation_m, external_geo_consent, location_confirmed_at, location_country, location_label_source")
          .eq("id", u.id)
          .maybeSingle();
        setIsAdmin(profile?.role === "admin");
        setLocationState((profile && profileToLocation(profile)) ?? readLocation());
      }
      await loadRemote();
    },
    [loadRemote],
  );

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      // Browser storage is only readable after hydration.
      void Promise.resolve().then(enterLocal);
      return;
    }
    let active = true;
    supabase.auth.getUser().then(({ data: d }) => {
      if (!active) return;
      if (d.user) void enterRemote(d.user);
      else enterLocal();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") enterLocal();
      if (event === "SIGNED_IN" && session?.user && session.user.id !== userIdRef.current) void enterRemote(session.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [enterLocal, enterRemote]);

  const commitLocal = useCallback((next: UserDataSnapshot): boolean => {
    dataRef.current = next;
    setData(next);
    return writeLocal(next);
  }, []);

  /** Saves the confirmed location on this device, and on the profile when signed in. */
  const setLocation = useCallback<AppData["setLocation"]>(
    async (loc) => {
      const res = await persistLocation(loc, {
        signedIn: mode === "remote",
        writeLocal: writeLocation,
        saveToAccount: async (l) => {
          const r = await callAction(() => saveLocationAction(l));
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
      });
      // The app only switches to the new location once it is stored somewhere.
      if (res.ok) setLocationState(loc);
      return res;
    },
    [mode],
  );

  const createPlan = useCallback<AppData["createPlan"]>(
    async (input, crop) => {
      if (mode === "remote") {
        const res = await callAction(() => createPlanAction(input));
        if (res.ok) await loadRemote();
        return res;
      }
      const { snapshot, plantingId, gardenId } = localCreatePlan(dataRef.current, input, crop);
      if (!commitLocal(snapshot)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: { plantingId, gardenId } };
    },
    [mode, loadRemote, commitLocal],
  );

  const addTask = useCallback<AppData["addTask"]>(
    async (input) => {
      if (mode === "remote") {
        const res = await callAction(() => createTaskAction(input));
        if (res.ok) setData((d) => ({ ...d, tasks: [...d.tasks, res.data] }));
        return res;
      }
      const { snapshot, task } = localAddTask(dataRef.current, input);
      if (!commitLocal(snapshot)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: task };
    },
    [mode, commitLocal],
  );

  const updateTask = useCallback<AppData["updateTask"]>(
    async (id, patch) => {
      const current = dataRef.current.tasks.find((t) => t.id === id);
      if (!current) return { ok: false, error: "المهمة غير موجودة." };
      const optimistic = applyTaskPatch(current, patch);
      const replace = (task: Task) => setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? task : t)) }));
      if (mode === "remote") {
        replace(optimistic);
        const res = await callAction(() => updateTaskAction(id, patch));
        replace(res.ok ? res.data : current);
        return res;
      }
      const next = { ...dataRef.current, tasks: dataRef.current.tasks.map((t) => (t.id === id ? optimistic : t)) };
      if (!commitLocal(next)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: optimistic };
    },
    [mode, commitLocal],
  );

  const deleteTask = useCallback<AppData["deleteTask"]>(
    async (id) => {
      const before = dataRef.current;
      const next = { ...before, tasks: before.tasks.filter((t) => t.id !== id) };
      if (mode === "remote") {
        setData(next);
        const res = await callAction(() => deleteTaskAction(id));
        if (!res.ok) setData(before);
        return res;
      }
      if (!commitLocal(next)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: null };
    },
    [mode, commitLocal],
  );

  const setPlantingStatus = useCallback<AppData["setPlantingStatus"]>(
    async (id, status) => {
      const before = dataRef.current;
      const next = { ...before, plantings: before.plantings.map((p) => (p.id === id ? { ...p, status } : p)) };
      if (mode === "remote") {
        setData(next);
        const res = await callAction(() => updatePlantingStatusAction(id, status));
        if (!res.ok) setData(before);
        return res;
      }
      if (!commitLocal(next)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: null };
    },
    [mode, commitLocal],
  );

  const deletePlanting = useCallback<AppData["deletePlanting"]>(
    async (id) => {
      const before = dataRef.current;
      const next = localDeletePlanting(before, id);
      if (mode === "remote") {
        setData(next);
        const res = await callAction(() => deletePlantingAction(id));
        if (!res.ok) setData(before);
        return res;
      }
      if (!commitLocal(next)) return { ok: false, error: LOCAL_WRITE_FAILED };
      return { ok: true, data: null };
    },
    [mode, commitLocal],
  );

  const importLocalData = useCallback<AppData["importLocalData"]>(async () => {
    const payload = toImportPayload(readLocal());
    const res = await callAction(() => importLocalDataAction(payload));
    if (res.ok) {
      clearLocal();
      setLocalItemsToImport(0);
      await loadRemote();
    }
    return res;
  }, [loadRemote]);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    enterLocal();
  }, [enterLocal]);

  const value = useMemo<AppData>(
    () => ({
      mode,
      user,
      isAdmin,
      data,
      error,
      timezone,
      today,
      location,
      localItemsToImport,
      setLocation,
      reload: mode === "remote" ? loadRemote : async () => setData(readLocal()),
      createPlan,
      addTask,
      updateTask,
      deleteTask,
      setPlantingStatus,
      deletePlanting,
      importLocalData,
      signOut,
    }),
    [mode, user, isAdmin, data, error, timezone, today, location, localItemsToImport, setLocation, loadRemote, createPlan, addTask, updateTask, deleteTask, setPlantingStatus, deletePlanting, importLocalData, signOut],
  );

  return <Ctx value={value}>{children}</Ctx>;
}

export function useAppData(): AppData {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}

export { isSupabaseConfigured };
