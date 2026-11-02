"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  Fence,
  Flower,
  LayoutDashboard,
  Search,
  Sprout,
  Tent,
  Tractor,
  Trees,
  type LucideIcon,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CropArt } from "@/components/brand/crop-art";
import { useAppData } from "@/components/providers/app-data-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { LocationPicker } from "@/components/location/location-picker";
import { LocationSummary } from "@/components/location/location-summary";
import { searchCrops } from "@/domain/crop-search";
import {
  CLIMATE_ZONE_DESCRIPTIONS,
  CLIMATE_ZONE_LABELS,
  DIFFICULTY_LABELS,
  SPACE_TYPE_DESCRIPTIONS,
  SPACE_TYPE_LABELS,
  TASK_TYPE_LABELS,
} from "@/domain/labels";
import { generatePlan } from "@/domain/plan-generator";
import { countryOfLocation } from "@/domain/location";
import { mainWindowsForZone } from "@/domain/planting-windows";
import { isValidISODate, monthOf } from "@/lib/dates";
import { formatDate, formatMonthRange, formatNumber, monthName } from "@/lib/format";
import { CLIMATE_ZONES, SPACE_TYPES, type ClimateZone, type Crop, type SpaceType, type TaskType } from "@/domain/types";
import { cn } from "@/lib/utils";

const STEPS = ["الموقع", "المساحة", "المحصول", "التفاصيل", "الخطة"] as const;

const SPACE_ICONS: Record<SpaceType, LucideIcon> = {
  home_garden: Flower,
  rooftop: Building2,
  balcony: Warehouse,
  containers: Sprout,
  small_plot: Fence,
  farm: Tractor,
  greenhouse: Tent,
};

const detailsSchema = z.object({
  plantedOn: z.string().refine(isValidISODate, { error: "اختر تاريخ زراعة صحيحًا" }),
  gardenName: z.string().trim().min(2, { error: "اسم المساحة قصير جدًا" }).max(60, { error: "اسم المساحة طويل جدًا" }),
  areaM2: z.union([z.literal(""), z.coerce.number({ error: "أدخل رقمًا" }).min(0, { error: "أدخل مساحة صحيحة" }).max(1_000_000, { error: "المساحة كبيرة جدًا" })]),
  quantity: z.union([z.literal(""), z.coerce.number({ error: "أدخل رقمًا" }).int({ error: "أدخل عددًا صحيحًا" }).min(0, { error: "أدخل عددًا صحيحًا" }).max(100_000, { error: "العدد كبير جدًا" })]),
  notes: z.string().max(500, { error: "الملاحظات طويلة جدًا (500 حرف كحد أقصى)" }),
});
type Details = z.input<typeof detailsSchema>;

export function PlannerWizard(props: { crops: Crop[]; zoneOverrides?: Record<string, string> }) {
  // Wait for the browser so "today" and the saved location are the visitor's, not the build's.
  const { mode } = useAppData();
  if (mode === "loading") return <Skeleton className="h-[32rem] w-full rounded-2xl" />;
  return <PlannerWizardInner {...props} />;
}

function PlannerWizardInner({ crops, zoneOverrides = {} }: { crops: Crop[]; zoneOverrides?: Record<string, string> }) {
  const suggestedZone = (r: { id: string; zone: ClimateZone }) =>
    (CLIMATE_ZONES as readonly string[]).includes(zoneOverrides[r.id]) ? (zoneOverrides[r.id] as ClimateZone) : r.zone;
  const router = useRouter();
  const params = useSearchParams();
  const app = useAppData();
  const saved = app.location;
  const country = countryOfLocation(saved);

  const [step, setStep] = useState(0);
  // The confirmed location decides the default zone; the user can still pick another zone for this plan.
  const [zoneChoice, setZoneChoice] = useState<ClimateZone | null>(null);
  const [changingLocation, setChangingLocation] = useState(!saved);
  const zone: ClimateZone = zoneChoice ?? (saved ? (saved.zoneSource === "list" ? suggestedZone({ id: saved.regionId ?? "", zone: saved.zone }) : saved.zone) : "highland");
  const spaceParam = params.get("space");
  const [space, setSpace] = useState<SpaceType | null>(
    spaceParam && (SPACE_TYPES as readonly string[]).includes(spaceParam) ? (spaceParam as SpaceType) : null,
  );
  const preselected = params.get("crop");
  const [selected, setSelected] = useState<string[]>(
    preselected && crops.some((c) => c.slug === preselected) ? [preselected] : [],
  );
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ crops: string[]; tasks: number } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [completePast, setCompletePast] = useState(true);

  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    mode: "onTouched",
    defaultValues: { plantedOn: app.today, gardenName: "حديقتي", areaM2: "", quantity: "", notes: "" },
  });
  const plantedOn = useWatch({ control: form.control, name: "plantedOn" });
  const selectedCrops = useMemo(() => crops.filter((c) => selected.includes(c.slug)), [crops, selected]);

  const plans = useMemo(() => {
    if (!space || !isValidISODate(plantedOn)) return [];
    return selectedCrops.map((crop) => ({ crop, plan: generatePlan({ crop, plantedOn, zone, spaceType: space, country }) }));
  }, [selectedCrops, plantedOn, zone, space, country]);

  const visibleCrops = useMemo(() => {
    return query.trim() ? searchCrops(crops, query) : crops;
  }, [crops, query]);

  async function next() {
    setStepError(null);
    if (step === 0 && !saved) return setStepError("حدّد موقع أرضك وأكّده أولًا.");
    if (step === 1 && !space) return setStepError("اختر نوع المساحة الزراعية.");
    if (step === 2 && selected.length === 0) return setStepError("اختر محصولًا واحدًا على الأقل.");
    if (step === 3 && !(await form.trigger())) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!space || !saved) return;
    const v = detailsSchema.parse(form.getValues());
    setSubmitting(true);
    let gardenId: string | null = null;
    let total = 0;
    const createdNames: string[] = [];
    for (const { crop, plan } of plans) {
      const res = await app.createPlan(
        {
          cropSlug: crop.slug,
          plantedOn: v.plantedOn,
          zone,
          spaceType: space,
          regionId: saved.regionId,
          gardenId,
          gardenName: v.gardenName,
          areaM2: v.areaM2 === "" ? null : v.areaM2,
          quantity: v.quantity === "" ? null : v.quantity,
          notes: v.notes,
          latitude: saved.latitude,
          longitude: saved.longitude,
          completeBefore: completePast && v.plantedOn < app.today ? app.today : null,
        },
        crop,
      );
      if (!res.ok) {
        setSubmitting(false);
        toast.error(createdNames.length ? `${res.error} (تم إنشاء خطة: ${createdNames.join("، ")})` : res.error);
        return;
      }
      gardenId = res.data.gardenId;
      total += plan.tasks.length;
      createdNames.push(crop.name);
    }
    setSubmitting(false);
    setDone({ crops: createdNames, tasks: total });
    toast.success("تم إنشاء خطتك الزراعية بنجاح");
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-2xl border border-border bg-surface p-8 text-center shadow-md">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <CalendarCheck2 className="size-8" aria-hidden />
        </span>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold">خطتك جاهزة</h2>
          <p className="text-muted-foreground">
            أضفنا {formatNumber(done.tasks)} مهمة لـ{done.crops.join(" و")} إلى رزنامتك
            {app.mode === "remote" ? " وحفظناها في حسابك." : "، وحفظناها في هذا المتصفح."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push(`/calendar?date=${plantedOn}`)}>
            <CalendarCheck2 /> عرض المهام في الرزنامة
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <LayoutDashboard /> لوحة التحكم
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDone(null);
              setSelected([]);
              setStep(2);
            }}
          >
            خطة لمحصول آخر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Stepper */}
      <nav aria-label="خطوات إنشاء الخطة">
        <ol className="flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:sticky lg:top-24 lg:flex-col">
          {STEPS.map((label, i) => (
            <li key={label} className="shrink-0">
              <button
                type="button"
                disabled={i > step}
                onClick={() => i < step && setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-semibold transition-colors disabled:cursor-default",
                  i === step ? "bg-surface text-brand-700 shadow-xs ring-1 ring-border" : "text-muted-foreground",
                  i < step && "hover:bg-surface",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                    i < step && "border-primary bg-primary text-primary-foreground",
                    i === step && "border-primary text-primary",
                    i > step && "border-border-strong",
                  )}
                >
                  {i < step ? <Check className="size-4" aria-hidden /> : formatNumber(i + 1)}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-7">
        <p className="text-sm font-semibold text-subtle-foreground">
          الخطوة {formatNumber(step + 1)} من {formatNumber(STEPS.length)}
        </p>

        {step === 0 && (
          <section aria-labelledby="s-location" className="flex flex-col gap-5">
            <div>
              <h2 id="s-location" className="text-2xl font-extrabold">أين ستزرع؟</h2>
              <p className="mt-1 text-muted-foreground">نستخدم موقع أرضك الحقيقي لتحديد المنطقة المناخية ومواعيد الزراعة والطقس.</p>
            </div>
            {saved && !changingLocation ? (
              <div className="flex flex-col gap-3">
                <LocationSummary />
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setChangingLocation(true)}>
                  تغيير الموقع هنا
                </Button>
              </div>
            ) : (
              <LocationPicker
                showIntro={false}
                startInEdit
                onConfirmed={() => {
                  setChangingLocation(false);
                  setZoneChoice(null);
                }}
              />
            )}
            {saved && !changingLocation ? (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-semibold">المنطقة المناخية لهذه الخطة</legend>
                <p className="-mt-1 text-xs leading-6 text-subtle-foreground">
                  اخترنا منطقة موقعك المحفوظ. غيّرها لهذه الخطة فقط إن كانت أرض هذه الزراعة في ظروف مختلفة.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CLIMATE_ZONES.map((z) => (
                    <label
                      key={z}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                        zone === z ? "border-primary bg-accent/50" : "border-border hover:bg-surface-muted",
                      )}
                    >
                      <input type="radio" name="zone" value={z} checked={zone === z} onChange={() => setZoneChoice(z)} className="mt-1.5 accent-[var(--primary)]" />
                      <span>
                        <span className="block font-semibold">
                          {CLIMATE_ZONE_LABELS[z]}
                          {saved.zone === z ? <Badge className="ms-2">منطقة موقعك</Badge> : null}
                        </span>
                        <span className="block text-xs leading-6 text-muted-foreground">{CLIMATE_ZONE_DESCRIPTIONS[z]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="s-space" className="flex flex-col gap-5">
            <div>
              <h2 id="s-space" className="text-2xl font-extrabold">ما نوع مساحتك الزراعية؟</h2>
              <p className="mt-1 text-muted-foreground">نوع المساحة يؤثر في اختيار المحاصيل ومواعيد متابعة الري.</p>
            </div>
            <div role="radiogroup" aria-labelledby="s-space" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SPACE_TYPES.map((s) => {
                const Icon = SPACE_ICONS[s];
                const active = space === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSpace(s)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-start transition-all",
                      active ? "border-primary bg-accent/50 ring-1 ring-primary" : "border-border hover:border-border-strong hover:bg-surface-muted",
                    )}
                  >
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-surface-muted text-brand-600")}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-bold">{SPACE_TYPE_LABELS[s]}</span>
                      <span className="block text-sm text-muted-foreground">{SPACE_TYPE_DESCRIPTIONS[s]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="s-crop" className="flex flex-col gap-5">
            <div>
              <h2 id="s-crop" className="text-2xl font-extrabold">ماذا تريد أن تزرع؟</h2>
              <p className="mt-1 text-muted-foreground">يمكنك اختيار أكثر من محصول، وسننشئ لكل محصول مهامه الخاصة.</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
              <Input type="search" aria-label="ابحث عن محصول" placeholder="ابحث عن محصول" value={query} onChange={(e) => setQuery(e.target.value)} className="ps-11" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleCrops.map((c) => {
                const active = selected.includes(c.slug);
                const thisMonth = monthOf(app.today);
                const ws = mainWindowsForZone(c, zone, country);
                const suitable = space ? c.spaceTypes.length === 0 || c.spaceTypes.includes(space) : true;
                const nowOk = ws.some((w) => (w.startMonth <= w.endMonth ? thisMonth >= w.startMonth && thisMonth <= w.endMonth : thisMonth >= w.startMonth || thisMonth <= w.endMonth));
                return (
                  <button
                    key={c.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected((s) => (active ? s.filter((x) => x !== c.slug) : [...s, c.slug]))}
                    className={cn(
                      "relative flex flex-col overflow-hidden rounded-xl border text-start transition-all",
                      active ? "border-primary ring-2 ring-primary" : "border-border hover:border-border-strong",
                    )}
                  >
                    <span className="aspect-[4/3] w-full">
                      <CropArt slug={c.slug} />
                    </span>
                    {active ? (
                      <span className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="size-4" aria-hidden />
                      </span>
                    ) : null}
                    <span className="flex flex-col gap-1 p-3">
                      <span className="font-bold">{c.name}</span>
                      {c.difficulty ? <span className="text-xs text-muted-foreground">{DIFFICULTY_LABELS[c.difficulty]}</span> : null}
                      {nowOk ? <span className="text-xs font-semibold text-brand-600">موسمه الآن في منطقتك</span> : null}
                      {!suitable ? <span className="text-xs font-semibold text-warning">غير مناسب عادةً لـ{SPACE_TYPE_LABELS[space!]}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {visibleCrops.length === 0 ? <p className="text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة.</p> : null}
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="s-details" className="flex flex-col gap-5">
            <div>
              <h2 id="s-details" className="text-2xl font-extrabold">تفاصيل الزراعة</h2>
              <p className="mt-1 text-muted-foreground">
                تاريخ زراعة النبات في مكانه النهائي (بذر البذور في الأرض، أو زراعة الأشتال الجاهزة، أو غرس الغرسة) هو الأساس الذي نحسب منه كل المواعيد، وليس تاريخ بذره في المشتل.
              </p>
            </div>
            <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => e.preventDefault()}>
              <Field
                label="تاريخ الزراعة في الأرض"
                htmlFor="plantedOn"
                error={form.formState.errors.plantedOn?.message}
                hint={isValidISODate(plantedOn) ? formatDate(plantedOn, { weekday: true }) : undefined}
              >
                <Input id="plantedOn" type="date" aria-invalid={!!form.formState.errors.plantedOn} {...form.register("plantedOn")} />
              </Field>
              <Field label="اسم المساحة" htmlFor="gardenName" error={form.formState.errors.gardenName?.message} hint="مثال: حديقة البيت، سطح العمارة">
                <Input id="gardenName" aria-invalid={!!form.formState.errors.gardenName} {...form.register("gardenName")} />
              </Field>
              <Field label="المساحة التقريبية (متر مربع) — اختياري" htmlFor="areaM2" error={form.formState.errors.areaM2?.message}>
                <Input id="areaM2" type="number" inputMode="decimal" min={0} step="any" aria-invalid={!!form.formState.errors.areaM2} {...form.register("areaM2")} />
              </Field>
              <Field label="عدد النباتات — اختياري" htmlFor="quantity" error={form.formState.errors.quantity?.message}>
                <Input id="quantity" type="number" inputMode="numeric" min={0} aria-invalid={!!form.formState.errors.quantity} {...form.register("quantity")} />
              </Field>
              <Field label="ملاحظات — اختياري" htmlFor="notes" className="sm:col-span-2" error={form.formState.errors.notes?.message}>
                <Textarea id="notes" placeholder="مثل الصنف، أو نوع التربة، أو مصدر الأشتال" {...form.register("notes")} />
              </Field>
            </form>
            {isValidISODate(plantedOn) ? (
              <ul className="flex flex-col gap-2">
                {selectedCrops.map((c) => {
                  const fit = plans.find((p) => p.crop.slug === c.slug)?.plan.windowFit;
                  const ws = mainWindowsForZone(c, zone, country);
                  return (
                    <li key={c.slug} className={cn("rounded-xl border p-3 text-sm", fit === "in_window" ? "border-success/20 bg-success-soft" : "border-warning-border bg-warning-soft")}>
                      <span className="font-bold">{c.name}: </span>
                      {fit === "in_window" && `شهر ${monthName(monthOf(plantedOn))} ضمن المواعيد المقترحة لمنطقتك.`}
                      {fit === "near_window" && "التاريخ قريب من حافة الموعد المقترح لمنطقتك."}
                      {fit === "outside_window" && "التاريخ خارج المواعيد المقترحة لمنطقتك."}
                      {fit === "no_data" && "لا تتوفر مواعيد مقترحة لمنطقتك."}
                      {ws.length && fit !== "in_window" ? ` المقترح: ${ws.map((w) => formatMonthRange(w.startMonth, w.endMonth)).join(" أو ")}.` : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        )}

        {step === 4 && space && saved && (
          <section aria-labelledby="s-plan" className="flex flex-col gap-5">
            <div>
              <h2 id="s-plan" className="text-2xl font-extrabold">راجع خطتك</h2>
              <p className="mt-1 text-muted-foreground">
                {saved?.label} · {CLIMATE_ZONE_LABELS[zone]} · {SPACE_TYPE_LABELS[space]} · زراعة في {formatDate(plantedOn)}
              </p>
            </div>
            {plans.map(({ crop, plan }) => {
              const counts = plan.tasks.reduce<Partial<Record<TaskType, number>>>((acc, t) => ({ ...acc, [t.type]: (acc[t.type] ?? 0) + 1 }), {});
              const milestones = plan.tasks.filter((t) => t.type !== "irrigation" && t.type !== "pest_check").slice(0, 6);
              return (
                <article key={crop.slug} className="overflow-hidden rounded-xl border border-border">
                  <header className="flex items-center gap-3 border-b border-border bg-surface-muted p-4">
                    <span className="size-12 shrink-0 overflow-hidden rounded-lg">
                      <CropArt slug={crop.slug} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{crop.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(plan.tasks.length)} مهمة
                        {plan.expectedHarvestStart && plan.expectedHarvestEnd
                          ? ` · الحصاد المتوقع تقريبًا بين ${formatDate(plan.expectedHarvestStart, { year: false })} و${formatDate(plan.expectedHarvestEnd, { year: false })}`
                          : " · لا يوجد موعد حصاد محدد"}
                      </p>
                    </div>
                  </header>
                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-bold">أبرز المحطات</p>
                      <ol className="space-y-1.5 text-sm">
                        {milestones.map((t) => (
                          <li key={t.templateKey} className="flex justify-between gap-3">
                            <span className="truncate">{t.title}</span>
                            <span className="shrink-0 text-muted-foreground">{formatDate(t.dueDate, { year: false })}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-bold">توزيع المهام</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(counts).map(([type, n]) => (
                          <Badge key={type} variant="neutral">
                            {TASK_TYPE_LABELS[type as TaskType]}: {formatNumber(n ?? 0)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  {plan.warnings.length ? (
                    <ul className="space-y-1 border-t border-border bg-warning-soft/60 p-4 text-sm leading-7 text-foreground/85">
                      {plan.warnings.map((w) => (
                        <li key={w} className="flex gap-2">
                          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-warning" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
            {plantedOn < app.today && plans.some(({ plan }) => plan.tasks.some((t) => t.dueDate < app.today)) ? (
              <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-4 text-sm leading-7">
                <input type="checkbox" className="mt-1.5 accent-[var(--primary)]" checked={completePast} onChange={(e) => setCompletePast(e.target.checked)} />
                <span>
                  <span className="block font-semibold">تاريخ الزراعة في الماضي</span>
                  اعتبر المهام الواقعة قبل اليوم ({formatNumber(plans.reduce((n, { plan }) => n + plan.tasks.filter((t) => t.dueDate < app.today).length, 0))} مهمة) مكتملة، حتى لا تظهر كمتأخرة.
                </span>
              </label>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {app.mode === "remote"
                ? "ستُحفظ الخطة في حسابك، ويمكنك تعديل أي مهمة أو حذفها أو إضافة مهام خاصة لاحقًا."
                : "ستُحفظ الخطة في هذا المتصفح فقط، ويمكنك تعديل أي مهمة أو حذفها أو إضافة مهام خاصة لاحقًا."}
            </p>
          </section>
        )}

        {stepError ? <Alert tone="danger">{stepError}</Alert> : null}

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={back} disabled={step === 0 || submitting}>
            <ArrowRight /> السابق
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              التالي <ArrowLeft />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || plans.length === 0 || app.mode === "loading"}>
              {submitting ? <Spinner /> : <Trees />} {submitting ? "جارٍ إنشاء الخطة…" : "أنشئ الخطة"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
