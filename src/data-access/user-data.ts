"use client";

/**
 * Data access for signed-in users, running in the browser (static export).
 * Each call:
 *   1. validates input with the shared Zod schemas,
 *   2. verifies the session with Supabase Auth,
 *   3. queries as the user with the public key, so PostgreSQL Row Level
 *      Security — not the browser — decides what the user may read or change.
 * Database CHECK constraints repeat the important limits, so bypassing this
 * module (e.g. calling the REST API directly) cannot store invalid or foreign data.
 */
import { z } from "zod";
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
import { generatePlan } from "@/domain/plan-generator";
import {
  notificationPrefsSchema,
  planRequestSchema,
  profileSchema,
  taskInputSchema,
  taskPatchSchema,
  uuidSchema,
} from "@/domain/schemas";
import { CLIMATE_ZONES, PLANTING_STATUSES, type Task, type UserDataSnapshot } from "@/domain/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { CROP_SELECT, mapCropRow, type CropRow } from "@/services/crop-mapper";
import {
  mapGarden,
  mapPlanting,
  mapTask,
  type GardenRow,
  type PlantingRow,
  type TaskRow,
} from "@/services/user-data-mapper";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ActionResultOf<T> = ActionResult<T>;

const NOT_CONFIGURED = "قاعدة البيانات غير مهيأة بعد.";
const NOT_SIGNED_IN = "انتهت جلستك. سجّل الدخول مرة أخرى.";
const GENERIC = "حدث خطأ غير متوقع أثناء الحفظ. حاول مرة أخرى.";

async function authed() {
  const supabase = getBrowserSupabase();
  if (!supabase) return { error: NOT_CONFIGURED } as const;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: NOT_SIGNED_IN } as const;
  return { supabase, user: data.user } as const;
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "البيانات المدخلة غير صالحة.";
}

function fail(scope: string, message: string): { ok: false; error: string } {
  console.error(`[data:${scope}]`, message);
  if (/fetch|network/i.test(message)) return { ok: false, error: "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت." };
  return { ok: false, error: GENERIC };
}

export async function loadUserDataAction(): Promise<ActionResult<UserDataSnapshot>> {
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase } = ctx;
  const [g, p, t] = await Promise.all([
    supabase.from("gardens").select("*").order("created_at"),
    supabase.from("plantings").select("*").order("planted_on", { ascending: false }),
    supabase.from("tasks").select("*").order("due_date").limit(5000),
  ]);
  const err = g.error ?? p.error ?? t.error;
  if (err) return fail("load", err.message);
  return {
    ok: true,
    data: {
      gardens: (g.data as GardenRow[]).map(mapGarden),
      plantings: (p.data as PlantingRow[]).map(mapPlanting),
      tasks: (t.data as TaskRow[]).map(mapTask),
    },
  };
}

/** Generates the plan on the server from the crop rules stored in the database. */
export async function createPlanAction(raw: unknown): Promise<ActionResult<{ plantingId: string; gardenId: string }>> {
  const parsed = planRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase } = ctx;
  const input = parsed.data;

  const { data: cropRow, error: cropErr } = await supabase
    .from("crops")
    .select(CROP_SELECT)
    .eq("slug", input.cropSlug)
    .maybeSingle();
  if (cropErr) return fail("plan:crop", cropErr.message);
  if (!cropRow) return { ok: false, error: "المحصول المختار غير متوفر." };
  const crop = mapCropRow(cropRow as CropRow);

  const plan = generatePlan({ crop, plantedOn: input.plantedOn, zone: input.zone, spaceType: input.spaceType, country: planCountry(input) });
  const method = windowsForZone(crop, input.zone, planCountry(input))[0]?.method ?? crop.windows[0]?.method ?? null;

  if (input.gardenId && !uuidSchema.safeParse(input.gardenId).success) {
    return { ok: false, error: "المساحة الزراعية غير صالحة." };
  }

  const { data, error } = await supabase.rpc("create_plan", {
    payload: {
      garden: input.gardenId ? { id: input.gardenId } : {
        name: input.gardenName,
        space_type: input.spaceType,
        region_id: input.regionId,
        zone: input.zone,
        area_m2: input.areaM2,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      planting: {
        crop_slug: crop.slug,
        crop_name: crop.name,
        planted_on: input.plantedOn,
        method,
        area_m2: input.areaM2,
        quantity: input.quantity,
        expected_harvest_start: plan.expectedHarvestStart,
        expected_harvest_end: plan.expectedHarvestEnd,
        notes: input.notes,
      },
      tasks: plan.tasks.map((t) => ({
        type: t.type,
        title: t.title,
        description: t.description,
        due_date: t.dueDate,
        status: input.completeBefore && t.dueDate < input.completeBefore ? "done" : "pending",
        template_key: t.templateKey,
        source: "generated",
      })),
    },
  });
  if (error) return fail("plan:rpc", error.message);
  const { data: row } = await supabase.from("plantings").select("garden_id").eq("id", data as string).single();
  return { ok: true, data: { plantingId: data as string, gardenId: (row?.garden_id as string) ?? "" } };
}

export async function createTaskAction(raw: unknown): Promise<ActionResult<Task>> {
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase, user } = ctx;
  const v = parsed.data;

  let gardenId: string | null = null;
  if (v.plantingId) {
    if (!uuidSchema.safeParse(v.plantingId).success) return { ok: false, error: "المحصول المرتبط غير صالح." };
    const { data: p } = await supabase.from("plantings").select("garden_id").eq("id", v.plantingId).maybeSingle();
    if (!p) return { ok: false, error: "المحصول المرتبط غير موجود." };
    gardenId = p.garden_id as string;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      planting_id: v.plantingId ?? null,
      garden_id: gardenId,
      type: v.type,
      title: v.title,
      description: v.description || null,
      due_date: v.dueDate,
      source: "custom",
    })
    .select("*")
    .single();
  if (error) return fail("task:create", error.message);
  return { ok: true, data: mapTask(data as TaskRow) };
}

export async function updateTaskAction(id: string, raw: unknown): Promise<ActionResult<Task>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "المهمة غير موجودة." };
  const parsed = taskPatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const v = parsed.data;
  const patch: Record<string, unknown> = {};
  if (v.title !== undefined) patch.title = v.title;
  if (v.description !== undefined) patch.description = v.description || null;
  if (v.dueDate !== undefined) patch.due_date = v.dueDate;
  if (v.type !== undefined) patch.type = v.type;
  if (v.status !== undefined) patch.status = v.status;
  if (v.postponedCount !== undefined) patch.postponed_count = v.postponedCount;

  const { data, error } = await ctx.supabase.from("tasks").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return fail("task:update", error.message);
  if (!data) return { ok: false, error: "المهمة غير موجودة أو لا تملك صلاحية تعديلها." };
  return { ok: true, data: mapTask(data as TaskRow) };
}

export async function deleteTaskAction(id: string): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "المهمة غير موجودة." };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { error } = await ctx.supabase.from("tasks").delete().eq("id", id);
  if (error) return fail("task:delete", error.message);
  return { ok: true, data: null };
}

const plantingStatusSchema = z.enum(PLANTING_STATUSES);

export async function updatePlantingStatusAction(id: string, status: unknown): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "المحصول غير موجود." };
  const s = plantingStatusSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "حالة غير صالحة." };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { error } = await ctx.supabase.from("plantings").update({ status: s.data }).eq("id", id);
  if (error) return fail("planting:update", error.message);
  return { ok: true, data: null };
}

/** Deletes a planting and its tasks (ON DELETE CASCADE); removes the garden if it becomes empty. */
export async function deletePlantingAction(id: string): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "المحصول غير موجود." };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase } = ctx;
  const { data: p } = await supabase.from("plantings").select("garden_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("plantings").delete().eq("id", id);
  if (error) return fail("planting:delete", error.message);
  if (p?.garden_id) {
    const { count } = await supabase
      .from("plantings")
      .select("id", { count: "exact", head: true })
      .eq("garden_id", p.garden_id);
    if (count === 0) await supabase.from("gardens").delete().eq("id", p.garden_id);
  }
  return { ok: true, data: null };
}

/* ---------- Moving guest (browser) data into the account ---------- */

const importTaskSchema = z.object({
  type: taskInputSchema.shape.type,
  title: taskInputSchema.shape.title,
  description: z.string().max(1000).nullable(),
  dueDate: taskInputSchema.shape.dueDate,
  status: z.enum(["pending", "done", "skipped"]),
  postponedCount: z.number().int().min(0).max(1000),
  source: z.enum(["generated", "custom"]),
});

const importSchema = z.object({
  plans: z
    .array(
      z.object({
        garden: z.object({
          name: z.string().trim().min(1).max(60),
          spaceType: planRequestSchema.shape.spaceType,
          regionId: z.string().max(80).nullable(),
          zone: planRequestSchema.shape.zone,
          areaM2: z.number().min(0).max(1_000_000).nullable(),
          latitude: z.number().min(-90).max(90).nullable(),
          longitude: z.number().min(-180).max(180).nullable(),
        }),
        planting: z.object({
          cropSlug: z.string().min(1).max(80),
          cropName: z.string().min(1).max(60),
          plantedOn: taskInputSchema.shape.dueDate,
          method: z.string().max(40).nullable(),
          areaM2: z.number().min(0).max(1_000_000).nullable(),
          quantity: z.number().int().min(0).max(100_000).nullable(),
          status: z.enum(PLANTING_STATUSES),
          expectedHarvestStart: z.string().nullable(),
          expectedHarvestEnd: z.string().nullable(),
          notes: z.string().max(500).nullable(),
        }),
        tasks: z.array(importTaskSchema).max(500),
      }),
    )
    .max(50),
  looseTasks: z.array(importTaskSchema).max(500),
});

export async function importLocalDataAction(raw: unknown): Promise<ActionResult<{ plans: number; tasks: number }>> {
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "تعذّر قراءة البيانات المحلية لنقلها." };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase, user } = ctx;
  let taskCount = 0;

  for (const plan of parsed.data.plans) {
    const { error } = await supabase.rpc("create_plan", {
      payload: {
        garden: {
          name: plan.garden.name,
          space_type: plan.garden.spaceType,
          region_id: plan.garden.regionId,
          zone: plan.garden.zone,
          area_m2: plan.garden.areaM2,
          latitude: plan.garden.latitude,
          longitude: plan.garden.longitude,
        },
        planting: {
          crop_slug: plan.planting.cropSlug,
          crop_name: plan.planting.cropName,
          planted_on: plan.planting.plantedOn,
          method: plan.planting.method,
          area_m2: plan.planting.areaM2,
          quantity: plan.planting.quantity,
          status: plan.planting.status,
          expected_harvest_start: plan.planting.expectedHarvestStart,
          expected_harvest_end: plan.planting.expectedHarvestEnd,
          notes: plan.planting.notes,
        },
        tasks: plan.tasks.map((t) => ({
          type: t.type,
          title: t.title,
          description: t.description,
          due_date: t.dueDate,
          status: t.status,
          postponed_count: t.postponedCount,
          source: t.source,
        })),
      },
    });
    if (error) return fail("import:plan", error.message);
    taskCount += plan.tasks.length;
  }

  if (parsed.data.looseTasks.length) {
    const { error } = await supabase.from("tasks").insert(
      parsed.data.looseTasks.map((t) => ({
        user_id: user.id,
        type: t.type,
        title: t.title,
        description: t.description,
        due_date: t.dueDate,
        status: t.status,
        postponed_count: t.postponedCount,
        source: t.source,
      })),
    );
    if (error) return fail("import:tasks", error.message);
    taskCount += parsed.data.looseTasks.length;
  }

  return { ok: true, data: { plans: parsed.data.plans.length, tasks: taskCount } };
}

/* ---------- Profile & preferences ---------- */

export interface ProfileData {
  fullName: string;
  email: string | null;
  role: "user" | "admin";
  planTier: string;
  regionId: string | null;
  zone: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  prefs: { inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean; reminderDaysBefore: number };
}

export async function getProfileAction(): Promise<ActionResult<ProfileData>> {
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { supabase, user } = ctx;
  const [{ data: p, error: pe }, { data: n }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (pe) return fail("profile:get", pe.message);
  return {
    ok: true,
    data: {
      fullName: p?.full_name ?? "",
      email: user.email ?? null,
      role: p?.role === "admin" ? "admin" : "user",
      planTier: p?.plan_tier ?? "free",
      regionId: p?.region_id ?? null,
      zone: p?.zone ?? null,
      timezone: p?.timezone ?? "Asia/Hebron",
      latitude: p?.latitude ?? null,
      longitude: p?.longitude ?? null,
      prefs: {
        inAppEnabled: n?.in_app_enabled ?? true,
        emailEnabled: n?.email_enabled ?? false,
        pushEnabled: n?.push_enabled ?? false,
        reminderDaysBefore: n?.reminder_days_before ?? 1,
      },
    },
  };
}

export async function updateProfileAction(raw: unknown): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const v = parsed.data;
  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      full_name: v.fullName,
      region_id: v.regionId,
      zone: v.zone,
      timezone: v.timezone,
      latitude: v.latitude,
      longitude: v.longitude,
    })
    .eq("id", ctx.user.id);
  if (error) return fail("profile:update", error.message);
  return { ok: true, data: null };
}

export async function updateNotificationPrefsAction(raw: unknown): Promise<ActionResult<null>> {
  const parsed = notificationPrefsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const { error } = await ctx.supabase
    .from("notification_preferences")
    .update({ in_app_enabled: parsed.data.inAppEnabled, reminder_days_before: parsed.data.reminderDaysBefore })
    .eq("user_id", ctx.user.id);
  if (error) return fail("prefs:update", error.message);
  return { ok: true, data: null };
}

/* ---------- Confirmed location (own profile row only, RLS) ---------- */

const locationSchema = z.object({
  version: z.literal(2),
  source: z.enum(["gps", "map", "search", "list"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(1_000_000).nullable(),
  label: z.string().max(160),
  regionId: z.string().max(80).nullable(),
  zone: z.enum(CLIMATE_ZONES),
  zoneSource: z.enum(["manual", "elevation", "nearest_town", "list"]),
  elevationM: z.number().min(-500).max(9000).nullable(),
  timezone: z.string().max(64),
  externalConsent: z.boolean(),
  confirmedAt: z.string().max(40),
  labelSource: z.enum(["osm", "search", "list", "manual", "none"]).optional(),
  countryCode: z.enum(["PS", "JO", "LB", "SY"]).nullable().optional(),
});

export async function saveLocationAction(raw: unknown): Promise<ActionResult<null>> {
  const ctx = await authed();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? GENERIC };
  const patch =
    raw === null
      ? { latitude: null, longitude: null, location_label: null, location_source: null, location_accuracy_m: null, elevation_m: null, external_geo_consent: false, location_confirmed_at: null, location_country: null, location_label_source: null }
      : (() => {
          const parsed = locationSchema.safeParse(raw);
          if (!parsed.success) return null;
          const v = parsed.data;
          return {
            region_id: v.regionId,
            zone: v.zone,
            timezone: v.timezone,
            latitude: v.latitude,
            longitude: v.longitude,
            location_label: v.label || null,
            location_source: v.source,
            location_accuracy_m: v.accuracyM,
            elevation_m: v.elevationM,
            external_geo_consent: v.externalConsent,
            location_confirmed_at: v.confirmedAt,
            location_country: v.countryCode ?? null,
            location_label_source: v.labelSource ?? null,
          };
        })();
  if (!patch) return { ok: false, error: "بيانات الموقع غير صالحة." };
  const { error } = await ctx.supabase.from("profiles").update(patch).eq("id", ctx.user.id);
  if (error) return fail("location:save", error.message);
  return { ok: true, data: null };
}
