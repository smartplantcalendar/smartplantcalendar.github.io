"use client";

/**
 * Admin data access (browser). The role check here only improves the UX:
 * real authorisation is PostgreSQL Row Level Security, where only is_admin()
 * may write content tables and the crop-images bucket. A non-admin calling the
 * API directly is rejected by the database.
 *
 * Public pages are pre-rendered at build time, so content changes appear on
 * the public site after the next GitHub Pages build (daily, or run manually).
 */
import { z } from "zod";
import { DEFAULT_THRESHOLDS } from "@/domain/weather";
import {
  adminCropRulesSchema,
  adminCropSchema,
  adminFaqSchema,
  adminRegionSchema,
  adminSettingsSchema,
  uuidSchema,
} from "@/domain/schemas";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ActionResult } from "./user-data";
export type { ActionResultOf } from "./user-data";
import { CROP_SELECT, mapCropRow, type CropRow } from "@/services/crop-mapper";
import type { Crop } from "@/domain/types";

const FORBIDDEN = "لا تملك صلاحية تنفيذ هذه العملية.";
const GENERIC = "تعذّر حفظ التغييرات. حاول مرة أخرى.";

async function adminCtx() {
  const supabase = getBrowserSupabase();
  if (!supabase) return { error: "قاعدة البيانات غير مهيأة." } as const;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "انتهت جلستك. سجّل الدخول مرة أخرى." } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: FORBIDDEN } as const;
  return { supabase, user: data.user } as const;
}

function issue(err: z.ZodError) {
  const i = err.issues[0];
  return i ? i.message : "البيانات غير صالحة.";
}

function fail(scope: string, message: string, code?: string): { ok: false; error: string } {
  console.error(`[admin:${scope}]`, code, message);
  if (code === "23505") return { ok: false, error: "القيمة مستخدمة مسبقًا (مثل معرّف المحصول)." };
  if (code === "42501") return { ok: false, error: FORBIDDEN };
  return { ok: false, error: GENERIC };
}


export async function saveCropAction(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = adminCropSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  if (id && !uuidSchema.safeParse(id).success) return { ok: false, error: "المحصول غير موجود." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const v = parsed.data;
  const row = {
    slug: v.slug,
    name: v.name,
    other_names: v.otherNames,
    scientific_name: v.scientificName || null,
    category: v.category,
    life_cycle: v.lifeCycle,
    difficulty: v.difficulty,
    sun: v.sun,
    water: v.water,
    frost_sensitive: v.frostSensitive,
    propagation: v.propagation,
    primary_method: v.primaryMethod ?? null,
    flowering_note: v.floweringNote || null,
    harvest_note: v.harvestNote || null,
    first_yield_note: v.firstYieldNote || null,
    space_types: v.spaceTypes,
    growth_days_min: v.growthDaysMin,
    growth_days_max: v.growthDaysMax,
    growth_note: v.growthNote || null,
    summary: v.summary,
    watering_summary: v.wateringSummary || null,
    image_url: v.imageUrl || null,
    image_alt: v.imageAlt || null,
    data_status: v.dataStatus,
    source_note: v.sourceNote || null,
    is_published: v.isPublished,
    updated_by: ctx.user.id,
  };
  const q = id
    ? ctx.supabase.from("crops").update(row).eq("id", id).select("id").single()
    : ctx.supabase.from("crops").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return fail("crop:save", error.message, error.code);
  return { ok: true, data: { id: data.id as string } };
}

/** Replaces a crop's planting windows, task rules and guide sections. */
export async function saveCropRulesAction(cropId: string, raw: unknown): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(cropId).success) return { ok: false, error: "المحصول غير موجود." };
  const parsed = adminCropRulesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  const keys = parsed.data.templates.map((t) => t.key);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "مفاتيح قواعد المهام يجب ألا تتكرر." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { supabase } = ctx;
  const v = parsed.data;

  // Mark the crop as edited by an admin so the generated seed never overwrites it.
  {
    const { error } = await supabase.from("crops").update({ updated_by: ctx.user.id }).eq("id", cropId);
    if (error) return fail("rules:mark", error.message, error.code);
  }
  for (const table of ["crop_planting_windows", "crop_task_templates", "crop_guides"] as const) {
    const { error } = await supabase.from(table).delete().eq("crop_id", cropId);
    if (error) return fail(`rules:clear:${table}`, error.message, error.code);
  }
  if (v.windows.length) {
    const { error } = await supabase.from("crop_planting_windows").insert(
      v.windows.map((w, i) => ({
        crop_id: cropId,
        zone: w.zone,
        country_code: w.countryCode || null,
        start_month: w.startMonth,
        end_month: w.endMonth,
        method: w.method,
        note: w.note || null,
        source_id: w.sourceId || null,
        source_detail: w.sourceDetail || null,
        confidence: w.confidence,
        optional: w.optional,
        sort_order: i,
      })),
    );
    if (error) return fail("rules:windows", error.message, error.code);
  }
  if (v.templates.length) {
    const { error } = await supabase.from("crop_task_templates").insert(
      v.templates.map((t, i) => ({
        crop_id: cropId,
        key: t.key,
        type: t.type,
        title: t.title,
        description: t.description,
        offset_days: t.offsetDays,
        repeat_every_days: t.repeatEveryDays,
        until_offset_days: t.repeatEveryDays ? t.untilOffsetDays : null,
        active_months: t.activeMonths,
        sort_order: i,
      })),
    );
    if (error) return fail("rules:templates", error.message, error.code);
  }
  if (v.guide.length) {
    const { error } = await supabase
      .from("crop_guides")
      .insert(v.guide.map((g, i) => ({ crop_id: cropId, section: g.section, title: g.title, body: g.body, sort_order: i })));
    if (error) return fail("rules:guide", error.message, error.code);
  }
  return { ok: true, data: null };
}

export async function deleteCropAction(id: string): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "المحصول غير موجود." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { error } = await ctx.supabase.from("crops").delete().eq("id", id);
  if (error) return fail("crop:delete", error.message, error.code);
  return { ok: true, data: null };
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadCropImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file");
  const slug = String(formData.get("slug") ?? "");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "اختر صورة لرفعها." };
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return { ok: false, error: "احفظ معرّف المحصول أولًا." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { ok: false, error: "الصيغ المسموحة: JPG أو PNG أو WebP." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "حجم الصورة يجب ألا يتجاوز 5 ميغابايت." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${slug}/${Date.now()}.${ext}`;
  const { error } = await ctx.supabase.storage.from("crop-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return fail("image:upload", error.message);
  const { data } = ctx.supabase.storage.from("crop-images").getPublicUrl(path);
  return { ok: true, data: { url: data.publicUrl } };
}

export async function saveFaqAction(id: string | null, raw: unknown): Promise<ActionResult<null>> {
  const parsed = adminFaqSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  if (id && !uuidSchema.safeParse(id).success) return { ok: false, error: "السؤال غير موجود." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const v = parsed.data;
  const row = { question: v.question, answer: v.answer, sort_order: v.sortOrder, is_published: v.isPublished };
  const { error } = id ? await ctx.supabase.from("faqs").update(row).eq("id", id) : await ctx.supabase.from("faqs").insert(row);
  if (error) return fail("faq:save", error.message, error.code);
  return { ok: true, data: null };
}

export async function deleteFaqAction(id: string): Promise<ActionResult<null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "السؤال غير موجود." };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { error } = await ctx.supabase.from("faqs").delete().eq("id", id);
  if (error) return fail("faq:delete", error.message, error.code);
  return { ok: true, data: null };
}

export async function saveSettingsAction(raw: unknown): Promise<ActionResult<null>> {
  const parsed = adminSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { contactEmail, ...thresholds } = parsed.data;
  const { error } = await ctx.supabase.from("site_settings").upsert([
    { key: "weather_thresholds", value: thresholds, updated_by: ctx.user.id, updated_at: new Date().toISOString() },
    { key: "contact", value: { email: contactEmail }, updated_by: ctx.user.id, updated_at: new Date().toISOString() },
  ]);
  if (error) return fail("settings:save", error.message, error.code);
  return { ok: true, data: null };
}

export async function updateRegionZoneAction(raw: unknown): Promise<ActionResult<null>> {
  const parsed = adminRegionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { error } = await ctx.supabase.from("regions").update({ zone: parsed.data.zone }).eq("id", parsed.data.id);
  if (error) return fail("region:update", error.message, error.code);
  return { ok: true, data: null };
}

/* ---------- Reads for the admin screens ---------- */

export interface AdminStats {
  users: number;
  users_last_30_days: number;
  gardens: number;
  plantings: number;
  active_plantings: number;
  tasks: number;
  tasks_done: number;
  top_crops: { name: string; count: number }[];
  zones: { zone: string; count: number }[];
}

export async function getAdminStats(): Promise<ActionResult<AdminStats>> {
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase.rpc("admin_stats");
  if (error) return fail("stats", error.message, error.code);
  return { ok: true, data: data as AdminStats };
}

export interface AdminCropListItem {
  id: string;
  slug: string;
  name: string;
  category: Crop["category"];
  data_status: Crop["dataStatus"];
  is_published: boolean;
}

export async function listAdminCrops(): Promise<ActionResult<AdminCropListItem[]>> {
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase
    .from("crops")
    .select("id, slug, name, category, data_status, is_published")
    .order("name");
  if (error) return fail("crops:list", error.message, error.code);
  return { ok: true, data: data as AdminCropListItem[] };
}

export async function getAdminCrop(id: string): Promise<ActionResult<{ crop: Crop; published: boolean } | null>> {
  if (!uuidSchema.safeParse(id).success) return { ok: true, data: null };
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase.from("crops").select(CROP_SELECT).eq("id", id).maybeSingle();
  if (error) return fail("crop:get", error.message, error.code);
  if (!data) return { ok: true, data: null };
  const row = data as CropRow;
  return { ok: true, data: { crop: mapCropRow(row), published: row.is_published ?? true } };
}

export interface FaqRecord {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
}

export async function listAdminFaqs(): Promise<ActionResult<FaqRecord[]>> {
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase.from("faqs").select("id, question, answer, sort_order, is_published").order("sort_order");
  if (error) return fail("faqs:list", error.message, error.code);
  return { ok: true, data: data as FaqRecord[] };
}

export async function listAdminRegions(): Promise<ActionResult<{ id: string; name: string; zone: string; country_code: string }[]>> {
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase.from("regions").select("id, name, zone, country_code").order("sort_order");
  if (error) return fail("regions:list", error.message, error.code);
  return { ok: true, data: data as { id: string; name: string; zone: string; country_code: string }[] };
}

export async function getAdminSettings(): Promise<ActionResult<z.infer<typeof adminSettingsSchema>>> {
  const ctx = await adminCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? FORBIDDEN };
  const { data, error } = await ctx.supabase.from("site_settings").select("key, value");
  if (error) return fail("settings:get", error.message, error.code);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value as Record<string, unknown> | undefined;
  const th = { ...DEFAULT_THRESHOLDS, ...(get("weather_thresholds") ?? {}) };
  return { ok: true, data: { ...(th as typeof DEFAULT_THRESHOLDS), contactEmail: String(get("contact")?.email ?? "") } };
}
