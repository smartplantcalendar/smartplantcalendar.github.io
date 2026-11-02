"use client";

import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { CropImage } from "@/components/brand/crop-image";
import { useAppData } from "@/components/providers/app-data-provider";
import { readRecommendationPrefs } from "@/components/recommendations/recommendations-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeather } from "@/components/weather/weather-widget";
import { CLIMATE_ZONE_LABELS, METHOD_LABELS, METHOD_SHORT_LABELS } from "@/domain/labels";
import { countryOfLocation } from "@/domain/location";
import { mainWindowsForZone } from "@/domain/planting-windows";
import { recommendCrops, upcomingStarts, type Recommendation } from "@/domain/recommendations";
import type { Crop } from "@/domain/types";
import { formatDate, formatMonthRange, monthName } from "@/lib/format";
import { parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const SHOWN = 6;

function NowCard({ r, today }: { r: Recommendation; today: string }) {
  const protect = r.status === "protect";
  const end = r.activeWindow ? monthName(r.activeWindow.endMonth) : null;
  const sameMonth = r.activeWindow ? r.activeWindow.endMonth === parseISODate(today).month : false;
  return (
    <li className="home-reveal">
      <Link
        href={`/crops/${r.crop.slug}/`}
        data-testid={`home-now-${r.crop.slug}`}
        className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xs transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-600/30 hover:shadow-md active:scale-[0.98]"
      >
        <CropImage crop={r.crop} className="size-16 shrink-0 rounded-xl transition-transform duration-300 group-hover:scale-[1.03]" sizes="64px" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-lg font-bold">
            {r.crop.name}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
                protect || r.general ? "bg-warning-soft text-warning" : "bg-brand-100 text-brand-700",
              )}
            >
              {r.general ? "موعد عام" : protect ? "يحتاج حماية" : "مناسب الآن"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {r.method ? `${METHOD_LABELS[r.method]} · ` : ""}
            {end ? (sameMonth ? `آخر شهر: ${end}` : `حتى ${end}`) : null}
          </p>
        </div>
        <ArrowLeft className="size-5 shrink-0 text-subtle-foreground transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function ExampleCard({ crop }: { crop: Crop }) {
  // Main planting method only (never nursery dates), unscoped or Palestinian data for the highlands.
  const highland = mainWindowsForZone(crop, "highland", "PS");
  return (
    <li className="home-reveal">
      <Link
        href={`/crops/${crop.slug}/`}
        className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xs transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-600/30 hover:shadow-md active:scale-[0.98]"
      >
        <CropImage crop={crop} className="size-16 shrink-0 rounded-xl" sizes="64px" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{crop.name}</p>
          <p className="text-sm text-muted-foreground">
            {highland.length
              ? `${METHOD_SHORT_LABELS[highland[0].method]} في المرتفعات: ${[...new Set(highland.map((w) => formatMonthRange(w.startMonth, w.endMonth)))].join("، ")}`
              : "افتح الدليل لترى مواعيده"}
          </p>
        </div>
        <ArrowLeft className="size-5 shrink-0 text-subtle-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * "What fits now" for the saved location, computed in the browser from the
 * real catalogue with the same engine as /recommendations. Without a saved
 * location it shows real crops from the guide (examples, not advice).
 */
export function PlantNow({ crops, examples }: { crops: Crop[]; examples: string[] }) {
  const { location, today, mode } = useAppData();
  const weather = useWeather();
  const weatherState = weather.state;
  const alerts = useMemo(() => (weatherState.status === "ok" ? weatherState.data.alerts : []), [weatherState]);
  const prefs = mode === "loading" ? null : readRecommendationPrefs();
  const space = prefs?.space ?? "home_garden";
  const method = prefs?.method ?? "all";

  const result = useMemo(
    () => (location ? recommendCrops({ crops, today, zone: location.zone, spaceType: space, methodGroup: method, alerts, country: countryOfLocation(location) }) : null),
    [crops, today, location, space, method, alerts],
  );

  if (mode === "loading") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!location || !result) {
    const list = examples.map((slug) => crops.find((c) => c.slug === slug)).filter((c) => c !== undefined);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-brand-600/30 bg-accent/50 p-4 sm:flex-row sm:items-center">
          <MapPin className="size-6 shrink-0 text-brand-600" aria-hidden />
          <p className="flex-1 text-base">المواعيد تختلف بين الجبل والساحل والغور. حدّد قريتك مرة واحدة ونتذكرها لك.</p>
          <Button asChild size="lg" className="self-start sm:self-auto">
            <Link href="/location/">حدّد قريتك</Link>
          </Button>
        </div>
        <p className="text-sm font-bold text-muted-foreground">من دليل المحاصيل:</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <ExampleCard key={c.slug} crop={c} />
          ))}
        </ul>
      </div>
    );
  }

  const top = [...result.groups.now, ...result.groups.protect].slice(0, SHOWN);
  const total = result.groups.now.length + result.groups.protect.length;
  const upcoming = upcomingStarts(result, 3);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" data-testid="home-now-context">
        لـ<strong className="text-foreground">{location.label}</strong> ({CLIMATE_ZONE_LABELS[location.zone]}) · {formatDate(today, { year: false })}
      </p>
      {top.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((r) => (
            <NowCard key={r.crop.slug} r={r} today={today} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl bg-surface-muted p-4">
          <CalendarClock className="mt-1 size-5 shrink-0 text-info" aria-hidden />
          <p className="text-base">
            لا يوجد محصول في موعد زراعته هذا الشهر في الدليل.
            {upcoming.length
              ? ` الأقرب: ${upcoming.map((u) => `${u.crop.name} (${formatDate(u.nextWindowStart!, { year: false })})`).join("، ")}.`
              : ""}
          </p>
        </div>
      )}
      <Button asChild variant="outline" size="lg" className="self-start">
        <Link href="/recommendations/">
          {total > top.length ? "كل المحاصيل المناسبة والأسباب" : "التفاصيل والأسباب"} <ArrowLeft />
        </Link>
      </Button>
    </div>
  );
}
