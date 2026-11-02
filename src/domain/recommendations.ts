/**
 * "ماذا أزرع الآن في منطقتي؟" — deterministic crop recommendations.
 *
 * Inputs: today's date (user's time zone), climate zone, space type, preferred
 * planting method, the crop catalogue (planting windows from the database) and,
 * when available, the short-range forecast alerts.
 *
 * Rules (applied per crop, in this order):
 *   1. No window for the zone (or none matching the chosen method) → "no_data".
 *   2. Today's month inside a window:
 *        - unsuitable space, or frost expected for a frost-sensitive crop → "protect"
 *        - otherwise → "now"
 *   3. A window starts within SOON_DAYS days → "soon".
 *   4. Otherwise → "later" (with the date the next window opens).
 * Sorting is stable and documented in `compareRecommendations`.
 * No scores, confidences or dates are invented: everything comes from the
 * crop windows and the forecast.
 */
import { addMonths, daysInMonth, diffDays, parseISODate, toISODate } from "@/lib/dates";
import { formatDays, formatMonthRange, monthName } from "@/lib/format";
import { CLIMATE_ZONE_LABELS, COUNTRY_LABELS, GREENHOUSE_NOTICE, METHOD_LABELS, SPACES_WITHOUT_RULES, SPACE_TYPE_LABELS } from "./labels";
import { isGeneralOnly, monthInWindow, windowsForZone } from "./planting-windows";
import type { ClimateZone, Crop, ISODate, PlantingMethod, PlantingWindow, SpaceType } from "./types";
import type { WeatherAlert } from "./weather";

export const SOON_DAYS = 45;

export const METHOD_GROUPS = {
  all: null,
  seeds: ["direct_sowing"],
  // Ready material planted in the ground; nursery sowing is never a planting date here.
  seedlings: ["transplanting", "saplings", "cuttings", "offshoots"],
  tubers: ["tubers", "cloves", "bulbs"],
} as const satisfies Record<string, readonly PlantingMethod[] | null>;
export type MethodGroup = keyof typeof METHOD_GROUPS;

export const METHOD_GROUP_LABELS: Record<MethodGroup, string> = {
  all: "كل الطرق",
  seeds: "بذور تُبذر مباشرة في الأرض",
  seedlings: "أشتال أو غراس أو عُقَل أو فسائل جاهزة",
  tubers: "درنات أو فصوص أو أبصال",
};

export type RecommendationStatus = "now" | "protect" | "soon" | "later" | "no_data";

export const STATUS_ORDER: RecommendationStatus[] = ["now", "protect", "soon", "later", "no_data"];

export interface Recommendation {
  crop: Crop;
  status: RecommendationStatus;
  /** Windows for the zone (after the method filter), in catalogue order. */
  windows: PlantingWindow[];
  /** The window that makes the crop current, or the next one to open. */
  activeWindow: PlantingWindow | null;
  method: PlantingMethod | null;
  /** Days left in the current window (status now/protect). */
  daysLeftInWindow: number | null;
  /** First day of the next window (status soon/later). */
  nextWindowStart: ISODate | null;
  daysUntilNextWindow: number | null;
  spaceSuitable: boolean;
  /** Based only on general country-wide dates (not verified for the zone). */
  general: boolean;
  reasons: string[];
  warnings: string[];
}

export interface RecommendationInput {
  crops: Crop[];
  today: ISODate;
  zone: ClimateZone;
  spaceType: SpaceType;
  methodGroup?: MethodGroup;
  /** Forecast alerts for the next days (empty when weather is unavailable). */
  alerts?: WeatherAlert[];
  /** ISO country of the location: windows documented for another country are ignored. */
  country?: string | null;
}

/** Last calendar day of the window that contains `today`. */
function windowEndDate(today: ISODate, w: PlantingWindow): ISODate {
  const { year, month } = parseISODate(today);
  // Months remaining until the end month (wrapping across the year end).
  const ahead = (w.endMonth - month + 12) % 12;
  const end = addMonths(toISODate(year, month, 1), ahead);
  const { year: ey, month: em } = parseISODate(end);
  return toISODate(ey, em, daysInMonth(ey, em));
}

/** First day of the next occurrence of the window strictly after this month. */
function nextWindowStartDate(today: ISODate, w: PlantingWindow): ISODate {
  const { year, month } = parseISODate(today);
  let ahead = (w.startMonth - month + 12) % 12;
  if (ahead === 0) ahead = 12;
  return addMonths(toISODate(year, month, 1), ahead);
}

function methodAllowed(method: PlantingMethod, group: MethodGroup): boolean {
  const allowed = METHOD_GROUPS[group];
  return allowed === null || (allowed as readonly PlantingMethod[]).includes(method);
}

export function recommendCrop(crop: Crop, input: RecommendationInput): Recommendation {
  const { today, zone, spaceType } = input;
  const group = input.methodGroup ?? "all";
  const month = parseISODate(today).month;
  const zoneLabel = CLIMATE_ZONE_LABELS[zone];
  const windows = windowsForZone(crop, zone, input.country).filter((w) => methodAllowed(w.method, group));
  const general = isGeneralOnly(windows);
  const countryName = COUNTRY_LABELS[windows[0]?.countryCode ?? ""] ?? "المنطقة";
  const where = general ? `عمومًا في ${countryName} (موعد عام غير خاص بمنطقتك)` : `لمنطقتك (${zoneLabel})`;
  const noRulesSpace = SPACES_WITHOUT_RULES.includes(spaceType);
  // An empty list means "not documented yet", not "unsuitable everywhere".
  const spaceUnknown = crop.spaceTypes.length === 0;
  const spaceSuitable = noRulesSpace || spaceUnknown || crop.spaceTypes.includes(spaceType);
  const reasons: string[] = [];
  const warnings: string[] = [];

  const base = {
    crop,
    windows,
    spaceSuitable,
    general,
    reasons,
    warnings,
  };

  if (windows.length === 0) {
    reasons.push(
      group === "all"
        ? `لا تتوفر في قاعدة البيانات مواعيد زراعة لهذا المحصول في المنطقة ${zoneLabel}.`
        : `لا توجد مواعيد مسجلة لطريقة «${METHOD_GROUP_LABELS[group]}» في المنطقة ${zoneLabel}.`,
    );
    return { ...base, status: "no_data", activeWindow: null, method: null, daysLeftInWindow: null, nextWindowStart: null, daysUntilNextWindow: null };
  }

  if (spaceUnknown && !noRulesSpace) {
    reasons.push("لم نوثّق بعد أنواع المساحات المناسبة له.");
  }
  if (!spaceSuitable) {
    reasons.push(`لا يُعد مناسبًا عادةً لـ«${SPACE_TYPE_LABELS[spaceType]}» حسب بيانات المحصول.`);
  }

  const current = windows.find((w) => monthInWindow(month, w.startMonth, w.endMonth)) ?? null;
  if (current) {
    const end = windowEndDate(today, current);
    const daysLeft = diffDays(today, end);
    reasons.unshift(
      `شهر ${monthName(month)} ضمن موعد ${METHOD_LABELS[current.method]} المسجل ${where}: ${formatMonthRange(current.startMonth, current.endMonth)}${current.note ? ` — ${current.note}` : ""}.`,
    );
    if (general) {
      warnings.push(`هذا موعد عام في ${countryName} وليس خاصًا بمنطقتك المناخية أو قريتك؛ تأكد من الإرشاد الزراعي المحلي ومن الأمطار قبل الزراعة.`);
    }
    if (daysLeft <= 14) reasons.push(`يتبقى ${formatDays(daysLeft)} على نهاية هذه الفترة.`);

    const frost = (input.alerts ?? []).filter((a) => a.kind === "frost");
    const frostRisk = crop.frostSensitive && frost.length > 0 && spaceType !== "greenhouse";
    if (frostRisk) {
      warnings.push(
        `صقيع متوقع في الأيام القادمة، و${crop.name} حساس للصقيع: أجّل الزراعة حتى يزول الخطر أو وفّر غطاءً واقيًا للأشتال.`,
      );
    }
    if ((input.alerts ?? []).some((a) => a.kind === "heat")) {
      warnings.push("حرارة شديدة متوقعة: تجنّب الزراعة والشتل وقت الظهيرة، وظلّل الأشتال الجديدة.");
    }
    const status: RecommendationStatus = !spaceSuitable || frostRisk ? "protect" : "now";
    return {
      ...base,
      status,
      activeWindow: current,
      method: current.method,
      daysLeftInWindow: daysLeft,
      nextWindowStart: null,
      daysUntilNextWindow: null,
    };
  }

  // Not in a window: find the window that opens first.
  const upcoming = windows
    .map((w) => ({ w, start: nextWindowStartDate(today, w) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))[0];
  const days = diffDays(today, upcoming.start);
  const status: RecommendationStatus = days <= SOON_DAYS ? "soon" : "later";
  reasons.unshift(
    status === "soon"
      ? `يبدأ موعد ${METHOD_LABELS[upcoming.w.method]} المسجل ${where} بعد ${formatDays(days)} (${formatMonthRange(upcoming.w.startMonth, upcoming.w.endMonth)}).`
      : `خارج موعده حاليًا؛ أقرب فترة مسجلة ${where} تبدأ في ${monthName(upcoming.w.startMonth)} (${formatMonthRange(upcoming.w.startMonth, upcoming.w.endMonth)}).`,
  );
  if (status === "soon") reasons.push("وقت مناسب لتجهيز التربة أو البذور أو الأشتال.");
  return {
    ...base,
    status,
    activeWindow: upcoming.w,
    method: upcoming.w.method,
    daysLeftInWindow: null,
    nextWindowStart: upcoming.start,
    daysUntilNextWindow: days,
  };
}

/**
 * Sort order (stable, testable):
 *   1. status: now → protect → soon → later → no_data
 *   2. now/protect: suitable space first, then fewest days left in the window
 *      (act before the window closes)
 *   3. soon/later: fewest days until the window opens
 *   4. Arabic name, then slug, as a final tie-breaker
 */
export function compareRecommendations(a: Recommendation, b: Recommendation): number {
  const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (s !== 0) return s;
  // Zone-specific dates before general country-wide ones.
  if (a.general !== b.general) return a.general ? 1 : -1;
  if (a.status === "now" || a.status === "protect") {
    if (a.spaceSuitable !== b.spaceSuitable) return a.spaceSuitable ? -1 : 1;
    const d = (a.daysLeftInWindow ?? 0) - (b.daysLeftInWindow ?? 0);
    if (d !== 0) return d;
  }
  if (a.status === "soon" || a.status === "later") {
    const d = (a.daysUntilNextWindow ?? 0) - (b.daysUntilNextWindow ?? 0);
    if (d !== 0) return d;
  }
  return a.crop.name.localeCompare(b.crop.name, "ar") || a.crop.slug.localeCompare(b.crop.slug);
}

export interface RecommendationResult {
  items: Recommendation[];
  groups: Record<RecommendationStatus, Recommendation[]>;
  notices: string[];
}

export function recommendCrops(input: RecommendationInput): RecommendationResult {
  const items = input.crops.map((c) => recommendCrop(c, input)).sort(compareRecommendations);
  const groups = Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s)])) as Record<
    RecommendationStatus,
    Recommendation[]
  >;
  const notices: string[] = [];
  if (SPACES_WITHOUT_RULES.includes(input.spaceType)) notices.push(GREENHOUSE_NOTICE);
  if (input.country == null && input.crops.some((c) => c.windows.some((w) => w.countryCode))) {
    notices.push("لم نتمكن من تأكيد البلد لموقعك (قد يكون قريبًا من الحدود)، لذلك لا نعرض المواعيد الموثّقة لبلد بعينه. اختر بلدتك من القائمة في صفحة الموقع لعرضها.");
  }
  return { items, groups, notices };
}

/** Date a "later" crop becomes plantable, for the empty-state timeline. */
export function upcomingStarts(result: RecommendationResult, limit = 6): Recommendation[] {
  return [...result.groups.soon, ...result.groups.later]
    .sort((a, b) => (a.daysUntilNextWindow ?? 0) - (b.daysUntilNextWindow ?? 0))
    .slice(0, limit);
}

