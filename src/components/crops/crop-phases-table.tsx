import { CLIMATE_ZONE_LABELS, COUNTRY_LABELS, METHOD_SHORT_LABELS } from "@/domain/labels";
import { CLIMATE_ZONES, type Crop, type CropPhaseWindow, type PhaseKind, type ZoneEstimate } from "@/domain/types";
import { formatMonthRange, formatNumber } from "@/lib/format";

const UNKNOWN = "غير معروف";
const NA = "لا ينطبق";

function months(phases: CropPhaseWindow[]): string | null {
  return phases.length ? [...new Set(phases.map((p) => formatMonthRange(p.startMonth, p.endMonth)))].join("، ") : null;
}

function years(n: number): string {
  if (n === 1) return "نحو سنة";
  if (n === 2) return "نحو سنتين";
  if (n <= 10) return `نحو ${formatNumber(n)} سنوات`;
  return `نحو ${formatNumber(n)} سنة`;
}

/**
 * Estimated flowering, yearly harvest season, days to the first harvest and
 * years to the first yield, per zone. Separate from planting dates.
 */
export function CropPhasesTable({ crop }: { crop: Pick<Crop, "name" | "phases" | "zoneEstimates"> }) {
  const zones = crop.zoneEstimates ?? [];
  const country = zones[0]?.countryCode ?? "";
  const phase = (kind: PhaseKind, z: ZoneEstimate) =>
    months((crop.phases ?? []).filter((p) => p.kind === kind && p.zone === z.zone && p.countryCode === z.countryCode && !p.optional)) ??
    (z.notApplicable.includes(kind) ? NA : UNKNOWN);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface" data-testid="phases-table">
      <table className="w-full min-w-[34rem] text-start text-sm">
        <caption className="sr-only">
          الإزهار والقطف لـ{crop.name} حسب المنطقة في {COUNTRY_LABELS[country] ?? "البلد"} (تقديري)
        </caption>
        <thead className="bg-surface-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-start font-semibold">المنطقة المناخية</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">الإزهار</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">موسم القطف السنوي</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">أول قطف بعد الزراعة</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">أول إنتاج للأشجار</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {CLIMATE_ZONES.map((zone) => {
            const z = zones.find((e) => e.zone === zone);
            if (!z) {
              return (
                <tr key={zone}>
                  <th scope="row" className="px-4 py-3 text-start font-semibold">{CLIMATE_ZONE_LABELS[zone]}</th>
                  <td colSpan={4} className="px-4 py-3 text-subtle-foreground">{UNKNOWN}</td>
                </tr>
              );
            }
            if (z.suitability === "not_recommended") {
              return (
                <tr key={zone}>
                  <th scope="row" className="px-4 py-3 text-start font-semibold">{CLIMATE_ZONE_LABELS[zone]}</th>
                  <td colSpan={4} className="px-4 py-3 text-subtle-foreground">لا يُوصى بالزراعة المكشوفة في هذه المنطقة (تقدير)</td>
                </tr>
              );
            }
            return (
              <tr key={zone} data-testid={`phases-${zone}`}>
                <th scope="row" className="px-4 py-3 text-start font-semibold">{CLIMATE_ZONE_LABELS[zone]}</th>
                <td className="px-4 py-3" data-testid="phase-flowering">{phase("flowering", z)}</td>
                <td className="px-4 py-3" data-testid="phase-harvest">{phase("harvest", z)}</td>
                <td className="px-4 py-3" data-testid="phase-days">
                  {z.daysToFirstHarvest != null ? `نحو ${formatNumber(z.daysToFirstHarvest)} يومًا` : z.notApplicable.includes("days") ? NA : UNKNOWN}
                </td>
                <td className="px-4 py-3" data-testid="phase-years">
                  {z.yearsToFirstYield != null ? years(z.yearsToFirstYield) : z.notApplicable.includes("years") ? NA : UNKNOWN}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Optional additional seasons (عروات إضافية): low confidence, never recommended automatically. */
export function OptionalSeasonsTable({ crop }: { crop: Pick<Crop, "name" | "windows" | "phases"> }) {
  const extra = crop.windows.filter((w) => w.optional);
  if (!extra.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface" data-testid="optional-seasons">
      <table className="w-full min-w-[34rem] text-start text-sm">
        <caption className="sr-only">عروات إضافية اختيارية لـ{crop.name} (تقدير منخفض الثقة)</caption>
        <thead className="bg-surface-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 text-start font-semibold">المنطقة المناخية</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">الزراعة في الأرض</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">القطف</th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">شرط مهم</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {extra.map((w, i) => {
            const harvest = months((crop.phases ?? []).filter((p) => p.optional && p.kind === "harvest" && p.zone === w.zone));
            return (
              <tr key={i}>
                <th scope="row" className="px-4 py-3 text-start font-semibold">{w.zone ? CLIMATE_ZONE_LABELS[w.zone] : "عام"}</th>
                <td className="px-4 py-3 font-semibold text-brand-700">
                  {formatMonthRange(w.startMonth, w.endMonth)}
                  <span className="block text-xs font-normal text-muted-foreground">{METHOD_SHORT_LABELS[w.method]}</span>
                </td>
                <td className="px-4 py-3">{harvest ?? UNKNOWN}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.note ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
