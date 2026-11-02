import { findSource } from "@/data/crop-sources";
import { CLIMATE_ZONE_LABELS, COUNTRY_LABELS, IRRIGATION_SYSTEM_LABELS, ZONE_SUITABILITY_LABELS } from "@/domain/labels";
import { CLIMATE_ZONES, type ClimateZone, type PlantingWindow, type ZoneEstimate } from "@/domain/types";
import { formatMonthRange } from "@/lib/format";

/**
 * Windows of ONE method, one row per climate zone (plus a general
 * country-wide row when present). Zones without data say so explicitly;
 * estimated windows and «لا يُوصى» zones are labelled as estimates.
 */
export function PlantingWindowsTable({
  windows,
  caption,
  testId,
  zoneEstimates = [],
}: {
  windows: PlantingWindow[];
  caption: string;
  testId?: string;
  zoneEstimates?: ZoneEstimate[];
}) {
  const zones: (ClimateZone | null)[] = [...(windows.some((w) => w.zone === null) ? [null] : []), ...CLIMATE_ZONES];
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface" data-testid={testId}>
      <table className="w-full min-w-[28rem] text-start text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-start font-semibold">المنطقة المناخية</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">الأشهر</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">ملاحظة</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">المصدر</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {zones.flatMap((zone) => {
            const ws = windows.filter((w) => w.zone === zone);
            const generalLabel = `عام في ${COUNTRY_LABELS[ws[0]?.countryCode ?? ""] ?? "البلد"} (غير خاص بمنطقة)`;
            const estimate = zone ? zoneEstimates.find((z) => z.zone === zone) : undefined;
            if (ws.length === 0) {
              return zone === null
                ? []
                : [
                    <tr key={zone} data-testid={estimate?.suitability === "not_recommended" ? "zone-not-recommended" : undefined}>
                      <th scope="row" className="px-4 py-3 text-start font-semibold">{CLIMATE_ZONE_LABELS[zone]}</th>
                      <td colSpan={3} className="px-4 py-3 text-subtle-foreground">
                        {estimate?.suitability === "not_recommended"
                          ? "لا يُوصى بالزراعة المكشوفة في هذه المنطقة (تقدير: غير ملائم غالبًا)"
                          : "لا تتوفر بيانات موثّقة لهذه المنطقة"}
                      </td>
                    </tr>,
                  ];
            }
            return ws.map((w, i) => {
              const src = findSource(w.sourceId);
              return (
                <tr key={`${zone ?? "general"}-${i}`} data-testid={zone ? undefined : "general-window"}>
                  {i === 0 ? (
                    <th scope="row" rowSpan={ws.length} className="px-4 py-3 text-start align-top font-semibold">
                      {zone ? CLIMATE_ZONE_LABELS[zone] : generalLabel}
                      {zone && w.countryCode ? (
                        <span className="block text-xs font-normal text-muted-foreground">في {COUNTRY_LABELS[w.countryCode] ?? w.countryCode}</span>
                      ) : null}
                    </th>
                  ) : null}
                  <td className="px-4 py-3 font-semibold text-brand-700">{formatMonthRange(w.startMonth, w.endMonth)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {w.note ??
                      (w.confidence === "estimated" && estimate
                        ? [estimate.suitability !== "possible" ? ZONE_SUITABILITY_LABELS[estimate.suitability] : null, IRRIGATION_SYSTEM_LABELS[estimate.irrigation]]
                            .filter(Boolean)
                            .join("؛ ")
                        : "—")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" data-testid="window-source">
                    {w.confidence === "estimated" ? (
                      <span className="font-semibold text-warning" data-testid="estimated-source">تقدير غير موثّق</span>
                    ) : src ? (
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline underline-offset-4">
                        {src.publisher}
                      </a>
                    ) : (
                      "معرفة عامة أولية"
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
