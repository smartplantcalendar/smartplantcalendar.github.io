"use client";

import { ArrowLeft, CalendarClock, CircleCheck, Info, ShieldAlert, Sprout, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CropImage } from "@/components/brand/crop-image";
import { LocationSummary } from "@/components/location/location-summary";
import { useAppData } from "@/components/providers/app-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeather } from "@/components/weather/weather-widget";
import { CLIMATE_ZONE_LABELS, METHOD_LABELS, SPACE_TYPE_LABELS } from "@/domain/labels";
import {
  METHOD_GROUP_LABELS,
  recommendCrops,
  upcomingStarts,
  type MethodGroup,
  type Recommendation,
  type RecommendationStatus,
} from "@/domain/recommendations";
import { countryOfLocation } from "@/domain/location";
import { SPACE_TYPES, type Crop, type SpaceType } from "@/domain/types";
import { isValidISODate } from "@/lib/dates";
import { formatDate, formatMonthRange, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_META: Record<RecommendationStatus, { title: string; badge: string; variant: "default" | "warning" | "info" | "neutral" | "outline"; icon: typeof Sprout }> = {
  now: { title: "مناسب للزراعة الآن", badge: "مناسب الآن", variant: "default", icon: CircleCheck },
  protect: { title: "في موعده لكن يحتاج حماية أو ظروفًا خاصة", badge: "يحتاج حماية", variant: "warning", icon: ShieldAlert },
  soon: { title: "يقترب موعد زراعته", badge: "قريبًا", variant: "info", icon: CalendarClock },
  later: { title: "غير مناسب حاليًا", badge: "ليس موعده", variant: "neutral", icon: Info },
  no_data: { title: "لا توجد معلومات موثوقة كافية لمنطقتك", badge: "لا معلومات كافية", variant: "outline", icon: Info },
};

const PREFS_KEY = "smartplant:recommendation-prefs:v1";

export function readRecommendationPrefs(): { space: SpaceType; method: MethodGroup } {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { space?: string; method?: string };
      return {
        space: (SPACE_TYPES as readonly string[]).includes(p.space ?? "") ? (p.space as SpaceType) : "home_garden",
        method: p.method && p.method in METHOD_GROUP_LABELS ? (p.method as MethodGroup) : "all",
      };
    }
  } catch {
    /* ignore */
  }
  return { space: "home_garden", method: "all" };
}

function savePrefs(p: { space: SpaceType; method: MethodGroup }) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function RecommendationCard({ r, space }: { r: Recommendation; space: SpaceType }) {
  const meta = STATUS_META[r.status];
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs" data-testid={`rec-${r.crop.slug}`} data-status={r.status}>
      <div className="flex gap-3 p-4">
        <CropImage crop={r.crop} className="size-20 shrink-0 rounded-xl" sizes="80px" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{r.crop.name}</h3>
            {r.estimated && r.status === "now" ? (
              <Badge variant="warning">ضمن الموعد التقديري</Badge>
            ) : r.general && r.status === "now" ? (
              <Badge variant="warning">ضمن الموعد العام</Badge>
            ) : (
              <Badge variant={meta.variant}>{meta.badge}</Badge>
            )}
            {r.general ? <Badge variant="outline">موعد عام لا يخص منطقتك</Badge> : null}
            {r.estimated ? (
              <Badge variant="outline" data-testid="rec-estimated">
                مواعيد تقديرية
              </Badge>
            ) : null}
          </div>
          {r.method ? <p className="text-sm text-muted-foreground">الطريقة المقترحة: {METHOD_LABELS[r.method]}</p> : null}
          {r.windows.length ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{r.estimated ? "فترات الزراعة التقديرية لمنطقتك: " : r.general ? "فترات الزراعة العامة المسجلة: " : "فترات الزراعة المسجلة لمنطقتك: "}</span>
              <span className="font-semibold text-brand-700">
                {r.windows.map((w) => `${formatMonthRange(w.startMonth, w.endMonth)} (${METHOD_LABELS[w.method]})`).join("، ")}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t border-border p-4">
        <div>
          <p className="mb-1 text-xs font-bold text-subtle-foreground">لماذا يظهر هنا؟</p>
          <ul className="space-y-1 text-sm leading-7">
            {r.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span aria-hidden className="mt-3 size-1.5 shrink-0 rounded-full bg-lime-600" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
        {r.warnings.length ? (
          <ul className="space-y-1 rounded-xl border border-warning-border bg-warning-soft p-3 text-sm leading-7">
            {r.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <TriangleAlert className="mt-1.5 size-4 shrink-0 text-warning" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2">
          {r.status !== "no_data" ? (
            <Button asChild size="sm">
              <Link href={`/planner?crop=${r.crop.slug}&space=${space}`}>
                <Sprout /> أضف إلى خطتي الزراعية
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/crops/${r.crop.slug}`}>دليل المحصول</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/**
 * Full "what to plant now" experience. Recomputes automatically whenever the
 * confirmed location (zone), the date, the space type or the method changes.
 */
export function RecommendationsView({ crops, compact = false }: { crops: Crop[]; compact?: boolean }) {
  const { location, today, mode } = useAppData();
  const weather = useWeather();
  const [prefs, setPrefs] = useState<{ space: SpaceType; method: MethodGroup } | null>(null);
  const [customDate, setCustomDate] = useState<string>("");
  const current = prefs ?? (mode === "loading" ? { space: "home_garden" as SpaceType, method: "all" as MethodGroup } : readRecommendationPrefs());
  const date = customDate && isValidISODate(customDate) ? customDate : today;
  const weatherState = weather.state;
  const alerts = useMemo(
    () => (weatherState.status === "ok" && date === today ? weatherState.data.alerts : []),
    [weatherState, date, today],
  );

  const result = useMemo(
    () => (location ? recommendCrops({ crops, today: date, zone: location.zone, spaceType: current.space, methodGroup: current.method, alerts, country: countryOfLocation(location) }) : null),
    [crops, date, location, current.space, current.method, alerts],
  );

  if (mode === "loading") return <Skeleton className="h-96 w-full rounded-2xl" />;

  const update = (patch: Partial<{ space: SpaceType; method: MethodGroup }>) => {
    const next = { ...current, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  if (!location || !result) {
    return (
      <div className="flex flex-col gap-4">
        <LocationSummary />
        <p className="text-sm text-muted-foreground">تظهر الاقتراحات بعد تحديد موقع أرضك، لأن مواعيد الزراعة تختلف بين المرتفعات والساحل والأغوار.</p>
      </div>
    );
  }

  if (compact) {
    const top = [...result.groups.now, ...result.groups.protect].slice(0, 3);
    const upcoming = upcomingStarts(result, 3);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          لـ<strong className="text-foreground">{location.label}</strong> ({CLIMATE_ZONE_LABELS[location.zone]}) في {formatDate(today, { year: false })} — {SPACE_TYPE_LABELS[current.space]}
        </p>
        {top.length ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {top.map((r) => (
              <li key={r.crop.slug} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <CropImage crop={r.crop} className="size-14 shrink-0 rounded-lg" sizes="56px" />
                <div className="min-w-0">
                  <p className="font-bold">{r.crop.name}</p>
                  <Badge variant={STATUS_META[r.status].variant}>{STATUS_META[r.status].badge}</Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-surface-muted p-4 text-sm text-muted-foreground">
            لا توجد محاصيل في موعد زراعتها الآن.{" "}
            {upcoming.length ? `الأقرب: ${upcoming.map((u) => `${u.crop.name} (${formatDate(u.nextWindowStart!, { year: false })})`).join("، ")}.` : ""}
          </p>
        )}
        <Button asChild variant="outline" className="self-start">
          <Link href="/recommendations">كل الاقتراحات والأسباب <ArrowLeft /></Link>
        </Button>
      </div>
    );
  }

  const groups: RecommendationStatus[] = ["now", "protect", "soon", "later", "no_data"];
  const empty = result.groups.now.length === 0 && result.groups.protect.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <LocationSummary />

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-space">نوع المساحة</Label>
          <Select id="rec-space" value={current.space} onChange={(e) => update({ space: e.target.value as SpaceType })}>
            {SPACE_TYPES.map((s) => <option key={s} value={s}>{SPACE_TYPE_LABELS[s]}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-method">طريقة الزراعة</Label>
          <Select id="rec-method" value={current.method} onChange={(e) => update({ method: e.target.value as MethodGroup })}>
            {(Object.keys(METHOD_GROUP_LABELS) as MethodGroup[]).map((m) => <option key={m} value={m}>{METHOD_GROUP_LABELS[m]}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-date">التاريخ</Label>
          <Input id="rec-date" type="date" value={customDate || today} onChange={(e) => setCustomDate(e.target.value === today ? "" : e.target.value)} />
          <p className="text-xs text-subtle-foreground">
            {date === today ? `اليوم: ${formatDate(today, { weekday: true })}` : `معاينة لتاريخ آخر: ${formatDate(date, { weekday: true })}`}
          </p>
        </div>
      </div>

      <Alert tone="warning" title="اقتراحات إرشادية">
        مبنية على مواعيد الزراعة المسجلة في قاعدة بيانات المنصة لمنطقتك المناخية ({CLIMATE_ZONE_LABELS[location.zone]})، وهي بيانات أولية لم يراجعها مختص بالكامل. تختلف النتائج حسب الصنف والتربة والارتفاع الدقيق.
      </Alert>
      {result.notices.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
      {date !== today ? (
        <Alert tone="info">تحذيرات الطقس تظهر لتاريخ اليوم فقط، لأن التوقعات المتاحة تغطي الأيام القريبة.</Alert>
      ) : weather.needsConsent ? (
        <Alert tone="info">لم نتحقق من الطقس القريب لأنك لم توافق على إرسال موقعك إلى خدمة الطقس. <Link href="/location" className="font-semibold underline">الموافقة من صفحة الموقع</Link></Alert>
      ) : weather.state.status === "error" ? (
        <Alert tone="info">تعذّر جلب الطقس الآن، لذلك لا تتضمن الاقتراحات تحذيرات الصقيع أو الحر.</Alert>
      ) : alerts.length ? (
        <Alert tone="warning" title="تنبيهات الطقس في الأيام القادمة">
          {alerts.map((a) => `${a.title} (${formatDate(a.date, { weekday: true, year: false })})`).join("، ")}
        </Alert>
      ) : null}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {formatNumber(result.groups.now.length)} مناسب الآن · {formatNumber(result.groups.protect.length)} يحتاج حماية · {formatNumber(result.groups.soon.length)} قريبًا
      </p>

      {empty ? (
        <EmptyState
          icon={CalendarClock}
          title="لا توجد محاصيل في موعد زراعتها الآن في منطقتك"
          description={`أقرب المواعيد: ${upcomingStarts(result)
            .map((u) => `${u.crop.name} من ${formatDate(u.nextWindowStart!, { year: false })}`)
            .join("، ")}`}
        />
      ) : null}

      {groups.map((g) =>
        g === "no_data" && result.groups[g].length ? (
          <details key={g} className="group rounded-2xl border border-border bg-surface p-4" data-testid="rec-no-data">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-extrabold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Info className="size-5" aria-hidden />
              {STATUS_META[g].title} ({formatNumber(result.groups[g].length)})
              <span className="ms-auto text-sm font-semibold text-brand-700 group-open:hidden">عرض الأسماء</span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              لم نوثّق بعد مواعيد زراعة هذه المحاصيل في منطقتك، ولن نقترح لها موعدًا دون مصدر. افتح المحصول لمعرفة المتوفر عنه.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.groups[g].map((r) => (
                <li key={r.crop.slug}>
                  <Link href={`/crops/${r.crop.slug}`} data-testid={`rec-${r.crop.slug}`} data-status={r.status} className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm font-semibold hover:bg-surface-muted">
                    {r.crop.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : result.groups[g].length ? (
          <section key={g} aria-labelledby={`grp-${g}`} className="flex flex-col gap-3">
            <h2 id={`grp-${g}`} className={cn("flex items-center gap-2 text-xl font-extrabold", g === "later" || g === "no_data" ? "text-muted-foreground" : "")}>
              {(() => {
                const Icon = STATUS_META[g].icon;
                return <Icon className="size-5" aria-hidden />;
              })()}
              {STATUS_META[g].title} ({formatNumber(result.groups[g].length)})
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.groups[g].map((r) => <RecommendationCard key={r.crop.slug} r={r} space={current.space} />)}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
