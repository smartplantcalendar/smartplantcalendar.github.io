import type { Crop, CropGuideEntry, PlantingWindow, TaskTemplate } from "@/domain/types";

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
    sort_order: number;
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
  "*, crop_planting_windows(*), crop_task_templates(*), crop_guides(*)";

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
    })),
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
