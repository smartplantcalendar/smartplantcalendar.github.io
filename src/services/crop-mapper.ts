import { CLIMATE_ZONES, type Crop, type CropGuideEntry, type CropPhaseWindow, type PlantingWindow, type TaskTemplate, type ZoneEstimate } from "@/domain/types";

/* Row shapes returned by Supabase for the crop catalogue. */
export interface CropRow {
  id: string;
  slug: string;
  name: string;
  other_names: string[] | null;
  scientific_name: string | null;
  category: Crop["category"];
  life_cycle: Crop["lifeCycle"];
  difficulty: Crop["difficulty"];
  sun: Crop["sun"];
  water: Crop["water"];
  frost_sensitive?: boolean | null;
  propagation?: Crop["propagation"] | null;
  primary_method?: Crop["primaryMethod"] | null;
  flowering_note?: string | null;
  harvest_note?: string | null;
  first_yield_note?: string | null;
  space_types: Crop["spaceTypes"];
  growth_days_min: number | null;
  growth_days_max: number | null;
  growth_note: string | null;
  summary: string;
  watering_summary: string | null;
  image_url: string | null;
  image_alt: string | null;
  data_status: Crop["dataStatus"];
  source_note: string | null;
  estimate_dataset?: string | null;
  estimate_harvest_meaning?: string | null;
  estimate_note?: string | null;
  estimate_links?: string[] | null;
  is_published?: boolean;
  crop_planting_windows?: {
    zone: PlantingWindow["zone"];
    country_code?: string | null;
    start_month: number;
    end_month: number;
    method: PlantingWindow["method"];
    note: string | null;
    source_id?: string | null;
    source_detail?: string | null;
    confidence?: "documented" | "estimated" | null;
    optional?: boolean | null;
    sort_order: number;
  }[];
  crop_phase_windows?: {
    kind: CropPhaseWindow["kind"];
    zone: CropPhaseWindow["zone"];
    country_code: string;
    start_month: number;
    end_month: number;
    optional: boolean | null;
    sort_order: number;
  }[];
  crop_zone_estimates?: {
    zone: ZoneEstimate["zone"];
    country_code: string;
    suitability: ZoneEstimate["suitability"];
    irrigation: ZoneEstimate["irrigation"];
    days_to_first_harvest: number | null;
    years_to_first_yield: number | null;
    not_applicable: ZoneEstimate["notApplicable"] | null;
  }[];
  crop_task_templates?: {
    key: string;
    type: TaskTemplate["type"];
    title: string;
    description: string;
    offset_days: number;
    repeat_every_days: number | null;
    until_offset_days: number | null;
    active_months: number[] | null;
    sort_order: number;
  }[];
  crop_guides?: { section: CropGuideEntry["section"]; title: string; body: string; sort_order: number }[];
}

export const CROP_SELECT =
  "*, crop_planting_windows(*), crop_task_templates(*), crop_guides(*), crop_phase_windows(*), crop_zone_estimates(*)";

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function mapCropRow(row: CropRow): Crop {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    otherNames: row.other_names ?? [],
    scientificName: row.scientific_name ?? undefined,
    category: row.category,
    lifeCycle: row.life_cycle,
    difficulty: row.difficulty,
    sun: row.sun,
    water: row.water,
    frostSensitive: row.frost_sensitive ?? false,
    primaryMethod: row.primary_method ?? null,
    floweringNote: row.flowering_note ?? null,
    harvestNote: row.harvest_note ?? null,
    firstYieldNote: row.first_yield_note ?? null,
    propagation: row.propagation?.length ? row.propagation : [...new Set((row.crop_planting_windows ?? []).map((w) => w.method))],
    spaceTypes: row.space_types ?? [],
    growthDaysMin: row.growth_days_min,
    growthDaysMax: row.growth_days_max,
    growthNote: row.growth_note ?? undefined,
    summary: row.summary,
    wateringSummary: row.watering_summary ?? "",
    imageUrl: row.image_url,
    imageAlt: row.image_alt ?? row.name,
    dataStatus: row.data_status,
    sourceNote: row.source_note ?? "",
    windows: [...(row.crop_planting_windows ?? [])].sort(bySort).map((w) => ({
      zone: w.zone ?? null,
      countryCode: w.country_code ?? undefined,
      startMonth: w.start_month,
      endMonth: w.end_month,
      method: w.method,
      note: w.note ?? undefined,
      sourceId: w.source_id ?? undefined,
      sourceDetail: w.source_detail ?? undefined,
      ...(w.confidence === "estimated" ? { confidence: "estimated" as const } : {}),
      ...(w.optional ? { optional: true } : {}),
    })),
    phases: [...(row.crop_phase_windows ?? [])].sort(bySort).map((p) => ({
      kind: p.kind,
      zone: p.zone,
      countryCode: p.country_code,
      startMonth: p.start_month,
      endMonth: p.end_month,
      confidence: "estimated" as const,
      ...(p.optional ? { optional: true } : {}),
    })),
    zoneEstimates: [...(row.crop_zone_estimates ?? [])]
      .sort((a, b) => CLIMATE_ZONES.indexOf(a.zone) - CLIMATE_ZONES.indexOf(b.zone))
      .map((z) => ({
        zone: z.zone,
        countryCode: z.country_code,
        suitability: z.suitability,
        irrigation: z.irrigation,
        daysToFirstHarvest: z.days_to_first_harvest,
        yearsToFirstYield: z.years_to_first_yield,
        notApplicable: z.not_applicable ?? [],
      })),
    estimate: row.estimate_dataset
      ? {
          dataset: row.estimate_dataset,
          harvestMeaning: row.estimate_harvest_meaning ?? null,
          note: row.estimate_note ?? "",
          contextUrls: row.estimate_links ?? [],
        }
      : null,
    templates: [...(row.crop_task_templates ?? [])].sort(bySort).map((t) => ({
      key: t.key,
      type: t.type,
      title: t.title,
      description: t.description,
      offsetDays: t.offset_days,
      repeatEveryDays: t.repeat_every_days ?? undefined,
      untilOffsetDays: t.until_offset_days ?? undefined,
      activeMonths: t.active_months?.length ? t.active_months : undefined,
    })),
    guide: [...(row.crop_guides ?? [])].sort(bySort).map((g) => ({ section: g.section, title: g.title, body: g.body })),
  };
}
