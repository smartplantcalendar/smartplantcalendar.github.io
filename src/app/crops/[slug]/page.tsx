import { ArrowLeft, CalendarRange, Clock3, Droplets, ExternalLink, Flower2, Home, Info, Sprout, Sun, Wheat } from "lucide-react";
import { absoluteUrl } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CropImage } from "@/components/brand/crop-image";
import { PlantingStatus } from "@/components/crops/planting-status";
import { findSource, sourcesForCrop } from "@/data/crop-sources";
import { otherMeanings } from "@/domain/ambiguous-names";
import { isPlannable } from "@/domain/crop-search";
import { fieldMethods, isFieldWindow, plantingTitle, primaryMethod, propagationMethods } from "@/domain/planting-windows";
import { PlantingWindowsTable } from "@/components/crops/planting-windows-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CATEGORY_LABELS,
  DATA_STATUS_LABELS,
  DIFFICULTY_LABELS,
  GUIDE_SECTION_LABELS,
  LIFE_CYCLE_LABELS,
  METHOD_LABELS,
  SPACE_TYPE_LABELS,
  SUN_LABELS,
  WATER_LABELS,
} from "@/domain/labels";
import { formatNumber } from "@/lib/format";
import { getCropBySlug, getCrops } from "@/services/crops";


// Static export: only crops known at build time get pages (rebuild to add new ones).
export const dynamicParams = false;

export async function generateStaticParams() {
  const { crops } = await getCrops();
  return crops.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const crop = await getCropBySlug(slug);
  if (!crop) return { title: "المحصول غير موجود" };
  return {
    title: `زراعة ${crop.name}: المواعيد والعناية والحصاد`,
    description:
      crop.dataStatus === "incomplete"
        ? `${crop.name}: أسماؤه الأخرى وتصنيفه. مواعيد زراعته في فلسطين غير موثّقة بعد.`
        : `${crop.summary} مواعيد زراعة ${crop.name} حسب المنطقة المناخية، واحتياجات الري والشمس، والمشكلات الشائعة.`,
    alternates: { canonical: absoluteUrl(`/crops/${crop.slug}`) },
    // Thin, name-only pages stay out of search results until they are documented.
    ...(crop.dataStatus === "incomplete" ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CropDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const crop = await getCropBySlug(slug);
  if (!crop) notFound();

  const plannable = isPlannable(crop);
  const usedSources = [...new Set(crop.windows.map((w) => w.sourceId).filter((id): id is string => Boolean(id)))]
    .map((id) => findSource(id))
    .filter((src) => src !== undefined);
  const references = sourcesForCrop(crop.slug).filter((r) => r.status === "to_review");
  const notDocumented = "غير موثّق بعد";
  const primary = primaryMethod(crop);
  const title = plantingTitle(crop, primary);
  const methods = fieldMethods(crop);
  // Secondary propagation (cuttings next to a ready plant, nursery sowing) is
  // producing the plant yourself: never shown as the planting date.
  const secondary = propagationMethods(crop);
  const fieldWindows = crop.windows.filter((w) => isFieldWindow(w) && !secondary.includes(w.method));
  const nurseryWindows = crop.windows.filter((w) => !isFieldWindow(w));
  const cuttingWindows = crop.windows.filter((w) => w.method === "cuttings" && secondary.includes("cuttings"));
  const secondaryCuttings = secondary.includes("cuttings");
  const usesSeedlings = methods.includes("transplanting") || nurseryWindows.length > 0 || secondary.includes("nursery_sowing");
  // Which "do it yourself" section the crop gets, if any.
  const selfKind: "seedlings" | "saplings" | "offshoots" | null =
    primary === "offshoots" ? "offshoots" : primary === "saplings" && secondaryCuttings ? "saplings" : usesSeedlings || secondaryCuttings ? "seedlings" : null;
  const perennial = crop.lifeCycle === "perennial";
  // Planting, flowering, harvest and first yield are separate facts.
  const harvestValue =
    crop.growthDaysMin != null && crop.growthDaysMax != null
      ? `أول حصاد أو قطاف بعد نحو ${formatNumber(crop.growthDaysMin)}–${formatNumber(crop.growthDaysMax)} يومًا من الزراعة في الأرض`
      : (crop.harvestNote ?? notDocumented);
  const facts: { icon: typeof Sun; label: string; value: string; note?: string; testId?: string }[] = [
    { icon: Sprout, label: "طرق الزراعة في الأرض", value: methods.length ? methods.map((m) => METHOD_LABELS[m]).join("، ") : notDocumented, testId: "fact-methods" },
    { icon: Sun, label: "الشمس", value: crop.sun ? SUN_LABELS[crop.sun] : notDocumented },
    { icon: Droplets, label: "الري", value: crop.wateringSummary || (crop.water ? `احتياج ${WATER_LABELS[crop.water]}` : notDocumented) },
    { icon: Flower2, label: "موعد الإزهار", value: crop.floweringNote ?? notDocumented, testId: "fact-flowering" },
    ...(perennial
      ? [
          { icon: Clock3, label: "المدة حتى أول إنتاج", value: crop.firstYieldNote ?? notDocumented, testId: "fact-first-yield" },
          { icon: Wheat, label: "موسم الحصاد أو القطاف", value: crop.harvestNote ?? notDocumented, testId: "fact-harvest" },
        ]
      : [{ icon: Wheat, label: "الحصاد أو القطاف", value: harvestValue, note: crop.growthDaysMin != null ? crop.growthNote : undefined, testId: "fact-harvest" }]),
    { icon: Home, label: "المساحات المناسبة", value: crop.spaceTypes.length ? crop.spaceTypes.map((s) => SPACE_TYPE_LABELS[s]).join("، ") : notDocumented },
  ];

  return (
    <article className="container-page py-8 sm:py-12">
      <nav aria-label="مسار التنقل" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-brand-700">الرئيسية</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/crops" className="hover:text-brand-700">دليل المحاصيل</Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-semibold text-foreground">{crop.name}</li>
        </ol>
      </nav>

      <header className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge>{CATEGORY_LABELS[crop.category]}</Badge>
            <Badge variant="outline">{LIFE_CYCLE_LABELS[crop.lifeCycle]}</Badge>
            {crop.difficulty ? <Badge variant="info">صعوبة: {DIFFICULTY_LABELS[crop.difficulty]}</Badge> : null}
            <Badge variant={crop.dataStatus === "reviewed" ? "solid" : "warning"}>{DATA_STATUS_LABELS[crop.dataStatus]}</Badge>
          </div>
          <div>
            <h1 className="text-4xl font-extrabold">{crop.name}</h1>
            <p className="mt-1 text-sm text-subtle-foreground">
              {crop.otherNames?.length ? `يُعرف أيضًا باسم: ${crop.otherNames.join("، ")}` : null}
              {crop.scientificName ? (
                <>
                  {crop.otherNames?.length ? " · " : ""}
                  <span dir="ltr" className="italic">{crop.scientificName}</span>
                </>
              ) : null}
            </p>
          </div>
          <p className="text-lg leading-8 text-muted-foreground">{crop.summary}</p>
          {otherMeanings(crop.slug).map((m) => (
            <p key={m.name} className="rounded-xl bg-info-soft px-4 py-2.5 text-sm text-info" data-testid="other-meaning">
              اسم «{m.name}» يُطلق أيضًا على:{" "}
              {m.others.map((o, i) => (
                <span key={o.slug}>
                  {i ? "، " : ""}
                  <Link href={`/crops/${o.slug}`} className="font-bold underline underline-offset-4">{o.hint.split(":")[0]}</Link>
                </span>
              ))}
            </p>
          ))}
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <p className="mb-2 text-base font-extrabold" data-testid="planting-title">{title}</p>
            <p className="mb-2 text-xs text-muted-foreground">في منطقتك، باستخدام {primary ? METHOD_LABELS[primary].replace(" في الأرض", "") : "الطريقة المعتادة"}</p>
            <PlantingStatus crop={crop} />
          </div>
          <div className="flex flex-wrap gap-3">
            {plannable ? (
              <Button asChild size="lg">
                <Link href={`/planner?crop=${crop.slug}`}>
                  أنشئ خطة زراعة {crop.name} <ArrowLeft />
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="lg">
              <a href="#windows">{title}</a>
            </Button>
          </div>
          {plannable ? null : (
            <p className="text-sm text-muted-foreground">لا يمكن إنشاء خطة لهذا المحصول بعد، لأن مواعيد زراعته غير موثّقة.</p>
          )}
        </div>
        <CropImage crop={crop} priority sizes="(max-width: 1024px) 100vw, 45vw" className="aspect-[4/3] rounded-2xl border border-border shadow-md" />
      </header>

      <section aria-label="معلومات سريعة" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-surface p-4 shadow-xs" data-testid={f.testId}>
            <f.icon className="mb-2 size-5 text-brand-600" aria-hidden />
            <p className="text-xs font-semibold text-subtle-foreground">{f.label}</p>
            <p className="mt-1 font-semibold leading-7">{f.value}</p>
            {f.note ? <p className="mt-1 text-xs leading-6 text-muted-foreground">{f.note}</p> : null}
          </div>
        ))}
      </section>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-12">
          <section id="windows" aria-labelledby="windows-title" className="scroll-mt-24">
            <h2 id="windows-title" className="mb-2 flex items-center gap-2 text-2xl font-extrabold">
              <CalendarRange className="size-6 text-brand-600" aria-hidden /> {title} حسب المنطقة
            </h2>
            <p className="mb-4 text-sm leading-7 text-muted-foreground">
              هذه مواعيد الزراعة في المكان النهائي (الأرض أو الحديقة أو الأصيص) باستخدام بذور أو أشتال أو غراس جاهزة. تقديرات أولية عامة، والأشهر بأسمائها الشامية.
            </p>
            {fieldWindows.length === 0 ? (
              <Alert tone="info" title="لا توجد معلومات موثوقة كافية">
                لم نوثّق بعد {title} في أي منطقة من مناطق فلسطين، ولن نعرض موعدًا تقديريًا دون مصدر. اسأل الإرشاد الزراعي في منطقتك.
              </Alert>
            ) : (
              <div className="flex flex-col gap-6">
                {methods
                  .filter((m) => fieldWindows.some((w) => w.method === m))
                  .map((m) => (
                    <div key={m} className="flex flex-col gap-2" data-testid={`method-${m}`}>
                      <h3 className="font-bold">
                        {METHOD_LABELS[m]}
                        {m === primary ? <span className="ms-2 text-sm font-semibold text-brand-700">(الطريقة الأكثر شيوعًا)</span> : null}
                      </h3>
                      <PlantingWindowsTable windows={fieldWindows.filter((w) => w.method === m)} caption={`${plantingTitle(crop, m)} حسب المنطقة المناخية`} />
                    </div>
                  ))}
                {methods.filter((m) => !fieldWindows.some((w) => w.method === m)).length ? (
                  <p className="text-sm text-muted-foreground">
                    طرق أخرى ممكنة دون مواعيد موثّقة بعد:{" "}
                    {methods
                      .filter((m) => !fieldWindows.some((w) => w.method === m))
                      .map((m) => METHOD_LABELS[m])
                      .join("، ")}
                    .
                  </p>
                ) : null}
              </div>
            )}

            {selfKind ? (
              <details
                className="mt-6 rounded-xl border border-border bg-surface-muted p-4"
                data-testid={selfKind === "seedlings" ? "nursery-section" : "propagation-section"}
              >
                <summary className="cursor-pointer font-bold">
                  {selfKind === "seedlings" ? "لمن يريد تجهيز الأشتال بنفسه" : selfKind === "saplings" ? "لمن يريد إكثار الغرسة بنفسه" : "لمن يريد إكثار الفسائل بنفسه"}
                </summary>
                <div className="mt-3 flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
                  {selfKind === "offshoots" ? (
                    <p data-testid="offshoot-note">
                      الموعد المقصود أعلاه هو زراعة فسيلة جاهزة متجذرة في الأرض. أما فصل الفسائل عن النبتة الأم وتجذيرها فهو إكثار، وموعده ليس موعد زراعة الفسيلة الجاهزة، ولا نحسب أحدهما من الآخر.
                    </p>
                  ) : null}
                  {selfKind === "saplings" ? (
                    <p data-testid="cuttings-note">
                      الطريقة الافتراضية هي شراء غرسة جاهزة وغرسها في الأرض. أخذ العُقَل وتجذيرها طريقة لإنتاج الغرسة بنفسك، وموعدها ليس موعد غرس الشجرة الجاهزة، ولا نستعمله في «ماذا أزرع الآن؟» ولا في الخطط.
                    </p>
                  ) : null}
                  {selfKind === "seedlings" && usesSeedlings ? (
                    <p>بذر البذور في المشتل يسبق الزراعة في الأرض بأسابيع، وليس موعد الزراعة المعروض أعلاه. لا نستعمله في «ماذا أزرع الآن؟» ولا في الخطط.</p>
                  ) : null}
                  {selfKind === "seedlings" && secondaryCuttings ? (
                    <p data-testid="cuttings-note">يمكن أيضًا إنتاج الأشتال من العُقَل، وموعد أخذ العُقَل وتجذيرها ليس موعد زراعة الشتلة الجاهزة في الأرض.</p>
                  ) : null}
                  {secondaryCuttings ? (
                    cuttingWindows.length ? (
                      <PlantingWindowsTable windows={cuttingWindows} caption={`موعد أخذ عُقَل ${crop.name} وتجذيرها`} />
                    ) : (
                      <p data-testid="cuttings-unknown">لا تتوفر لدينا مواعيد موثّقة لأخذ عُقَل {crop.name} وتجذيرها.</p>
                    )
                  ) : null}
                  {usesSeedlings ? (
                    nurseryWindows.length ? (
                      <PlantingWindowsTable windows={nurseryWindows} caption={`موعد بذر ${crop.name} في المشتل`} />
                    ) : (
                      <p data-testid="nursery-unknown">لا تتوفر لدينا مواعيد موثّقة لبذر {crop.name} في المشتل، ولن نحسبها من موعد الزراعة في الأرض.</p>
                    )
                  ) : null}
                  {selfKind === "offshoots" ? <p data-testid="offshoot-unknown">لا تتوفر لدينا مواعيد موثّقة لفصل فسائل {crop.name} وتجذيرها.</p> : null}
                </div>
              </details>
            ) : null}
          </section>

          {crop.guide.map((g) => (
            <section key={g.section} id={`guide-${g.section}`} aria-labelledby={`h-${g.section}`} className="scroll-mt-24">
              <h2 id={`h-${g.section}`} className="mb-3 text-2xl font-extrabold">{g.title || GUIDE_SECTION_LABELS[g.section]}</h2>
              <div className="space-y-3 leading-8 text-foreground/85">
                {g.body.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}

          <Alert tone="warning" title="مصدر المعلومات ودرجة الثقة">
            {crop.sourceNote}
          </Alert>

          {usedSources.length ? (
            <section aria-labelledby="used-title">
              <h2 id="used-title" className="mb-2 text-lg font-extrabold">المصادر</h2>
              <ul className="space-y-3 text-sm">
                {usedSources.map((r) => (
                  <li key={r.id}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-semibold text-brand-700 underline-offset-4 hover:underline">
                      <ExternalLink className="mt-1 size-4 shrink-0" aria-hidden />
                      {r.title}
                    </a>
                    <span className="block text-muted-foreground">{r.publisher}</span>
                    {crop.windows
                      .filter((w) => w.sourceId === r.id && w.sourceDetail)
                      .map((w) => w.sourceDetail)
                      .filter((d, i, all) => all.indexOf(d) === i)
                      .map((d) => (
                        <p key={d} className="mt-1 border-s-4 border-border-strong ps-3 text-muted-foreground">{d}</p>
                      ))}
                    {r.readVia ? <span className="mt-1 block text-xs text-subtle-foreground">{r.readVia}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {references.length ? (
            <section aria-labelledby="refs-title">
              <h2 id="refs-title" className="mb-2 text-lg font-extrabold">مراجع مرشّحة للمراجعة</h2>
              <p className="mb-3 text-sm text-muted-foreground">لم نأخذ منها أي موعد بعد؛ ندرجها ليراجعها مختص قبل اعتماد بياناتها.</p>
              <ul className="space-y-2 text-sm">
                {references.map((r) => (
                  <li key={r.id}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-semibold text-brand-700 underline-offset-4 hover:underline">
                      <ExternalLink className="mt-1 size-4 shrink-0" aria-hidden />
                      {r.title}
                    </a>
                    <span className="block text-muted-foreground">{r.publisher} — {r.covers}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <nav aria-label="محتويات الصفحة" className="sticky top-24 rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-bold">في هذه الصفحة</p>
            <ul className="space-y-1 text-sm">
              <li>
                <a href="#windows" className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">{title}</a>
              </li>
              {crop.guide.map((g) => (
                <li key={g.section}>
                  <a href={`#guide-${g.section}`} className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                    {g.title || GUIDE_SECTION_LABELS[g.section]}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent p-3 text-xs leading-6 text-accent-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              ستحصل على تنبيه إن كان تاريخ زراعتك خارج المواعيد المقترحة لمنطقتك.
            </div>
          </nav>
        </aside>
      </div>
    </article>
  );
}
