"use client";

/**
 * Guest-mode persistence in the visitor's own browser (localStorage).
 * This is real storage on the device — the UI always labels it as such and
 * never presents it as an account or cloud save.
 */
import { generatePlan } from "@/domain/plan-generator";
import { findRegion, REGIONS } from "@/data/regions";
import { countryFromCoordinates } from "@/domain/geo";
import { windowsForZone } from "@/domain/planting-windows";

/** Country for a plan: from the garden's coordinates (null near borders), else from the chosen town. */
function planCountry(input: { regionId: string | null; latitude: number | null; longitude: number | null }): string | null {
  if (input.latitude != null && input.longitude != null) {
    return countryFromCoordinates({ latitude: input.latitude, longitude: input.longitude }, REGIONS);
  }
  return findRegion(input.regionId)?.countryCode ?? null;
}
import type { PlanRequest, TaskInput, TaskPatch } from "@/domain/schemas";
import { normalizeLocation, type SavedLocation } from "@/domain/location";
import type { Crop, Garden, Planting, Task, UserDataSnapshot } from "@/domain/types";
import { newId } from "@/lib/utils";

const KEY = "smartplant:guest-data:v1";
const LOCATION_KEY = "smartplant:location:v1";

export const EMPTY_SNAPSHOT: UserDataSnapshot = { gardens: [], plantings: [], tasks: [] };

export function readLocal(): UserDataSnapshot {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_SNAPSHOT;
    const parsed = JSON.parse(raw) as Partial<UserDataSnapshot>;
    return {
      gardens: Array.isArray(parsed.gardens) ? parsed.gardens : [],
      plantings: Array.isArray(parsed.plantings) ? parsed.plantings : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

/** Returns false when the browser refuses to store data (private mode, quota). */
export function writeLocal(data: UserDataSnapshot): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export type { SavedLocation };

export function readLocation(): SavedLocation | null {
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    return raw ? normalizeLocation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it (private mode, full storage…). */
export function writeLocation(loc: SavedLocation | null): boolean {
  try {
    if (loc) window.localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    else window.localStorage.removeItem(LOCATION_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Pure operations on a snapshot (also unit-testable) ---------- */

export function localCreatePlan(snap: UserDataSnapshot, input: PlanRequest, crop: Crop, now = new Date()) {
  const created = now.toISOString();
  const plan = generatePlan({ crop, plantedOn: input.plantedOn, zone: input.zone, spaceType: input.spaceType, country: planCountry(input) });
  const existing = input.gardenId ? snap.gardens.find((g) => g.id === input.gardenId) : undefined;
  const garden: Garden = existing ?? {
    id: newId(),
    name: input.gardenName,
    spaceType: input.spaceType,
    regionId: input.regionId,
    zone: input.zone,
    areaM2: input.areaM2,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: created,
  };
  const planting: Planting = {
    id: newId(),
    gardenId: garden.id,
    cropId: crop.id,
    cropSlug: crop.slug,
    cropName: crop.name,
    plantedOn: input.plantedOn,
    method: windowsForZone(crop, input.zone, planCountry(input))[0]?.method ?? crop.windows[0]?.method ?? null,
    areaM2: input.areaM2,
    quantity: input.quantity,
    status: "active",
    expectedHarvestStart: plan.expectedHarvestStart,
    expectedHarvestEnd: plan.expectedHarvestEnd,
    notes: input.notes || null,
    createdAt: created,
  };
  const tasks: Task[] = plan.tasks.map((t) => {
    const past = !!input.completeBefore && t.dueDate < input.completeBefore;
    return {
    id: newId(),
    plantingId: planting.id,
    gardenId: garden.id,
    type: t.type,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    status: past ? "done" : "pending",
    completedAt: past ? created : null,
    postponedCount: 0,
    source: "generated",
    createdAt: created,
    } satisfies Task;
  });
  return {
    snapshot: {
      gardens: existing ? snap.gardens : [...snap.gardens, garden],
      plantings: [planting, ...snap.plantings],
      tasks: [...snap.tasks, ...tasks],
    },
    plantingId: planting.id,
    gardenId: garden.id,
  };
}

export function localAddTask(snap: UserDataSnapshot, input: TaskInput, now = new Date()): { snapshot: UserDataSnapshot; task: Task } {
  const planting = input.plantingId ? snap.plantings.find((p) => p.id === input.plantingId) : undefined;
  const task: Task = {
    id: newId(),
    plantingId: planting?.id ?? null,
    gardenId: planting?.gardenId ?? null,
    type: input.type,
    title: input.title,
    description: input.description || null,
    dueDate: input.dueDate,
    status: "pending",
    completedAt: null,
    postponedCount: 0,
    source: "custom",
    createdAt: now.toISOString(),
  };
  return { snapshot: { ...snap, tasks: [...snap.tasks, task] }, task };
}

export function applyTaskPatch(task: Task, patch: TaskPatch, now = new Date()): Task {
  const next: Task = {
    ...task,
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.description !== undefined && { description: patch.description || null }),
    ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
    ...(patch.type !== undefined && { type: patch.type }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.postponedCount !== undefined && { postponedCount: patch.postponedCount }),
  };
  if (patch.status !== undefined) {
    next.completedAt = patch.status === "done" ? (task.completedAt ?? now.toISOString()) : null;
  }
  return next;
}

export function localDeletePlanting(snap: UserDataSnapshot, id: string): UserDataSnapshot {
  const planting = snap.plantings.find((p) => p.id === id);
  const plantings = snap.plantings.filter((p) => p.id !== id);
  const gardenStillUsed = planting && plantings.some((p) => p.gardenId === planting.gardenId);
  return {
    gardens: planting && !gardenStillUsed ? snap.gardens.filter((g) => g.id !== planting.gardenId) : snap.gardens,
    plantings,
    tasks: snap.tasks.filter((t) => t.plantingId !== id),
  };
}

/** Shape expected by importLocalDataAction. */
export function toImportPayload(snap: UserDataSnapshot) {
  const pickTask = (t: Task) => ({
    type: t.type,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    status: t.status,
    postponedCount: t.postponedCount,
    source: t.source,
  });
  return {
    plans: snap.plantings.flatMap((p) => {
      const g = snap.gardens.find((x) => x.id === p.gardenId);
      if (!g) return [];
      return [
        {
          garden: {
            name: g.name,
            spaceType: g.spaceType,
            regionId: g.regionId,
            zone: g.zone,
            areaM2: g.areaM2,
            latitude: g.latitude,
            longitude: g.longitude,
          },
          planting: {
            cropSlug: p.cropSlug,
            cropName: p.cropName,
            plantedOn: p.plantedOn,
            method: p.method,
            areaM2: p.areaM2,
            quantity: p.quantity,
            status: p.status,
            expectedHarvestStart: p.expectedHarvestStart,
            expectedHarvestEnd: p.expectedHarvestEnd,
            notes: p.notes,
          },
          tasks: snap.tasks.filter((t) => t.plantingId === p.id).map(pickTask),
        },
      ];
    }),
    looseTasks: snap.tasks.filter((t) => !t.plantingId).map(pickTask),
  };
}
