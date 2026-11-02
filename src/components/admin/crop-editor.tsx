"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Plus, Save, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { deleteCropAction, saveCropAction, saveCropRulesAction, uploadCropImageAction } from "@/data-access/admin";
import { CropArt } from "@/components/brand/crop-art";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  CATEGORY_LABELS,
  CLIMATE_ZONE_LABELS,
  DATA_STATUS_LABELS,
  DIFFICULTY_LABELS,
  GUIDE_SECTION_LABELS,
  LIFE_CYCLE_LABELS,
  METHOD_LABELS,
  SPACE_TYPE_LABELS,
  SUN_LABELS,
  TASK_TYPE_LABELS,
  WATER_LABELS,
} from "@/domain/labels";
import { adminCropRulesSchema, adminCropSchema } from "@/domain/schemas";
import {
  CLIMATE_ZONES,
  CROP_CATEGORIES,
  DATA_STATUSES,
  DIFFICULTIES,
  GUIDE_SECTIONS,
  LIFE_CYCLES,
  FIELD_METHODS,
  PLANTING_METHODS,
  SPACE_TYPES,
  SUN_REQUIREMENTS,
  TASK_TYPES,
  WATER_NEEDS,
  type Crop,
} from "@/domain/types";
import { LEVANT_MONTHS } from "@/lib/format";

type CropForm = z.input<typeof adminCropSchema>;
type RulesForm = z.input<typeof adminCropRulesSchema>;

const numOrNull = (v: unknown) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function toCropForm(c: Crop | null, published: boolean): CropForm {
  return {
    slug: c?.slug ?? "",
    name: c?.name ?? "",
    otherNames: c?.otherNames ?? [],
    scientificName: c?.scientificName ?? "",
    category: c?.category ?? "fruiting_vegetable",
    lifeCycle: c?.lifeCycle ?? "annual",
    difficulty: c ? c.difficulty : "easy",
    sun: c ? c.sun : "full_sun",
    water: c ? c.water : "moderate",
    propagation: c?.propagation ?? [],
    primaryMethod: c?.primaryMethod && c.primaryMethod !== "nursery_sowing" ? c.primaryMethod : null,
    floweringNote: c?.floweringNote ?? "",
    harvestNote: c?.harvestNote ?? "",
    firstYieldNote: c?.firstYieldNote ?? "",
    frostSensitive: c?.frostSensitive ?? false,
    spaceTypes: c?.spaceTypes ?? ["home_garden"],
    growthDaysMin: c?.growthDaysMin ?? null,
    growthDaysMax: c?.growthDaysMax ?? null,
    growthNote: c?.growthNote ?? "",
    summary: c?.summary ?? "",
    wateringSummary: c?.wateringSummary ?? "",
    imageUrl: c?.imageUrl ?? "",
    imageAlt: c?.imageAlt ?? "",
    dataStatus: c?.dataStatus ?? "preliminary",
    sourceNote: c?.sourceNote ?? "",
    isPublished: published,
  };
}

export function CropEditor({ crop, cropId, published }: { crop: Crop | null; cropId: string | null; published: boolean }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<CropForm, unknown, z.output<typeof adminCropSchema>>({
    resolver: zodResolver(adminCropSchema),
    defaultValues: toCropForm(crop, published),
  });
  const { errors, isSubmitting } = form.formState;
  const imageUrl = useWatch({ control: form.control, name: "imageUrl" });
  const slug = useWatch({ control: form.control, name: "slug" });

  const rules = useForm<RulesForm, unknown, z.output<typeof adminCropRulesSchema>>({
    resolver: zodResolver(adminCropRulesSchema),
    defaultValues: {
      windows:
        crop?.windows.map((w) => ({
          ...w,
          note: w.note ?? "",
          countryCode: w.countryCode ?? "",
          sourceId: w.sourceId ?? "",
          sourceDetail: w.sourceDetail ?? "",
          confidence: w.confidence ?? ("documented" as const),
          optional: w.optional ?? false,
        })) ?? [],
      templates:
        crop?.templates.map((t) => ({
          key: t.key,
          type: t.type,
          title: t.title,
          description: t.description,
          offsetDays: t.offsetDays,
          repeatEveryDays: t.repeatEveryDays ?? null,
          untilOffsetDays: t.untilOffsetDays ?? null,
          activeMonths: t.activeMonths ?? [],
        })) ?? [],
      guide: crop?.guide ?? [],
    },
  });
  const windows = useFieldArray({ control: rules.control, name: "windows" });
  const templates = useFieldArray({ control: rules.control, name: "templates" });
  const guide = useFieldArray({ control: rules.control, name: "guide" });
  const rulesErrors = rules.formState.errors;

  async function upload(file: File) {
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return toast.error("أدخل المعرّف اللاتيني للمحصول أولًا.");
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("slug", slug);
    const res = await uploadCropImageAction(fd);
    setUploading(false);
    if (!res.ok) return toast.error(res.error);
    form.setValue("imageUrl", res.data.url, { shouldDirty: true });
    toast.success("تم رفع الصورة. احفظ بيانات المحصول لاعتمادها.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>البيانات الأساسية</CardTitle>
          <CardDescription>الحقول المعروضة في بطاقة المحصول وصفحته.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4 md:grid-cols-2"
            onSubmit={form.handleSubmit(async (v) => {
              const res = await saveCropAction(cropId, v);
              if (!res.ok) return void toast.error(res.error);
              toast.success("تم حفظ بيانات المحصول");
              if (!cropId) router.replace(`/admin/crops/edit?id=${res.data.id}`);
            })}
          >
            <Field label="اسم المحصول" htmlFor="name" error={errors.name?.message}>
              <Input id="name" aria-invalid={!!errors.name} {...form.register("name")} />
            </Field>
            <Field label="المعرّف اللاتيني (يظهر في الرابط)" htmlFor="slug" error={errors.slug?.message} hint="حروف لاتينية صغيرة وأرقام وشرطات، مثل: tomato">
              <Input id="slug" dir="ltr" aria-invalid={!!errors.slug} {...form.register("slug")} />
            </Field>
            <Field label="أسماء أخرى (مفصولة بفاصلة)" htmlFor="otherNames">
              <Input
                id="otherNames"
                defaultValue={(crop?.otherNames ?? []).join("، ")}
                onChange={(e) =>
                  form.setValue(
                    "otherNames",
                    e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
            </Field>
            <Field label="الاسم العلمي" htmlFor="scientificName">
              <Input id="scientificName" dir="ltr" {...form.register("scientificName")} />
            </Field>
            <Field label="التصنيف" htmlFor="category">
              <Select id="category" {...form.register("category")}>
                {CROP_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="دورة الحياة" htmlFor="lifeCycle">
              <Select id="lifeCycle" {...form.register("lifeCycle")}>
                {LIFE_CYCLES.map((c) => <option key={c} value={c}>{LIFE_CYCLE_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="مستوى الصعوبة" htmlFor="difficulty">
              <Select id="difficulty" {...form.register("difficulty", { setValueAs: (v) => v || null })}>
                <option value="">غير موثّق بعد</option>
                {DIFFICULTIES.map((c) => <option key={c} value={c}>{DIFFICULTY_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="احتياج الشمس" htmlFor="sun">
              <Select id="sun" {...form.register("sun", { setValueAs: (v) => v || null })}>
                <option value="">غير موثّق بعد</option>
                {SUN_REQUIREMENTS.map((c) => <option key={c} value={c}>{SUN_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="احتياج الري" htmlFor="water">
              <Select id="water" {...form.register("water", { setValueAs: (v) => v || null })}>
                <option value="">غير موثّق بعد</option>
                {WATER_NEEDS.map((c) => <option key={c} value={c}>{WATER_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="حالة البيانات" htmlFor="dataStatus" hint="لا تختر «مراجعة» إلا بعد مراجعة مختص.">
              <Select id="dataStatus" {...form.register("dataStatus")}>
                {DATA_STATUSES.map((c) => <option key={c} value={c}>{DATA_STATUS_LABELS[c]}</option>)}
              </Select>
            </Field>
            <Field label="أقل مدة نمو (يوم)" htmlFor="gmin" error={errors.growthDaysMin?.message}>
              <Input id="gmin" type="number" {...form.register("growthDaysMin", { setValueAs: numOrNull })} />
            </Field>
            <Field label="أقصى مدة نمو (يوم)" htmlFor="gmax" error={errors.growthDaysMax?.message} hint="اتركهما فارغين إن لم تتوفر بيانات موثوقة.">
              <Input id="gmax" type="number" {...form.register("growthDaysMax", { setValueAs: numOrNull })} />
            </Field>
            <fieldset className="md:col-span-2">
              <legend className="mb-2 text-sm font-semibold">المساحات المناسبة</legend>
              <div className="flex flex-wrap gap-3">
                {SPACE_TYPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox value={s} {...form.register("spaceTypes")} />
                    {SPACE_TYPE_LABELS[s]}
                  </label>
                ))}
              </div>
              {errors.spaceTypes ? <p role="alert" className="mt-1 text-sm text-danger">{errors.spaceTypes.message}</p> : null}
            </fieldset>
            <Field label="ملاحظة مدة النمو" htmlFor="growthNote" className="md:col-span-2">
              <Input id="growthNote" {...form.register("growthNote")} />
            </Field>
            <Field label="وصف مختصر" htmlFor="summary" className="md:col-span-2" error={errors.summary?.message}>
              <Textarea id="summary" aria-invalid={!!errors.summary} {...form.register("summary")} />
            </Field>
            <Field label="ملخص الري" htmlFor="wateringSummary" className="md:col-span-2">
              <Input id="wateringSummary" {...form.register("wateringSummary")} />
            </Field>
            <Field label="الطريقة الأكثر شيوعًا للزراعة في الأرض" htmlFor="primaryMethod" hint="تحدد الموعد الرئيسي المعروض للمزارع. البذر في المشتل ليس موعد زراعة.">
              <Select id="primaryMethod" {...form.register("primaryMethod", { setValueAs: (v) => v || null })}>
                <option value="">تلقائي (حسب طرق الإكثار)</option>
                {FIELD_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </Select>
            </Field>
            <Field label="موعد الإزهار" htmlFor="floweringNote" hint="اتركه فارغًا إن لم يتوفر مصدر.">
              <Input id="floweringNote" {...form.register("floweringNote")} />
            </Field>
            <Field label="موعد الحصاد أو القطاف" htmlFor="harvestNote">
              <Input id="harvestNote" {...form.register("harvestNote")} />
            </Field>
            <Field label="المدة حتى أول إنتاج (للأشجار)" htmlFor="firstYieldNote">
              <Input id="firstYieldNote" {...form.register("firstYieldNote")} />
            </Field>
            <Field label="مصدر المعلومات ودرجة الثقة" htmlFor="sourceNote" className="md:col-span-2">
              <Textarea id="sourceNote" {...form.register("sourceNote")} />
            </Field>

            <div className="flex flex-col gap-3 rounded-xl border border-border p-4 md:col-span-2 md:flex-row md:items-center">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg md:w-48">
                {imageUrl ? (
                  <Image src={imageUrl} alt="صورة المحصول" fill sizes="12rem" className="object-cover" />
                ) : (
                  <CropArt slug={slug || "default"} title="الرسم التوضيحي الافتراضي" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <p className="text-sm font-semibold">صورة المحصول</p>
                <p className="text-xs text-muted-foreground">JPG أو PNG أو WebP حتى 5 ميغابايت. عند عدم وجود صورة يظهر الرسم التوضيحي.</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-muted">
                    {uploading ? <Spinner /> : <ImageUp className="size-4" aria-hidden />} رفع صورة
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                  {imageUrl ? <Button size="sm" variant="ghost" onClick={() => form.setValue("imageUrl", "", { shouldDirty: true })}>إزالة الصورة</Button> : null}
                </div>
                <Field label="النص البديل للصورة" htmlFor="imageAlt">
                  <Input id="imageAlt" {...form.register("imageAlt")} />
                </Field>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <Checkbox {...form.register("frostSensitive")} /> حساس للصقيع (تظهر له تحذيرات الصقيع في الاقتراحات)
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <Checkbox {...form.register("isPublished")} /> منشور ويظهر للزوار
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner /> : <Save />} حفظ البيانات الأساسية</Button>
              {cropId ? (
                confirmDelete ? (
                  <span className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 text-sm text-danger">
                    حذف نهائي؟ ستبقى خطط المستخدمين بأسماء محاصيلها.
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        const res = await deleteCropAction(cropId);
                        setDeleting(false);
                        if (!res.ok) return void toast.error(res.error);
                        toast.success("تم حذف المحصول");
                        router.replace("/admin/crops");
                      }}
                    >
                      {deleting ? <Spinner /> : null} تأكيد الحذف
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>تراجع</Button>
                  </span>
                ) : (
                  <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> حذف المحصول</Button>
                )
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {cropId ? (
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={rules.handleSubmit(
            async (v) => {
              const res = await saveCropRulesAction(cropId, v);
              if (!res.ok) return void toast.error(res.error);
              toast.success("تم حفظ المواعيد والقواعد والإرشادات");
            },
            () => toast.error("توجد حقول غير صالحة في المواعيد أو القواعد أو الإرشادات."),
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle>مواعيد الزراعة حسب المنطقة</CardTitle>
              <CardDescription>تُستخدم لتقييم تاريخ الزراعة في مولّد الخطط وفي قسم «ماذا تزرع في كل فصل».</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {windows.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1.5fr_auto]">
                  <Select aria-label="المنطقة" {...rules.register(`windows.${i}.zone`, { setValueAs: (v) => v || null })}>
                    <option value="">عام للبلد كله (غير خاص بمنطقة)</option>
                    {CLIMATE_ZONES.map((z) => <option key={z} value={z}>{CLIMATE_ZONE_LABELS[z]}</option>)}
                  </Select>
                  <Select aria-label="من شهر" {...rules.register(`windows.${i}.startMonth`, { valueAsNumber: true })}>
                    {LEVANT_MONTHS.map((m, k) => <option key={m} value={k + 1}>من {m}</option>)}
                  </Select>
                  <Select aria-label="إلى شهر" {...rules.register(`windows.${i}.endMonth`, { valueAsNumber: true })}>
                    {LEVANT_MONTHS.map((m, k) => <option key={m} value={k + 1}>إلى {m}</option>)}
                  </Select>
                  <Select aria-label="الطريقة" {...rules.register(`windows.${i}.method`)}>
                    {PLANTING_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                  </Select>
                  <Select aria-label="درجة الموعد" {...rules.register(`windows.${i}.confidence`)}>
                    <option value="documented">موعد موثّق</option>
                    <option value="estimated">{f.optional ? "تقديري (عروة إضافية)" : "تقديري"}</option>
                  </Select>
                  <Input aria-label="ملاحظة" placeholder="ملاحظة (اختياري)" {...rules.register(`windows.${i}.note`)} />
                  <Button variant="danger-ghost" size="icon" aria-label="حذف الموعد" onClick={() => windows.remove(i)}><Trash2 /></Button>
                </div>
              ))}
              <Button variant="outline" className="self-start" onClick={() => windows.append({ zone: "highland", countryCode: "", startMonth: 3, endMonth: 4, method: "transplanting", note: "", sourceId: "", sourceDetail: "", confidence: "documented", optional: false })}>
                <Plus /> إضافة موعد
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قواعد توليد المهام</CardTitle>
              <CardDescription>
                «بعد الزراعة بـ» عدد الأيام من تاريخ الزراعة (القيم السالبة قبلها). للمهام المتكررة حدّد «كل كم يوم» و«حتى اليوم».
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {templates.fields.map((f, i) => {
                const e = rulesErrors.templates?.[i];
                return (
                  <div key={f.id} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-6">
                    <Input aria-label="المفتاح" dir="ltr" placeholder="key" {...rules.register(`templates.${i}.key`)} aria-invalid={!!e?.key} />
                    <Select aria-label="النوع" {...rules.register(`templates.${i}.type`)}>
                      {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
                    </Select>
                    <Input aria-label="العنوان" placeholder="عنوان المهمة" className="md:col-span-4" {...rules.register(`templates.${i}.title`)} aria-invalid={!!e?.title} />
                    <label className="flex flex-col gap-1 text-xs font-semibold">بعد الزراعة بـ (يوم)
                      <Input type="number" {...rules.register(`templates.${i}.offsetDays`, { valueAsNumber: true })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold">كل كم يوم (للتكرار)
                      <Input type="number" {...rules.register(`templates.${i}.repeatEveryDays`, { setValueAs: numOrNull })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold">حتى اليوم
                      <Input type="number" {...rules.register(`templates.${i}.untilOffsetDays`, { setValueAs: numOrNull })} aria-invalid={!!e?.untilOffsetDays} />
                    </label>
                    <Textarea aria-label="الوصف" placeholder="وصف المهمة" className="min-h-11 md:col-span-3" {...rules.register(`templates.${i}.description`)} />
                    {e ? <p role="alert" className="text-sm text-danger md:col-span-6">{e.key?.message ?? e.title?.message ?? e.untilOffsetDays?.message ?? "حقل غير صالح"}</p> : null}
                    <Button variant="danger-ghost" size="sm" className="self-start md:col-span-6 md:justify-self-end" onClick={() => templates.remove(i)}><Trash2 /> حذف القاعدة</Button>
                  </div>
                );
              })}
              <Button variant="outline" className="self-start" onClick={() => templates.append({ key: `rule-${templates.fields.length + 1}`, type: "care", title: "", description: "", offsetDays: 0, repeatEveryDays: null, untilOffsetDays: null, activeMonths: [] })}>
                <Plus /> إضافة قاعدة
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الإرشادات الزراعية</CardTitle>
              <CardDescription>أقسام صفحة المحصول. افصل الفقرات بسطر فارغ.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {guide.fields.map((f, i) => (
                <div key={f.id} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[12rem_1fr_auto]">
                  <Select aria-label="القسم" {...rules.register(`guide.${i}.section`)}>
                    {GUIDE_SECTIONS.map((s) => <option key={s} value={s}>{GUIDE_SECTION_LABELS[s]}</option>)}
                  </Select>
                  <Input aria-label="عنوان القسم" {...rules.register(`guide.${i}.title`)} />
                  <Button variant="danger-ghost" size="icon" aria-label="حذف القسم" onClick={() => guide.remove(i)}><Trash2 /></Button>
                  <Textarea aria-label="نص الإرشاد" className="min-h-28 md:col-span-3" {...rules.register(`guide.${i}.body`)} aria-invalid={!!rulesErrors.guide?.[i]?.body} />
                  {rulesErrors.guide?.[i]?.body ? <p role="alert" className="text-sm text-danger md:col-span-3">{rulesErrors.guide[i]?.body?.message}</p> : null}
                </div>
              ))}
              <Button variant="outline" className="self-start" onClick={() => guide.append({ section: "care", title: GUIDE_SECTION_LABELS.care, body: "" })}>
                <Plus /> إضافة قسم
              </Button>
            </CardContent>
          </Card>

          <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
            <Button type="submit" size="lg" className="shadow-lg" disabled={rules.formState.isSubmitting}>
              {rules.formState.isSubmitting ? <Spinner /> : <Save />} حفظ المواعيد والقواعد والإرشادات
            </Button>
          </div>
        </form>
      ) : (
        <Alert tone="info">احفظ البيانات الأساسية أولًا، ثم أضف مواعيد الزراعة وقواعد المهام والإرشادات.</Alert>
      )}
    </div>
  );
}
