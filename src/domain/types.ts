/**
 * Core domain types shared by the UI, the plan generator, the local (guest)
 * store and the Supabase repository. Keep these free of framework imports so
 * they can be unit-tested in isolation.
 */

/** Calendar date without time, always formatted as `YYYY-MM-DD`. */
export type ISODate = string;

export const CLIMATE_ZONES = [
  "coastal",
  "highland",
  "inland_plain",
  "jordan_valley",
  "arid",
] as const;
export type ClimateZone = (typeof CLIMATE_ZONES)[number];

export const SPACE_TYPES = [
  "home_garden",
  "rooftop",
  "balcony",
  "containers",
  "small_plot",
  "farm",
  "greenhouse",
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const CROP_CATEGORIES = [
  "fruiting_vegetable",
  "leafy_vegetable",
  "root_tuber",
  "bulb",
  "herb",
  "fruit",
  "tree",
  "legume",
  "cereal",
  "forage",
  "field_crop",
  "ornamental",
] as const;
export type CropCategory = (typeof CROP_CATEGORIES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SUN_REQUIREMENTS = ["full_sun", "partial_sun", "shade_tolerant"] as const;
export type SunRequirement = (typeof SUN_REQUIREMENTS)[number];

export const WATER_NEEDS = ["low", "moderate", "high"] as const;
export type WaterNeed = (typeof WATER_NEEDS)[number];

export const LIFE_CYCLES = ["annual", "perennial"] as const;
export type LifeCycle = (typeof LIFE_CYCLES)[number];

/**
 * How a crop is planted. Every method except `nursery_sowing` means planting
 * in the FINAL place (field, garden, pot) with ready material: seeds sown
 * directly, ready seedlings from a nursery, tubers, cloves, bulbs, cuttings,
 * offshoots or ready saplings/trees. `nursery_sowing` (sowing seeds in trays
 * to raise your own seedlings) is a different, earlier date: it is kept for
 * «لمن يريد تجهيز الأشتال بنفسه» only and never used as the planting date.
 */
export const PLANTING_METHODS = [
  "direct_sowing",
  "transplanting",
  "tubers",
  "cloves",
  "cuttings",
  "saplings",
  "nursery_sowing",
  "offshoots",
  "bulbs",
] as const;

/** Methods that put the plant in its final place (everything but the nursery). */
export const FIELD_METHODS = PLANTING_METHODS.filter((m) => m !== "nursery_sowing");
export type PlantingMethod = (typeof PLANTING_METHODS)[number];

export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
export type Season = (typeof SEASONS)[number];

/**
 * `preliminary` = general seed data, not yet reviewed by an agronomist.
 * `incomplete` = the crop is listed (names, category) but no reliable
 * planting information has been added yet: it has no windows, no tasks and
 * cannot be planned until a sourced entry replaces it.
 */
export const DATA_STATUSES = ["preliminary", "reviewed", "incomplete"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export const TASK_TYPES = [
  "soil_prep",
  "planting",
  "irrigation",
  "fertilizing",
  "care",
  "pest_check",
  "harvest",
  "custom",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["pending", "done", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PLANTING_STATUSES = ["active", "harvested", "archived"] as const;
export type PlantingStatus = (typeof PLANTING_STATUSES)[number];

export const GUIDE_SECTIONS = [
  "overview",
  "planting",
  "care",
  "irrigation",
  "fertilization",
  "harvest",
  "problems",
] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export interface PlantingWindow {
  /**
   * Climate zone the window was documented for. null = a general date for the
   * whole country (`countryCode`), not verified for any particular zone: it is
   * used only when the crop has no window for the visitor's zone, and the UI
   * labels it as general.
   */
  zone: ClimateZone | null;
  /**
   * ISO country the source covers (e.g. "PS"). Empty = general Levant guidance
   * (the original preliminary data). A scoped window is never shown as
   * documented for a location in another country.
   */
  countryCode?: string;
  /** 1–12. A window may wrap the year end (e.g. 10 → 2). */
  startMonth: number;
  endMonth: number;
  method: PlantingMethod;
  note?: string;
  /** Id of the reference in src/data/crop-sources.ts this window comes from. */
  sourceId?: string;
  /** Where in the reference (section/paragraph) and what it says. */
  sourceDetail?: string;
}

/**
 * A rule the plan generator expands into dated tasks. Offsets are measured in
 * days from the planting date (negative = before planting).
 */
export interface TaskTemplate {
  key: string;
  type: TaskType;
  title: string;
  description: string;
  offsetDays: number;
  /** When set, the task repeats every N days until `untilOffsetDays`. */
  repeatEveryDays?: number;
  untilOffsetDays?: number;
  /** Optional month filter (1–12): occurrences outside these months are skipped. */
  activeMonths?: number[];
}

export interface CropGuideEntry {
  section: GuideSection;
  title: string;
  body: string;
}

export interface Crop {
  id: string;
  slug: string;
  name: string;
  otherNames?: string[];
  scientificName?: string;
  category: CropCategory;
  lifeCycle: LifeCycle;
  /** null = not documented yet (never guessed). */
  difficulty: Difficulty | null;
  sun: SunRequirement | null;
  water: WaterNeed | null;
  /** Usual ways to establish the crop, most common first (general botanical knowledge, not dates). */
  propagation?: PlantingMethod[];
  /** The most common way to plant it in the final place (default shown first). */
  primaryMethod?: PlantingMethod | null;
  /** When it flowers — separate from planting and harvest; null = not documented. */
  floweringNote?: string | null;
  /** When it is harvested/picked (season), for crops where days-to-harvest do not apply. */
  harvestNote?: string | null;
  /** Trees/perennials: time from planting in the ground to the first yield. */
  firstYieldNote?: string | null;
  spaceTypes: SpaceType[];
  /**
   * Damaged by frost (warm-season crops). Drives frost warnings in
   * recommendations; false means "no specific frost rule", not "frost-proof".
   */
  frostSensitive: boolean;
  /** Approximate days from planting to first harvest, null when unreliable. */
  growthDaysMin: number | null;
  growthDaysMax: number | null;
  growthNote?: string;
  summary: string;
  wateringSummary: string;
  imageUrl?: string | null;
  imageAlt?: string;
  dataStatus: DataStatus;
  sourceNote: string;
  windows: PlantingWindow[];
  templates: TaskTemplate[];
  guide: CropGuideEntry[];
}

export interface Country {
  code: string;
  name: string;
}

export interface Region {
  id: string;
  countryCode: string;
  name: string;
  zone: ClimateZone;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface Garden {
  id: string;
  name: string;
  spaceType: SpaceType;
  regionId: string | null;
  zone: ClimateZone;
  areaM2: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface Planting {
  id: string;
  gardenId: string;
  cropId: string;
  cropSlug: string;
  cropName: string;
  plantedOn: ISODate;
  method: PlantingMethod | null;
  areaM2: number | null;
  quantity: number | null;
  status: PlantingStatus;
  expectedHarvestStart: ISODate | null;
  expectedHarvestEnd: ISODate | null;
  notes: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  plantingId: string | null;
  gardenId: string | null;
  type: TaskType;
  title: string;
  description: string | null;
  dueDate: ISODate;
  status: TaskStatus;
  completedAt: string | null;
  postponedCount: number;
  source: "generated" | "custom";
  createdAt: string;
}

export interface UserDataSnapshot {
  gardens: Garden[];
  plantings: Planting[];
  tasks: Task[];
}
