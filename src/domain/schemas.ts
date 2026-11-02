/**
 * Zod schemas shared by client forms (React Hook Form) and server actions.
 * Every user-facing message is Arabic. Server actions must always re-parse
 * input with these schemas — client validation is only a convenience.
 */
import { z } from "zod";
import { isValidISODate } from "@/lib/dates";
import {
  CLIMATE_ZONES,
  CROP_CATEGORIES,
  DIFFICULTIES,
  GUIDE_SECTIONS,
  LIFE_CYCLES,
  PLANTING_METHODS,
  SPACE_TYPES,
  SUN_REQUIREMENTS,
  TASK_STATUSES,
  TASK_TYPES,
  WATER_NEEDS,
  DATA_STATUSES,
} from "./types";

z.config(z.locales.ar());

const isoDate = (msg = "أدخل تاريخًا صحيحًا") =>
  z.string({ error: msg }).refine((v) => isValidISODate(v), { error: msg });

const optionalNumber = (max: number, msg: string) =>
  z
    .union([z.number(), z.nan(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "number" && !Number.isNaN(v) ? v : null))
    .refine((v) => v === null || (v >= 0 && v <= max), { error: msg });

export const planRequestSchema = z.object({
  cropSlug: z.string({ error: "اختر محصولًا" }).min(1, { error: "اختر محصولًا" }).max(80),
  plantedOn: isoDate("اختر تاريخ زراعة صحيحًا"),
  zone: z.enum(CLIMATE_ZONES, { error: "اختر المنطقة المناخية" }),
  spaceType: z.enum(SPACE_TYPES, { error: "اختر نوع المساحة" }),
  regionId: z.string().max(80).nullable(),
  /** Reuse an existing garden (several crops in one plan). */
  gardenId: z.string().max(80).nullable().optional(),
  gardenName: z
    .string({ error: "أدخل اسمًا للمساحة" })
    .trim()
    .min(2, { error: "اسم المساحة قصير جدًا" })
    .max(60, { error: "اسم المساحة طويل جدًا (60 حرفًا كحد أقصى)" }),
  areaM2: optionalNumber(1_000_000, "أدخل مساحة صحيحة بالمتر المربع"),
  quantity: optionalNumber(100_000, "أدخل عددًا صحيحًا من النباتات"),
  notes: z.string().trim().max(500, { error: "الملاحظات طويلة جدًا (500 حرف كحد أقصى)" }).optional().default(""),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  /** Generated tasks dated before this day are stored as already completed (late plan entry). */
  completeBefore: isoDate().nullable().optional(),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const taskInputSchema = z.object({
  title: z
    .string({ error: "أدخل عنوان المهمة" })
    .trim()
    .min(2, { error: "عنوان المهمة قصير جدًا" })
    .max(120, { error: "عنوان المهمة طويل جدًا (120 حرفًا كحد أقصى)" }),
  description: z.string().trim().max(1000, { error: "الوصف طويل جدًا" }).optional().default(""),
  dueDate: isoDate("اختر تاريخًا صحيحًا للمهمة"),
  type: z.enum(TASK_TYPES, { error: "اختر نوع المهمة" }),
  plantingId: z.string().max(80).nullable().optional(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskPatchSchema = z
  .object({
    title: taskInputSchema.shape.title.optional(),
    description: z.string().trim().max(1000, { error: "الوصف طويل جدًا" }).optional(),
    dueDate: isoDate("اختر تاريخًا صحيحًا للمهمة").optional(),
    type: z.enum(TASK_TYPES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    postponedCount: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: "لا توجد تغييرات للحفظ" });
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const uuidSchema = z.uuid({ error: "معرّف غير صالح" });

const password = z
  .string({ error: "أدخل كلمة المرور" })
  .min(8, { error: "يجب ألا تقل كلمة المرور عن 8 أحرف" })
  .max(72, { error: "كلمة المرور طويلة جدًا" });

const fullName = z
  .string({ error: "أدخل اسمك" })
  .trim()
  .min(2, { error: "الاسم قصير جدًا" })
  .max(80, { error: "الاسم طويل جدًا" });

const email = z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا" }).max(254, { error: "البريد الإلكتروني طويل جدًا" });

export const loginSchema = z.object({
  email,
  password: z.string({ error: "أدخل كلمة المرور" }).min(1, { error: "أدخل كلمة المرور" }),
});

export const registerSchema = z
  .object({
    fullName,
    email,
    password,
    confirmPassword: z.string({ error: "أعد إدخال كلمة المرور" }),
    acceptTerms: z.literal(true, { error: "يجب الموافقة على شروط الاستخدام وسياسة الخصوصية" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password, confirmPassword: z.string({ error: "أعد إدخال كلمة المرور" }) })
  .refine((v) => v.password === v.confirmPassword, {
    error: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName,
  regionId: z.string().max(80).nullable(),
  zone: z.enum(CLIMATE_ZONES).nullable(),
  timezone: z.string().max(64),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export const notificationPrefsSchema = z.object({
  inAppEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0, { error: "قيمة غير صالحة" }).max(14, { error: "الحد الأقصى 14 يومًا" }),
});

/* ---------- Admin ---------- */

const month = z.number({ error: "اختر الشهر" }).int().min(1).max(12);

export const adminCropSchema = z
  .object({
    slug: z
      .string({ error: "أدخل المعرّف اللاتيني" })
      .trim()
      .regex(/^[a-z0-9-]{2,60}$/, { error: "المعرّف يجب أن يتكون من حروف لاتينية صغيرة وأرقام وشرطات فقط" }),
    name: z.string({ error: "أدخل اسم المحصول" }).trim().min(2, { error: "اسم المحصول قصير جدًا" }).max(60),
    otherNames: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    scientificName: z.string().trim().max(120).optional().default(""),
    category: z.enum(CROP_CATEGORIES, { error: "اختر التصنيف" }),
    lifeCycle: z.enum(LIFE_CYCLES),
    difficulty: z.enum(DIFFICULTIES).nullable(),
    sun: z.enum(SUN_REQUIREMENTS).nullable(),
    water: z.enum(WATER_NEEDS).nullable(),
    propagation: z.array(z.enum(PLANTING_METHODS)).max(PLANTING_METHODS.length).default([]),
    primaryMethod: z.enum(PLANTING_METHODS).exclude(["nursery_sowing"]).nullable().optional().default(null),
    floweringNote: z.string().trim().max(300).optional().default(""),
    harvestNote: z.string().trim().max(300).optional().default(""),
    firstYieldNote: z.string().trim().max(300).optional().default(""),
    frostSensitive: z.boolean().default(false),
    spaceTypes: z.array(z.enum(SPACE_TYPES)),
    growthDaysMin: z.number().int().min(1).max(3650).nullable(),
    growthDaysMax: z.number().int().min(1).max(3650).nullable(),
    growthNote: z.string().trim().max(300).optional().default(""),
    summary: z.string({ error: "أدخل وصفًا مختصرًا" }).trim().min(10, { error: "الوصف المختصر قصير جدًا" }).max(400),
    wateringSummary: z.string().trim().max(300).optional().default(""),
    imageUrl: z.union([z.url({ error: "رابط الصورة غير صالح" }), z.literal("")]).optional().default(""),
    imageAlt: z.string().trim().max(160).optional().default(""),
    dataStatus: z.enum(DATA_STATUSES),
    sourceNote: z.string().trim().max(600).optional().default(""),
    isPublished: z.boolean(),
  })
  .refine(
    (v) => (v.growthDaysMin === null) === (v.growthDaysMax === null),
    { error: "أدخل الحد الأدنى والأقصى لمدة النمو معًا أو اتركهما فارغين", path: ["growthDaysMax"] },
  )
  .refine((v) => v.growthDaysMin === null || v.growthDaysMax === null || v.growthDaysMin <= v.growthDaysMax, {
    error: "الحد الأدنى لمدة النمو يجب ألا يتجاوز الحد الأقصى",
    path: ["growthDaysMax"],
  });
export type AdminCropInput = z.infer<typeof adminCropSchema>;

export const adminWindowSchema = z.object({
  /** null = general date for the whole country (not zone-specific). */
  zone: z.enum(CLIMATE_ZONES).nullable(),
  countryCode: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal("")]).optional().default(""),
  startMonth: month,
  endMonth: month,
  method: z.enum(PLANTING_METHODS),
  note: z.string().trim().max(160).optional().default(""),
  /** Kept from the loaded window so an admin save does not drop the reference. */
  sourceId: z.union([z.string().regex(/^[a-z0-9-]{2,60}$/), z.literal("")]).optional().default(""),
  sourceDetail: z.string().trim().max(600).optional().default(""),
});

export const adminTemplateSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, { error: "مفتاح القاعدة غير صالح" }),
    type: z.enum(TASK_TYPES),
    title: z.string().trim().min(2, { error: "عنوان القاعدة قصير جدًا" }).max(120),
    description: z.string().trim().max(1000).default(""),
    offsetDays: z.number().int().min(-365).max(3650),
    repeatEveryDays: z.number().int().min(1).max(365).nullable(),
    untilOffsetDays: z.number().int().min(-365).max(3650).nullable(),
    activeMonths: z.array(month).max(12).default([]),
  })
  .refine((v) => v.repeatEveryDays === null || (v.untilOffsetDays !== null && v.untilOffsetDays >= v.offsetDays), {
    error: "حدد نهاية التكرار بعد بدايته",
    path: ["untilOffsetDays"],
  });

export const adminGuideSchema = z.object({
  section: z.enum(GUIDE_SECTIONS),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10, { error: "نص الإرشاد قصير جدًا" }).max(5000),
});

export const adminCropRulesSchema = z.object({
  windows: z.array(adminWindowSchema).max(40),
  templates: z.array(adminTemplateSchema).max(60),
  guide: z.array(adminGuideSchema).max(20),
});

export const adminFaqSchema = z.object({
  question: z.string().trim().min(5, { error: "السؤال قصير جدًا" }).max(200),
  answer: z.string().trim().min(5, { error: "الإجابة قصيرة جدًا" }).max(2000),
  sortOrder: z.number().int().min(0).max(1000),
  isPublished: z.boolean(),
});

export const adminSettingsSchema = z.object({
  contactEmail: z.union([email, z.literal("")]),
  frostTempC: z.number().min(-20).max(15),
  heatTempC: z.number().min(25).max(55),
  rainProbabilityPct: z.number().min(10).max(100),
  heavyRainMm: z.number().min(1).max(300),
  strongWindKmh: z.number().min(10).max(200),
});

export const adminRegionSchema = z.object({
  id: z.string().regex(/^[a-z]{2}-[a-z0-9-]{2,40}$/, { error: "معرّف المدينة غير صالح" }),
  zone: z.enum(CLIMATE_ZONES),
});
