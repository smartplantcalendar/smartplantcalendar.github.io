/**
 * Validation and conversion of planting-estimate tables (CSV exported from the
 * Excel workbook «تقديرات الزراعة والقطاف») into typed crop estimates.
 *
 * Pure: no file access, so it is unit-tested (tests/unit/estimate-import.test.ts).
 * The CLI is scripts/import-estimates.ts.
 *
 * Rules
 *  - Every value is checked; nothing is guessed. A bad value is EXCLUDED and
 *    reported with its reason, never silently fixed.
 *  - «لا ينطبق» = not applicable (not a month); «لا يُوصى» and «غير ملائم غالبًا»
 *    are restrictions: no planting window, the zone is marked not recommended.
 *  - Planting = planting in the ground (direct seeds, ready seedlings, ready
 *    trees, tubers, bulbs, rooted offshoots/cuttings). Nursery sowing is
 *    rejected.
 *  - All rows must be for Palestine; the windows are scoped to "PS".
 *  - Estimates never claim to be documented or reviewed.
 */
import { LEVANT_MONTHS } from "../../src/lib/format";
import type {
  ClimateZone,
  CropCategory,
  CropEstimateData,
  CropPhaseWindow,
  IrrigationSystem,
  NotApplicableField,
  PlantingMethod,
  PlantingWindow,
  ZoneEstimate,
  ZoneSuitability,
} from "../../src/domain/types";
import type { CsvTable } from "./csv";

export const COUNTRY_CODE = "PS";

/** Column names of the main and per-region sheets (identical layout). */
export const ZONE_COLUMNS = {
  index: "م",
  slug: "رمز الصنف slug",
  name: "اسم النبات",
  scientificName: "الاسم العلمي",
  category: "التصنيف",
  country: "البلد",
  zone: "المنطقة المناخية",
  suitability: "ملاءمة الزراعة المكشوفة",
  system: "نظام الزراعة",
  method: "الطريقة في الأرض",
  plantStart: "بدء الزراعة (شهر)",
  plantEnd: "نهاية الزراعة (شهر)",
  flowerStart: "بدء الإزهار (شهر)",
  flowerEnd: "نهاية الإزهار (شهر)",
  harvestStart: "بدء القطف (شهر)",
  harvestEnd: "نهاية القطف (شهر)",
  days: "أول قطف بعد (يوم)",
  years: "أول إثمار بعد (سنة)",
  harvestMeaning: "المقصود بالقطف",
  infoGrade: "درجة المعلومة",
  note: "ملاحظات أساسية وشروط",
  link: "رابط عام (ليس إثباتًا لكل موعد)",
  status: "معرف الحالة",
} as const;

/** Column names of the optional extra-seasons sheet. */
export const EXTRA_COLUMNS = {
  index: "م",
  slug: "رمز الصنف",
  name: "النبات",
  country: "البلد",
  zone: "المنطقة",
  method: "طريقة الزراعة بالأرض",
  plantStart: "بدء الزراعة",
  plantEnd: "نهاية الزراعة",
  harvestStart: "بدء القطف",
  harvestEnd: "نهاية القطف",
  kind: "التصنيف",
  infoGrade: "نوع المعلومة",
  condition: "شرط مهم",
  link: "مرجع سياقي",
  status: "حالة الاستيراد",
} as const;

export const NOT_APPLICABLE = "لا ينطبق";
export const NOT_RECOMMENDED = "لا يُوصى";

export const ZONES: Record<string, ClimateZone> = {
  مرتفعات: "highland",
  ساحل: "coastal",
  "سهول داخلية": "inland_plain",
  الأغوار: "jordan_valley",
  "مناطق جافة": "arid",
};

export const SUITABILITY: Record<string, ZoneSuitability> = {
  "ممكن مبدئيًا — يحتاج تحققًا": "possible",
  "مشروط بري كافٍ وتحليل الموقع": "needs_irrigation",
  "مشروط بحماية من الصقيع": "needs_frost_protection",
  "محلي/استرشادي ويحتاج تحققًا": "local_guidance",
  "غير ملائم غالبًا": "not_recommended",
};

export const SYSTEMS: Record<string, IrrigationSystem> = {
  "زراعة مكشوفة مع ريّ داعم": "supplemental",
  "زراعة مكشوفة مروية فقط": "irrigated_only",
};

/**
 * Planting in the ground only. Rooted cuttings/slips and pads planted in
 * place are "cuttings"; a rooted ready caper plant is a ready seedling.
 */
export const METHODS: Record<string, PlantingMethod> = {
  "بذر مباشر في الأرض": "direct_sowing",
  "زراعة شتلة جاهزة": "transplanting",
  "غرس شتلة متجذرة جاهزة": "transplanting",
  "غرس شجرة جاهزة": "saplings",
  "غرس شتلة ورد جاهزة": "saplings",
  "زراعة درنات جاهزة": "tubers",
  "زراعة أبصال جاهزة": "bulbs",
  "زراعة فسيلة نخيل متجذرة جاهزة": "offshoots",
  "غرس خلفة متجذرة جاهزة": "offshoots",
  "زراعة فسيلة أو شتلة جاهزة": "offshoots",
  "غرس عقل/شتلات متجذرة جاهزة": "cuttings",
  "غرس لوح صبّار متجذر": "cuttings",
};

export const CATEGORIES: Record<string, CropCategory> = {
  أشجار: "tree",
  فاكهة: "fruit",
  "خضار ثمرية": "fruiting_vegetable",
  "خضار ورقية": "leafy_vegetable",
  "جذور ودرنات": "root_tuber",
  بصليات: "bulb",
  بقوليات: "legume",
  حبوب: "cereal",
  أعلاف: "forage",
  "محاصيل حقلية": "field_crop",
  "أعشاب ونباتات عطرية": "herb",
  "أزهار ونباتات زينة": "ornamental",
};

const ROW_STATUSES = ["estimated", "not_suitable_estimate"] as const;
const EXTRA_STATUS = "estimated_optional";
/** Harvest meaning for fruit borne on the plant: flowering does apply. */
const FRUIT_ON_PLANT = "ثمار على نبات قائم";

export interface CatalogueCrop {
  slug: string;
  name: string;
  scientificName?: string;
  category: CropCategory;
  propagation?: PlantingMethod[];
}

export type IssueLevel = "error" | "excluded" | "warning";

export interface ImportIssue {
  level: IssueLevel;
  file: "main" | "regions" | "extra";
  line: number | null;
  slug: string | null;
  zone: ClimateZone | null;
  /** What was dropped (e.g. «موعد القطف»), for excluded issues. */
  what?: string;
  message: string;
}

export interface ImportedCrop extends CropEstimateData {
  slug: string;
  name: string;
}

export interface ImportResult {
  crops: ImportedCrop[];
  issues: ImportIssue[];
  stats: {
    mainRows: number;
    regionRows: number;
    extraRows: number;
    crops: number;
    plantingWindows: number;
    optionalWindows: number;
    notRecommendedZones: number;
    phaseWindows: number;
  };
}

export interface ImportInput {
  main: CsvTable;
  regions: CsvTable;
  extra: CsvTable;
  catalogue: CatalogueCrop[];
  dataset: string;
}

const monthIndex = new Map<string, number>(LEVANT_MONTHS.map((m, i) => [m, i + 1]));

type Cell = { kind: "month"; month: number } | { kind: "na" } | { kind: "not_recommended" } | { kind: "invalid"; raw: string };

function cell(raw: string): Cell {
  const v = raw.replace(/\s+/g, " ").trim();
  if (v === NOT_APPLICABLE) return { kind: "na" };
  if (v === NOT_RECOMMENDED) return { kind: "not_recommended" };
  const m = monthIndex.get(v);
  return m ? { kind: "month", month: m } : { kind: "invalid", raw: v };
}

type Range = { kind: "range"; start: number; end: number } | { kind: "na" } | { kind: "not_recommended" } | { kind: "invalid"; why: string };

function range(startRaw: string, endRaw: string): Range {
  const a = cell(startRaw);
  const b = cell(endRaw);
  if (a.kind === "month" && b.kind === "month") return { kind: "range", start: a.month, end: b.month };
  if (a.kind === "na" && b.kind === "na") return { kind: "na" };
  if (a.kind === "not_recommended" && b.kind === "not_recommended") return { kind: "not_recommended" };
  if (a.kind === "invalid" || b.kind === "invalid") {
    return { kind: "invalid", why: `قيمة ليست شهرًا معروفًا: «${a.kind === "invalid" ? a.raw : (b as { raw: string }).raw}»` };
  }
  return { kind: "invalid", why: `بداية ونهاية غير متوافقتين («${startRaw}» و«${endRaw}»)` };
}

type Num = { kind: "number"; value: number } | { kind: "na" } | { kind: "invalid"; raw: string };

function count(raw: string, max: number): Num {
  const v = raw.trim();
  if (v === NOT_APPLICABLE || v === NOT_RECOMMENDED) return { kind: "na" };
  if (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max) return { kind: "number", value: Number(v) };
  return { kind: "invalid", raw: v };
}

/** Months from `a` forward to `b` (0–11). */
const forward = (a: number, b: number) => (b - a + 12) % 12;
const months = (r: { start: number; end: number }) => forward(r.start, r.end) + 1;
const inRange = (m: number, r: { start: number; end: number }) => forward(r.start, m) <= forward(r.start, r.end);

/** True when every month of `inner` lies in `outer`. */
function contains(outer: { start: number; end: number }, inner: { start: number; end: number }): boolean {
  for (let i = 0; i < months(inner); i++) if (!inRange(((inner.start - 1 + i) % 12) + 1, outer)) return false;
  return true;
}
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  for (let i = 0; i < months(b); i++) if (inRange(((b.start - 1 + i) % 12) + 1, a)) return true;
  return false;
}

const DAYS_PER_MONTH = 30.44;

/**
 * A harvest season that contradicts the planting window and the row's own
 * days-to-first-harvest. The data are month-level estimates, so one month of
 * slack is allowed; flagged only when
 *  - the harvest starts in the very month planting starts (days ≥ 31), or
 *  - it starts two or more months before the earliest possible month
 *    (planting on the first day of the window + the days), or
 *  - it starts BEFORE the planting window in the same cycle.
 */
export function harvestConflict(plant: { start: number; end: number }, harvest: { start: number; end: number }, days: number): string | null {
  const earliest = Math.floor(days / DAYS_PER_MONTH);
  const gap = forward(plant.start, harvest.start);
  const earliestMonth = LEVANT_MONTHS[(plant.start - 1 + earliest) % 12];
  const said = `يبدأ القطف في ${LEVANT_MONTHS[harvest.start - 1]} والزراعة تبدأ في ${LEVANT_MONTHS[plant.start - 1]}، وأول قطف بعد نحو ${days} يومًا (أقرب شهر ممكن: ${earliestMonth})`;
  if (gap > earliest + 5) return `${said}؛ أي أن القطف يسبق الزراعة في الدورة نفسها`;
  if (gap === 0 && days >= 31) return `${said}؛ لا يمكن القطف في شهر بدء الزراعة`;
  if (gap < earliest - 1) return `${said}؛ القطف أبكر من الممكن بشهرين أو أكثر`;
  return null;
}

function requireColumns(table: CsvTable, cols: Record<string, string>, file: ImportIssue["file"], issues: ImportIssue[]): boolean {
  const missing = Object.values(cols).filter((c) => !table.headers.includes(c));
  for (const c of missing) issues.push({ level: "error", file, line: 1, slug: null, zone: null, message: `عمود مفقود: «${c}»` });
  return missing.length === 0;
}

const zoneLabel = (z: ClimateZone) => Object.keys(ZONES).find((k) => ZONES[k] === z) ?? z;

export function importEstimates(input: ImportInput): ImportResult {
  const issues: ImportIssue[] = [];
  const add = (i: ImportIssue) => issues.push(i);
  const okMain = requireColumns(input.main, ZONE_COLUMNS, "main", issues);
  const okRegions = requireColumns(input.regions, ZONE_COLUMNS, "regions", issues);
  const okExtra = requireColumns(input.extra, EXTRA_COLUMNS, "extra", issues);
  const empty: ImportResult = {
    crops: [],
    issues,
    stats: { mainRows: input.main.rows.length, regionRows: input.regions.rows.length, extraRows: input.extra.rows.length, crops: 0, plantingWindows: 0, optionalWindows: 0, notRecommendedZones: 0, phaseWindows: 0 },
  };
  if (!okMain || !okRegions || !okExtra) return empty;

  const catalogue = new Map(input.catalogue.map((c) => [c.slug, c]));
  const C = ZONE_COLUMNS;

  interface Built {
    slug: string;
    name: string;
    method: PlantingMethod | null;
    windows: PlantingWindow[];
    phases: CropPhaseWindow[];
    zones: ZoneEstimate[];
    harvestMeaning: string | null;
    note: string;
    links: Set<string>;
    /** Planting range and days per zone, for the extra-season checks. */
    zoneRanges: Map<ClimateZone, { plant: { start: number; end: number } | null; days: number | null; suitability: ZoneSuitability }>;
  }
  const built = new Map<string, Built>();
  const seen = new Set<string>();

  const rows = [
    ...input.main.rows.map((r) => ({ ...r, file: "main" as const })),
    ...input.regions.rows.map((r) => ({ ...r, file: "regions" as const })),
  ];
  for (const { line, values: v, file } of rows) {
    const slug = v[C.slug];
    const base = { file, line, slug: slug || null } as const;
    const crop = catalogue.get(slug);
    if (!crop) {
      add({ ...base, zone: null, level: "error", message: `رمز صنف غير موجود في الدليل: «${slug}»` });
      continue;
    }
    if (v[C.name] !== crop.name) add({ ...base, zone: null, level: "error", message: `الاسم «${v[C.name]}» لا يطابق اسم الصنف في الدليل «${crop.name}»` });
    if (crop.scientificName && v[C.scientificName] !== crop.scientificName) {
      add({ ...base, zone: null, level: "warning", message: `الاسم العلمي «${v[C.scientificName]}» يختلف عن الدليل «${crop.scientificName}»` });
    }
    const category = CATEGORIES[v[C.category]];
    if (!category) add({ ...base, zone: null, level: "warning", message: `تصنيف غير معروف «${v[C.category]}»؛ بقي تصنيف الدليل` });
    else if (category !== crop.category) add({ ...base, zone: null, level: "warning", message: `التصنيف «${v[C.category]}» يختلف عن تصنيف الدليل؛ بقي تصنيف الدليل` });

    const zone = ZONES[v[C.zone]];
    if (!zone) {
      add({ ...base, zone: null, level: "error", message: `منطقة مناخية غير معروفة «${v[C.zone]}»` });
      continue;
    }
    const at = { ...base, zone };
    if (v[C.country] !== "فلسطين") {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `البلد «${v[C.country]}» ليس فلسطين؛ لا تُعمَّم البيانات على دولة أخرى` });
      continue;
    }
    const key = `${slug}|${zone}`;
    if (seen.has(key)) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: "صف مكرر للصنف والمنطقة نفسيهما" });
      continue;
    }
    seen.add(key);

    const status = v[C.status];
    if (!(ROW_STATUSES as readonly string[]).includes(status)) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `معرف حالة غير مقبول «${status}»: التقديرات لا تُستورد كمعلومة موثقة أو مراجعة` });
      continue;
    }
    if (!/تقدير|غير موثق/.test(v[C.infoGrade])) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `درجة المعلومة «${v[C.infoGrade]}» لا تصرّح بأنها تقدير` });
      continue;
    }
    const method = METHODS[v[C.method]];
    if (!method) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `طريقة زراعة غير معروفة أو ليست زراعة في الأرض: «${v[C.method]}»` });
      continue;
    }
    const suitability = SUITABILITY[v[C.suitability]];
    if (!suitability) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `قيمة ملاءمة غير معروفة «${v[C.suitability]}»` });
      continue;
    }
    const irrigation = SYSTEMS[v[C.system]];
    if (!irrigation) {
      add({ ...at, level: "excluded", what: "الصف كاملًا", message: `نظام زراعة غير معروف «${v[C.system]}»` });
      continue;
    }

    let b = built.get(slug);
    if (!b) {
      b = { slug, name: crop.name, method: null, windows: [], phases: [], zones: [], harvestMeaning: null, note: "", links: new Set(), zoneRanges: new Map() };
      built.set(slug, b);
    }
    if (b.method && b.method !== method) {
      add({ ...at, level: "warning", message: `طريقة الزراعة «${v[C.method]}» تختلف عن طريقة الصنف في صف آخر؛ اعتُمدت طريقة الصف الأساسي` });
    }
    if (file === "main" || !b.method) {
      b.method = method;
      b.harvestMeaning = v[C.harvestMeaning] || null;
      b.note = v[C.note];
    }
    if (/^https:\/\//.test(v[C.link])) b.links.add(v[C.link]);
    else if (v[C.link]) add({ ...at, level: "warning", message: `رابط غير صالح «${v[C.link]}»؛ لم يُستورد` });

    const plant = range(v[C.plantStart], v[C.plantEnd]);
    const flower = range(v[C.flowerStart], v[C.flowerEnd]);
    const harvest = range(v[C.harvestStart], v[C.harvestEnd]);
    const days = count(v[C.days], 400);
    const years = count(v[C.years], 30);
    const notApplicable: NotApplicableField[] = [];
    const zoneEstimate: ZoneEstimate = {
      zone,
      countryCode: COUNTRY_CODE,
      suitability,
      irrigation,
      daysToFirstHarvest: null,
      yearsToFirstYield: null,
      notApplicable,
    };

    // Restriction rows: «لا يُوصى» / «غير ملائم غالبًا» — no planting window.
    const restricted = status === "not_suitable_estimate" || suitability === "not_recommended" || plant.kind === "not_recommended";
    if (restricted) {
      const consistent = status === "not_suitable_estimate" && suitability === "not_recommended" && plant.kind === "not_recommended";
      if (!consistent) {
        add({
          ...at,
          level: "excluded",
          what: "موعد الزراعة",
          message: `تعارض في القيود: الحالة «${status}»، الملاءمة «${v[C.suitability]}»، وموعد الزراعة «${v[C.plantStart]}–${v[C.plantEnd]}». عومل الصف كمنطقة غير موصى بها`,
        });
      }
      zoneEstimate.suitability = "not_recommended";
      b.zones.push(zoneEstimate);
      b.zoneRanges.set(zone, { plant: null, days: null, suitability: "not_recommended" });
      continue;
    }

    let plantRange: { start: number; end: number } | null = null;
    if (plant.kind === "range") {
      plantRange = { start: plant.start, end: plant.end };
      if (months(plantRange) >= 9) add({ ...at, level: "warning", message: `موعد زراعة طويل جدًا (${months(plantRange)} أشهر)؛ يحتاج تحققًا محليًا` });
      b.windows.push({ zone, countryCode: COUNTRY_CODE, startMonth: plant.start, endMonth: plant.end, method, confidence: "estimated" });
    } else {
      add({ ...at, level: "excluded", what: "موعد الزراعة", message: plant.kind === "invalid" ? plant.why : `موعد الزراعة «${v[C.plantStart]}» دون قيد «لا يُوصى» في صف قابل للزراعة` });
    }

    if (days.kind === "number") zoneEstimate.daysToFirstHarvest = days.value;
    else if (days.kind === "na") notApplicable.push("days");
    else add({ ...at, level: "excluded", what: "عدد الأيام حتى أول قطف", message: `قيمة غير صالحة «${days.raw}»` });
    if (years.kind === "number") zoneEstimate.yearsToFirstYield = years.value;
    else if (years.kind === "na") notApplicable.push("years");
    else add({ ...at, level: "excluded", what: "عدد السنوات حتى أول إنتاج", message: `قيمة غير صالحة «${years.raw}»` });
    if (method === "saplings" && zoneEstimate.yearsToFirstYield == null && v[C.harvestMeaning] === FRUIT_ON_PLANT) {
      add({ ...at, level: "warning", message: "شجرة مثمرة دون عدد سنوات حتى أول إنتاج" });
    }

    // Flowering: «لا ينطبق» is accepted except for fruit borne on the plant,
    // where flowering does apply — then it is unknown, not "not applicable".
    if (flower.kind === "range") {
      b.phases.push({ kind: "flowering", zone, countryCode: COUNTRY_CODE, startMonth: flower.start, endMonth: flower.end, confidence: "estimated" });
    } else if (flower.kind === "na") {
      if (v[C.harvestMeaning] === FRUIT_ON_PLANT) {
        add({ ...at, level: "warning", message: "الإزهار «لا ينطبق» لنبات يُقطف ثمره؛ الإزهار ينطبق عليه، فاعتُبر «غير معروف» بدل «لا ينطبق»" });
      } else notApplicable.push("flowering");
    } else add({ ...at, level: "excluded", what: "موعد الإزهار", message: flower.kind === "invalid" ? flower.why : "قيمة «لا يُوصى» في عمود الإزهار" });

    if (harvest.kind === "range") {
      const h = { start: harvest.start, end: harvest.end };
      const conflict = plantRange && days.kind === "number" ? harvestConflict(plantRange, h, days.value) : null;
      if (conflict) {
        add({ ...at, level: "excluded", what: "موسم القطف", message: `تعارض زراعي: ${conflict}. استُبعد موسم القطف لهذه المنطقة وبقي موعد الزراعة` });
      } else {
        b.phases.push({ kind: "harvest", zone, countryCode: COUNTRY_CODE, startMonth: h.start, endMonth: h.end, confidence: "estimated" });
        if (months(h) === 12) add({ ...at, level: "warning", message: "موسم القطف يغطي السنة كلها؛ تقدير عام جدًا" });
        if (flower.kind === "range" && v[C.harvestMeaning] === FRUIT_ON_PLANT && days.kind === "number" && forward(flower.start, h.start) > 6) {
          add({ ...at, level: "warning", message: "يبدأ القطف قبل بدء الإزهار في الدورة نفسها؛ راجع الإزهار والقطف" });
        }
        if (flower.kind === "range" && flower.start === h.start && flower.end === h.end && years.kind === "number" && v[C.harvestMeaning] === FRUIT_ON_PLANT) {
          add({ ...at, level: "warning", message: "موسما الإزهار والقطف متطابقان؛ غالبًا يخص القطف ثمار إزهار الموسم السابق" });
        }
      }
    } else if (harvest.kind === "na") notApplicable.push("harvest");
    else add({ ...at, level: "excluded", what: "موسم القطف", message: harvest.kind === "invalid" ? harvest.why : "قيمة «لا يُوصى» في عمود القطف" });

    b.zones.push(zoneEstimate);
    b.zoneRanges.set(zone, { plant: plantRange, days: zoneEstimate.daysToFirstHarvest, suitability });
  }

  // Each crop must cover the five zones exactly once.
  for (const b of built.values()) {
    const zones = new Set(b.zones.map((z) => z.zone));
    const missing = Object.values(ZONES).filter((z) => !zones.has(z));
    if (missing.length) add({ file: "regions", line: null, slug: b.slug, zone: null, level: "warning", message: `لا توجد بيانات لمناطق: ${missing.map(zoneLabel).join("، ")}` });
  }
  const mainSlugs = new Set(input.main.rows.map((r) => r.values[C.slug]));
  for (const r of input.regions.rows) {
    if (!mainSlugs.has(r.values[C.slug])) add({ file: "regions", line: r.line, slug: r.values[C.slug], zone: null, level: "warning", message: "صنف في ورقة المناطق دون صف أساسي" });
  }

  // Optional additional seasons.
  const E = EXTRA_COLUMNS;
  const extraSeen = new Set<string>();
  for (const { line, values: v } of input.extra.rows) {
    const slug = v[E.slug];
    const zone = ZONES[v[E.zone]] ?? null;
    const at = { file: "extra" as const, line, slug: slug || null, zone };
    const b = built.get(slug);
    const exclude = (message: string) => add({ ...at, level: "excluded", what: "العروة الإضافية", message });
    if (!b) {
      add({ ...at, level: "error", message: `عروة لصنف غير موجود في الورقة الأساسية: «${slug}»` });
      continue;
    }
    if (v[E.name] !== b.name) add({ ...at, level: "warning", message: `اسم النبات «${v[E.name]}» لا يطابق «${b.name}»` });
    if (!zone) {
      exclude(`منطقة غير معروفة «${v[E.zone]}»`);
      continue;
    }
    if (v[E.country] !== "فلسطين") {
      exclude(`البلد «${v[E.country]}» ليس فلسطين`);
      continue;
    }
    if (v[E.status] !== EXTRA_STATUS) {
      exclude(`حالة الاستيراد «${v[E.status]}» غير مقبولة للعروات الإضافية`);
      continue;
    }
    if (!/تقدير/.test(v[E.infoGrade])) {
      exclude(`نوع المعلومة «${v[E.infoGrade]}» لا يصرّح بأنه تقدير`);
      continue;
    }
    const method = METHODS[v[E.method]];
    if (!method) {
      exclude(`طريقة زراعة غير معروفة أو ليست زراعة في الأرض: «${v[E.method]}»`);
      continue;
    }
    if (method !== b.method) add({ ...at, level: "warning", message: `طريقة العروة «${v[E.method]}» تختلف عن طريقة الصنف الأساسية` });
    const plant = range(v[E.plantStart], v[E.plantEnd]);
    const harvest = range(v[E.harvestStart], v[E.harvestEnd]);
    if (plant.kind !== "range") {
      exclude(plant.kind === "invalid" ? plant.why : "لا يوجد موعد زراعة للعروة");
      continue;
    }
    const p = { start: plant.start, end: plant.end };
    const key = `${slug}|${zone}|${p.start}|${p.end}|${method}`;
    if (extraSeen.has(key)) {
      exclude("عروة مكررة");
      continue;
    }
    extraSeen.add(key);
    const z = b.zoneRanges.get(zone);
    if (z?.suitability === "not_recommended") {
      exclude(`المنطقة ${zoneLabel(zone)} مصنفة «غير ملائم غالبًا» لهذا الصنف`);
      continue;
    }
    if (z?.plant && contains(z.plant, p)) {
      exclude("العروة داخلة كليًا في موعد الزراعة الأساسي للمنطقة نفسها (تكرار)");
      continue;
    }
    if (z?.plant && overlaps(z.plant, p)) add({ ...at, level: "warning", message: "العروة تتداخل جزئيًا مع موعد الزراعة الأساسي" });
    const note = [v[E.condition], v[E.infoGrade]].filter(Boolean).join(" — ");
    b.windows.push({ zone, countryCode: COUNTRY_CODE, startMonth: p.start, endMonth: p.end, method, confidence: "estimated", optional: true, note });
    if (/^https:\/\//.test(v[E.link])) b.links.add(v[E.link]);
    if (harvest.kind === "range") {
      const h = { start: harvest.start, end: harvest.end };
      const conflict = z?.days ? harvestConflict(p, h, z.days) : null;
      if (conflict) {
        add({ ...at, level: "excluded", what: "موسم قطف العروة", message: `تعارض زراعي: ${conflict}` });
      } else {
        b.phases.push({ kind: "harvest", zone, countryCode: COUNTRY_CODE, startMonth: h.start, endMonth: h.end, confidence: "estimated", optional: true });
      }
    } else if (harvest.kind === "invalid") add({ ...at, level: "excluded", what: "موسم قطف العروة", message: harvest.why });
  }

  const crops: ImportedCrop[] = [];
  for (const b of built.values()) {
    if (!b.method) continue;
    const crop = catalogue.get(b.slug)!;
    if (!(crop.propagation ?? []).includes(b.method)) {
      add({ file: "main", line: null, slug: b.slug, zone: null, level: "warning", message: `طريقة الزراعة في الملف ليست ضمن طرق الصنف في الدليل؛ أُضيفت كطريقة افتراضية` });
    }
    crops.push({
      slug: b.slug,
      name: b.name,
      method: b.method,
      windows: b.windows,
      phases: b.phases,
      zones: b.zones,
      info: { dataset: input.dataset, harvestMeaning: b.harvestMeaning, note: b.note, contextUrls: [...b.links].sort() },
    });
  }
  crops.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    crops,
    issues,
    stats: {
      ...empty.stats,
      crops: crops.length,
      plantingWindows: crops.reduce((n, c) => n + c.windows.filter((w) => !w.optional).length, 0),
      optionalWindows: crops.reduce((n, c) => n + c.windows.filter((w) => w.optional).length, 0),
      notRecommendedZones: crops.reduce((n, c) => n + c.zones.filter((z) => z.suitability === "not_recommended").length, 0),
      phaseWindows: crops.reduce((n, c) => n + c.phases.length, 0),
    },
  };
}
