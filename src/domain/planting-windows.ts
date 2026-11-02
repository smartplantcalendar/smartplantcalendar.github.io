import { addMonths, diffDays, parseISODate, toISODate } from "@/lib/dates";
import { FIELD_METHODS, type ClimateZone, type Crop, type CropPhaseWindow, type ISODate, type PhaseKind, type PlantingMethod, type PlantingWindow, type Season, type ZoneEstimate } from "./types";
import { monthName } from "@/lib/format";
import { METHOD_LABELS, SEASON_MONTHS } from "./labels";

/** True when `month` lies within a window that may wrap the year end. */
export function monthInWindow(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

/** Circular distance in months between two months (0–6). */
export function monthDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

/**
 * A window documented for one country applies only to locations confirmed to
 * be in that country. When the country is unknown (null/undefined), only the
 * unscoped general data applies: Palestinian dates are never assumed for a
 * location whose country we could not establish.
 */
export function windowAppliesToCountry(w: PlantingWindow, country?: string | null): boolean {
  return !w.countryCode || (country != null && w.countryCode === country);
}

/** Planting in the final place (field, garden, pot) — not sowing in a nursery. */
export function isFieldWindow(w: Pick<PlantingWindow, "method">): boolean {
  return (FIELD_METHODS as readonly PlantingMethod[]).includes(w.method);
}

/** An imported estimate (not documented, not reviewed). */
export function isEstimated(w: Pick<PlantingWindow, "confidence">): boolean {
  return w.confidence === "estimated";
}

function scopedWindows(windows: PlantingWindow[], zone: ClimateZone, country?: string | null): PlantingWindow[] {
  const applicable = windows.filter((w) => windowAppliesToCountry(w, country) && !w.optional);
  // Documented dates first (the zone's own, else general country-wide ones).
  const documented = applicable.filter((w) => !isEstimated(w));
  const specific = documented.filter((w) => w.zone === zone);
  if (specific.length) return specific;
  const general = documented.filter((w) => w.zone === null);
  if (general.length) return general;
  // Estimates only where nothing documented applies, and only for their own
  // zone: an estimate is replaced as soon as better data exist.
  return applicable.filter((w) => isEstimated(w) && w.zone === zone);
}

/**
 * Windows for PLANTING IN THE GROUND that apply to a zone (and country): the
 * zone's own documented windows when there are any, otherwise the general
 * country-wide windows (zone null), otherwise the zone's estimated windows.
 * Nursery sowing windows are never included (see `nurseryWindowsForZone`),
 * nor optional additional seasons (see `optionalWindowsForZone`).
 */
export function windowsForZone(crop: Pick<Crop, "windows">, zone: ClimateZone, country?: string | null): PlantingWindow[] {
  return scopedWindows(crop.windows.filter(isFieldWindow), zone, country);
}

/** Optional low-confidence additional seasons (عروات إضافية) for a zone: shown, never recommended. */
export function optionalWindowsForZone(crop: Pick<Crop, "windows">, zone: ClimateZone, country?: string | null): PlantingWindow[] {
  return crop.windows.filter((w) => w.optional && isFieldWindow(w) && w.zone === zone && windowAppliesToCountry(w, country));
}

/** True when every window is an estimate. */
export function isEstimatedOnly(windows: PlantingWindow[]): boolean {
  return windows.length > 0 && windows.every(isEstimated);
}

/** The crop's estimate for a zone (suitability, days/years), for its own country only. */
export function zoneEstimateFor(
  crop: Pick<Crop, "zoneEstimates">,
  zone: ClimateZone,
  country?: string | null,
): ZoneEstimate | null {
  return crop.zoneEstimates?.find((z) => z.zone === zone && country != null && z.countryCode === country) ?? null;
}

/** «لا يُوصى / غير ملائم غالبًا» for open-field planting in this zone (estimate). */
export function isNotRecommended(crop: Pick<Crop, "zoneEstimates" | "windows">, zone: ClimateZone, country?: string | null): boolean {
  // Documented windows for the zone outrank the estimate's restriction.
  if (windowsForZone(crop, zone, country).some((w) => !isEstimated(w))) return false;
  return zoneEstimateFor(crop, zone, country)?.suitability === "not_recommended";
}

/** Flowering or harvest seasons for a zone (estimates; never planting dates). */
export function phasesForZone(
  crop: Pick<Crop, "phases">,
  kind: PhaseKind,
  zone: ClimateZone,
  country?: string | null,
  opts: { optional?: boolean } = {},
): CropPhaseWindow[] {
  return (crop.phases ?? []).filter(
    (p) => p.kind === kind && p.zone === zone && country != null && p.countryCode === country && Boolean(p.optional) === Boolean(opts.optional),
  );
}

/** Secondary: windows for raising your own seedlings in a nursery. */
export function nurseryWindowsForZone(crop: Pick<Crop, "windows">, zone: ClimateZone, country?: string | null): PlantingWindow[] {
  return scopedWindows(crop.windows.filter((w) => !isFieldWindow(w)), zone, country);
}

/**
 * The farmer's default: planting READY material in the final place. Explicit
 * `primaryMethod` wins; otherwise the first field method of `propagation`
 * (listed most common first), else of the field windows, skipping secondary
 * propagation: a fig, pomegranate or mulberry defaults to a ready sapling,
 * never to cuttings, and a date palm to a ready rooted offshoot.
 */
export function primaryMethod(crop: Pick<Crop, "windows" | "propagation" | "primaryMethod">): PlantingMethod | null {
  if (crop.primaryMethod && isFieldWindow({ method: crop.primaryMethod })) return crop.primaryMethod;
  // The farmer's default is buying ready material (a sapling, a seedling, a rooted
  // offshoot), so secondary propagation (cuttings next to a ready plant) never wins.
  const secondary = propagationMethods(crop);
  const usable = (m: PlantingMethod) => isFieldWindow({ method: m }) && !secondary.includes(m);
  const fromPropagation = (crop.propagation ?? []).find(usable);
  if (fromPropagation) return fromPropagation;
  return crop.windows.map((w) => w.method).find(usable) ?? null;
}

/**
 * Field methods of a crop, the primary one first. When a ready plant is an
 * option (a sapling or a nursery seedling), cuttings are SECONDARY
 * propagation (see `propagationMethods`) and are left out here.
 */
export function fieldMethods(crop: Pick<Crop, "windows" | "propagation" | "primaryMethod"> & { category?: Crop["category"] }): PlantingMethod[] {
  const secondary = propagationMethods(crop);
  const first = primaryMethod(crop);
  const all = [...(crop.propagation ?? []), ...crop.windows.map((w) => w.method)].filter((m) => isFieldWindow({ method: m }) && !secondary.includes(m));
  return [...new Set([...(first ? [first] : []), ...all])];
}

/**
 * Ways to PRODUCE the plant yourself rather than plant a ready one: cuttings
 * when a ready sapling or seedling exists (fig, pomegranate, sage…), and
 * nursery sowing. Their dates are secondary and never the planting date.
 */
export function propagationMethods(crop: Pick<Crop, "windows" | "propagation" | "primaryMethod"> & { category?: Crop["category"] }): PlantingMethod[] {
  const all = [...(crop.propagation ?? []), ...crop.windows.map((w) => w.method)];
  const ready = all.includes("saplings") || all.includes("transplanting");
  const first = crop.primaryMethod ?? null;
  return [...new Set(all.filter((m) => m === "nursery_sowing" || (m === "cuttings" && ready && first !== "cuttings")))];
}

/**
 * Plain title for the planting date, e.g. «موعد زراعة البندورة في الأرض»,
 * «موعد غرس شجرة الزيتون», «موعد بذر القمح في الأرض»,
 * «موعد زراعة أبصال النرجس».
 */
export function plantingTitle(crop: Pick<Crop, "name" | "category">, method: PlantingMethod | null): string {
  const n = crop.name;
  switch (method) {
    case "direct_sowing":
      return `موعد بذر ${n} في الأرض`;
    case "transplanting":
      return `موعد زراعة ${n} في الأرض`;
    case "saplings":
      return crop.category === "tree" ? `موعد غرس شجرة ${n}` : `موعد غرس ${n}`;
    case "tubers":
      return `موعد زراعة درنات ${n}`;
    case "cloves":
      return `موعد زراعة فصوص ${n}`;
    case "bulbs":
      return `موعد زراعة أبصال ${n}`;
    case "offshoots":
      return `موعد زراعة فسائل ${n} المتجذرة`;
    case "cuttings":
      return `موعد زراعة عُقَل ${n}`;
    case "nursery_sowing":
      return `موعد بذر ${n} في المشتل`;
    default:
      return `موعد زراعة ${n}`;
  }
}

/** The windows the main status uses: the default method's field windows for the zone. */
export function mainWindowsForZone(
  crop: Pick<Crop, "windows" | "propagation" | "primaryMethod"> & { category?: Crop["category"] },
  zone: ClimateZone,
  country?: string | null,
): PlantingWindow[] {
  const field = windowsForZone(crop, zone, country);
  const first = primaryMethod(crop);
  // Only the default method's dates: a cutting or offshoot date is never
  // presented as the date for planting a ready tree. Unknown stays unknown.
  return first ? field.filter((w) => w.method === first) : field;
}

/** True when the only applicable windows are general (not zone-specific). */
export function isGeneralOnly(windows: PlantingWindow[]): boolean {
  return windows.length > 0 && windows.every((w) => w.zone === null);
}

export type WindowFit = "in_window" | "near_window" | "outside_window" | "no_data";

/**
 * How well a planting month matches the crop's preliminary windows for a zone.
 * "near" means within one month of a window edge.
 */
export function evaluateWindowFit(crop: Pick<Crop, "windows" | "propagation" | "primaryMethod">, zone: ClimateZone, month: number, country?: string | null): WindowFit {
  // Plans start on the date of planting in the ground with the default method.
  const windows = mainWindowsForZone(crop, zone, country);
  if (windows.length === 0) return "no_data";
  if (windows.some((w) => monthInWindow(month, w.startMonth, w.endMonth))) return "in_window";
  const near = windows.some(
    (w) => monthDistance(month, w.startMonth) <= 1 || monthDistance(month, w.endMonth) <= 1,
  );
  return near ? "near_window" : "outside_window";
}

/** Crops that have at least one window in the given season (any zone, or a given zone). */
export function cropMatchesSeason(crop: Pick<Crop, "windows">, season: Season, zone?: ClimateZone): boolean {
  const months = SEASON_MONTHS[season];
  // Catalogue filter (describes the data, not a recommendation for a location):
  // a zone filter matches the zone's own windows and general country-wide ones.
  return crop.windows
    .filter((w) => isFieldWindow(w) && !w.optional)
    .filter((w) => !zone || w.zone === zone || w.zone === null)
    .some((w) => months.some((m) => monthInWindow(m, w.startMonth, w.endMonth)));
}

export function cropPlantableInMonth(crop: Pick<Crop, "windows">, month: number, zone: ClimateZone, country?: string | null): boolean {
  return windowsForZone(crop, zone, country).some((w) => monthInWindow(month, w.startMonth, w.endMonth));
}

/** Days in the "soon" range, shared with the recommendation engine. */
export const SOON_WINDOW_DAYS = 45;

export type SimpleStatusKind = "now" | "soon" | "later" | "no_data";

export interface SimpleStatus {
  kind: SimpleStatusKind;
  /** Month the current window ends (now) or the next one starts (soon/later). */
  month: number | null;
  /** Methods open now (now) or in the next window (soon/later). */
  methods: PlantingMethod[];
  /** The answer rests on general country-wide dates, not dates for this zone. */
  general: boolean;
  /** The answer rests on imported ESTIMATES (not documented). */
  estimated: boolean;
  /** no_data because open-field planting is not recommended in the zone (estimate). */
  notRecommended: boolean;
}

/**
 * The four-way answer shown to farmers for one crop in one zone:
 *  now     → «مناسب للزراعة الآن»
 *  soon    → «يبدأ موسمه في <شهر>» (within about 45 days)
 *  later   → «ليس وقته حاليًا»
 *  no_data → «لا توجد معلومات موثوقة كافية»
 * Uses the same rule as the recommendation engine (windows are month-level;
 * "soon" = the next window opens within 45 days of `today`).
 */
export function simplePlantingStatus(
  crop: Pick<Crop, "windows" | "propagation" | "primaryMethod"> & { category?: Crop["category"]; zoneEstimates?: Crop["zoneEstimates"] },
  zone: ClimateZone,
  today: ISODate,
  country?: string | null,
): SimpleStatus {
  // Planting in the ground with the crop's most common method (never nursery dates).
  const windows = mainWindowsForZone(crop, zone, country);
  if (windows.length === 0) {
    return { kind: "no_data", month: null, methods: [], general: false, estimated: false, notRecommended: isNotRecommended(crop, zone, country) };
  }
  const general = isGeneralOnly(windows);
  const estimated = isEstimatedOnly(windows);
  const { year, month } = parseISODate(today);
  const open = windows.filter((w) => monthInWindow(month, w.startMonth, w.endMonth));
  if (open.length) {
    return { kind: "now", month: open[0].endMonth, methods: [...new Set(open.map((w) => w.method))], general, estimated, notRecommended: false };
  }
  const ahead = (w: PlantingWindow) => (w.startMonth - month + 12) % 12 || 12;
  const nextAhead = Math.min(...windows.map(ahead));
  const next = windows.filter((w) => ahead(w) === nextAhead);
  const days = diffDays(today, addMonths(toISODate(year, month, 1), nextAhead));
  return {
    kind: days <= SOON_WINDOW_DAYS ? "soon" : "later",
    month: next[0].startMonth,
    methods: [...new Set(next.map((w) => w.method))],
    general,
    estimated,
    notRecommended: false,
  };
}

export const SIMPLE_STATUS_TITLES: Record<SimpleStatusKind, string> = {
  now: "مناسب للزراعة الآن",
  soon: "يقترب موسمه",
  later: "ليس وقته حاليًا",
  no_data: "لا توجد معلومات موثوقة كافية",
};

/** Short Arabic sentence for a simple status, e.g. «يبدأ موسمه في آذار». */
export function describeSimpleStatus(status: SimpleStatus): { title: string; detail: string } {
  const how = status.methods.map((m) => METHOD_LABELS[m]).join(" أو ");
  // General country-wide dates and estimates are never presented as a firm answer.
  const caveat = status.estimated ? " — موعد تقديري" : status.general ? " — موعد عام غير خاص بمنطقتك" : "";
  switch (status.kind) {
    case "now":
      if (status.estimated) return { title: "ضمن الموعد التقديري للزراعة", detail: `${how} حتى ${monthName(status.month!)}${caveat}` };
      return status.general
        ? { title: "ضمن الموعد العام للزراعة", detail: `${how} حتى ${monthName(status.month!)}${caveat}` }
        : { title: SIMPLE_STATUS_TITLES.now, detail: `${how} حتى ${monthName(status.month!)}` };
    case "soon":
      return { title: `يبدأ موسمه في ${monthName(status.month!)}`, detail: `${how}${caveat}` };
    case "later":
      return { title: SIMPLE_STATUS_TITLES.later, detail: `يبدأ موسمه في ${monthName(status.month!)} (${how})${caveat}` };
    default:
      return status.notRecommended
        ? { title: "غير ملائم غالبًا لمنطقتك", detail: "تقدير: لا يُوصى بزراعته المكشوفة في هذه المنطقة" }
        : { title: SIMPLE_STATUS_TITLES.no_data, detail: "لم نوثّق موعد زراعته في منطقتك بعد" };
  }
}
