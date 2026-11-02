"use client";

import { CalendarCheck2, CalendarClock, CircleHelp, MapPin, MoonStar } from "lucide-react";
import { useAppData } from "@/components/providers/app-data-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { countryOfLocation } from "@/domain/location";
import { describeSimpleStatus, simplePlantingStatus, type SimpleStatusKind } from "@/domain/planting-windows";
import type { Crop } from "@/domain/types";
import { cn } from "@/lib/utils";

const TONE: Record<SimpleStatusKind, string> = {
  now: "bg-brand-100 text-brand-700",
  soon: "bg-info-soft text-info",
  later: "bg-surface-muted text-muted-foreground",
  no_data: "border border-dashed border-border-strong text-muted-foreground",
};

const ICON: Record<SimpleStatusKind, typeof CalendarCheck2> = {
  now: CalendarCheck2,
  soon: CalendarClock,
  later: MoonStar,
  no_data: CircleHelp,
};

/**
 * One-line planting answer for the saved area: now / starts in <month> /
 * not now / no reliable information. Rendered in the browser because it
 * depends on the visitor's location and today's date.
 */
export function PlantingStatus({
  crop,
  className,
  showDetail = true,
}: {
  crop: Pick<Crop, "windows" | "propagation" | "primaryMethod" | "zoneEstimates">;
  className?: string;
  showDetail?: boolean;
}) {
  const { location, today, mode } = useAppData();
  if (mode === "loading") return <Skeleton className={cn("h-7 w-40 rounded-full", className)} />;
  if (!location) {
    return (
      <p className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
        <MapPin className="size-4 shrink-0" aria-hidden />
        حدّد منطقتك لمعرفة موعد زراعته
      </p>
    );
  }
  const country = countryOfLocation(location);
  const status = simplePlantingStatus(crop, location.zone, today, country);
  const described = describeSimpleStatus(status);
  const title = described.title;
  const detail =
    status.kind === "no_data" && country == null && crop.windows.some((w) => w.countryCode)
      ? "لم نتأكد من البلد لموقعك (قرب الحدود). اختر بلدتك من القائمة في صفحة الموقع لعرض المواعيد الموثّقة."
      : described.detail;
  const Icon = ICON[status.kind];
  return (
    <div className={cn("flex flex-col items-start gap-1", className)} data-status={status.kind} data-general={status.general || undefined} data-estimated={status.estimated || undefined} data-testid="planting-status">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold", (status.general || status.estimated) && status.kind === "now" ? "bg-warning-soft text-warning" : TONE[status.kind])}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </span>
      {showDetail && detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
