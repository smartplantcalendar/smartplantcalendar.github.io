import { describe, expect, it } from "vitest";
import { SEED_CROPS } from "@/data/crops";
import { isPlannable, listCrop } from "@/domain/crop-search";
import { ESTIMATE_NOTICE } from "@/domain/labels";
import { generatePlan } from "@/domain/plan-generator";
import {
  describeSimpleStatus,
  evaluateWindowFit,
  isNotRecommended,
  mainWindowsForZone,
  optionalWindowsForZone,
  phasesForZone,
  primaryMethod,
  propagationMethods,
  simplePlantingStatus,
  windowsForZone,
} from "@/domain/planting-windows";
import { recommendCrops } from "@/domain/recommendations";
import { mapCropRow, type CropRow } from "@/services/crop-mapper";
import type { Crop, PlantingWindow } from "@/domain/types";

const crop = (slug: string) => SEED_CROPS.find((c) => c.slug === slug)!;
const PS = "PS";

describe("estimated crops in the catalogue", () => {
  const estimated = SEED_CROPS.filter((c) => c.dataStatus === "estimated");

  it("88 crops carry estimates; none is marked documented or reviewed", () => {
    expect(estimated).toHaveLength(88);
    for (const c of estimated) {
      expect(c.windows.length, c.slug).toBeGreaterThan(0);
      expect(c.windows.every((w) => w.confidence === "estimated" && w.countryCode === PS && w.zone !== null), c.slug).toBe(true);
      expect(c.estimate?.dataset).toBe("smartplant-88-ps");
      // Growth periods stay unknown on the crop itself; estimates live per zone.
      expect(c.growthDaysMin).toBeNull();
      expect(c.templates).toEqual([]);
      expect(c.sourceNote).toContain(ESTIMATE_NOTICE);
    }
  });

  it("documented crops keep their windows unchanged and documented", () => {
    for (const slug of ["tomato", "olive", "okra", "wheat"]) {
      const c = crop(slug);
      expect(c.dataStatus).toBe("preliminary");
      expect(c.windows.every((w) => w.confidence === undefined), slug).toBe(true);
    }
  });

  it("estimated crops can be planned; lists drop the long phase data", () => {
    expect(isPlannable(crop("eggplant"))).toBe(true);
    expect(listCrop(crop("eggplant")).phases).toEqual([]);
    expect(listCrop(crop("eggplant")).zoneEstimates).toHaveLength(5);
  });

  it("the estimate names the default planting method", () => {
    expect(primaryMethod(crop("parsley"))).toBe("transplanting");
    expect(primaryMethod(crop("caper"))).toBe("transplanting");
    expect(propagationMethods(crop("caper"))).toContain("cuttings");
    expect(primaryMethod(crop("fig"))).toBe("saplings");
    expect(primaryMethod(crop("date-palm"))).toBe("offshoots");
  });
});

describe("documented dates take precedence over estimates", () => {
  const est = (zone: PlantingWindow["zone"], start: number, end: number): PlantingWindow => ({ zone, countryCode: PS, startMonth: start, endMonth: end, method: "direct_sowing", confidence: "estimated" });
  const doc = (zone: PlantingWindow["zone"], start: number, end: number): PlantingWindow => ({ zone, countryCode: PS, startMonth: start, endMonth: end, method: "direct_sowing" });
  const make = (windows: PlantingWindow[]): Crop => ({ ...crop("zucchini"), windows });

  it("a documented zone window replaces the estimate for that zone only", () => {
    const c = make([doc("highland", 3, 3), est("highland", 4, 6), est("coastal", 3, 5)]);
    expect(windowsForZone(c, "highland", PS)).toEqual([doc("highland", 3, 3)]);
    expect(windowsForZone(c, "coastal", PS)).toEqual([est("coastal", 3, 5)]);
  });

  it("a documented general country date also outranks a zone estimate", () => {
    const c = make([doc(null, 10, 11), est("highland", 4, 6)]);
    expect(windowsForZone(c, "highland", PS)).toEqual([doc(null, 10, 11)]);
  });

  it("recommendations rank documented crops before estimated ones", () => {
    const rec = recommendCrops({ crops: [crop("zucchini"), crop("cucumber")], today: "2026-04-15", zone: "highland", spaceType: "home_garden", country: PS });
    expect(rec.groups.now.map((r) => r.crop.slug)).toEqual(["cucumber", "zucchini"]);
    const z = rec.groups.now.find((r) => r.crop.slug === "zucchini")!;
    expect(z.estimated).toBe(true);
    expect(z.warnings.join(" ")).toContain(ESTIMATE_NOTICE);
    expect(rec.groups.now.find((r) => r.crop.slug === "cucumber")!.estimated).toBe(false);
  });
});

describe("estimates are Palestinian and zone-specific", () => {
  it("are not shown for another country or an unknown one", () => {
    expect(windowsForZone(crop("fig"), "highland", PS)).toHaveLength(1);
    expect(windowsForZone(crop("fig"), "highland", "JO")).toEqual([]);
    expect(windowsForZone(crop("fig"), "highland", null)).toEqual([]);
    expect(simplePlantingStatus(crop("fig"), "highland", "2026-01-10", "JO").kind).toBe("no_data");
  });

  it("fig in Hebron (highland) in January: within the ESTIMATED window, labelled as such", () => {
    const s = simplePlantingStatus(crop("fig"), "highland", "2026-01-10", PS);
    expect(s).toMatchObject({ kind: "now", estimated: true });
    expect(describeSimpleStatus(s)).toEqual({ title: "ضمن الموعد التقديري للزراعة", detail: expect.stringContaining("موعد تقديري") });
  });

  it("«غير ملائم غالبًا» zones are restrictions, not dates", () => {
    expect(isNotRecommended(crop("apple"), "coastal", PS)).toBe(true);
    const s = simplePlantingStatus(crop("apple"), "coastal", "2026-01-10", PS);
    expect(s).toMatchObject({ kind: "no_data", notRecommended: true });
    expect(describeSimpleStatus(s).title).toBe("غير ملائم غالبًا لمنطقتك");
    const rec = recommendCrops({ crops: [crop("apple")], today: "2026-01-10", zone: "coastal", spaceType: "home_garden", country: PS });
    expect(rec.groups.no_data[0].reasons[0]).toContain("غير ملائم غالبًا");
  });

  it("optional extra seasons are shown but never recommended", () => {
    const melon = crop("melon");
    expect(optionalWindowsForZone(melon, "coastal", PS)).toHaveLength(1);
    expect(mainWindowsForZone(melon, "coastal", PS).some((w) => w.optional)).toBe(false);
    // August on the coast is only the optional, high-risk season.
    expect(simplePlantingStatus(melon, "coastal", "2026-08-10", PS).kind).not.toBe("now");
    const rec = recommendCrops({ crops: [melon], today: "2026-08-10", zone: "coastal", spaceType: "farm", country: PS });
    expect(rec.groups.now).toHaveLength(0);
  });

  it("flowering, harvest, days and years are separate per zone", () => {
    const eggplant = crop("eggplant");
    expect(phasesForZone(eggplant, "flowering", "highland", PS).map((p) => [p.startMonth, p.endMonth])).toEqual([[6, 10]]);
    expect(phasesForZone(eggplant, "harvest", "highland", PS).map((p) => [p.startMonth, p.endMonth])).toEqual([[7, 10]]);
    expect(phasesForZone(eggplant, "harvest", "highland", "JO")).toEqual([]);
    expect(eggplant.zoneEstimates?.find((z) => z.zone === "highland")?.daysToFirstHarvest).toBe(80);
    expect(crop("almond").zoneEstimates?.find((z) => z.zone === "highland")?.yearsToFirstYield).toBe(3);
  });
});

describe("plans from estimated crops", () => {
  it("eggplant: tentative first-harvest task from the zone estimate, with the estimate notice", () => {
    const plan = generatePlan({ crop: crop("eggplant"), plantedOn: "2026-04-15", zone: "highland", spaceType: "home_garden", country: PS });
    expect(plan.windowFit).toBe("in_window");
    expect(plan.isTentative).toBe(true);
    expect(plan.expectedHarvestStart).toBe("2026-07-04");
    expect(plan.tasks.find((t) => t.templateKey === "estimate-first-harvest")?.title).toContain("التقديرية");
    expect(plan.warnings.join(" ")).toContain(ESTIMATE_NOTICE);
  });

  it("fig: no invented harvest date; years to first yield as an estimate", () => {
    const plan = generatePlan({ crop: crop("fig"), plantedOn: "2026-01-10", zone: "highland", spaceType: "home_garden", country: PS });
    expect(plan.expectedHarvestStart).toBeNull();
    expect(plan.warnings.join(" ")).toContain("أول إنتاج بعد نحو 2 سنوات");
  });

  it("outside Palestine the estimate gives no window fit", () => {
    expect(evaluateWindowFit(crop("eggplant"), "highland", 4, "JO")).toBe("no_data");
  });
});

describe("database rows", () => {
  it("map back to the same estimated crop", () => {
    const c = crop("apple");
    const row: CropRow = {
      id: "x",
      slug: c.slug,
      name: c.name,
      other_names: c.otherNames ?? [],
      scientific_name: c.scientificName ?? null,
      category: c.category,
      life_cycle: c.lifeCycle,
      difficulty: null,
      sun: null,
      water: null,
      propagation: c.propagation,
      primary_method: c.primaryMethod ?? null,
      space_types: [],
      growth_days_min: null,
      growth_days_max: null,
      growth_note: null,
      summary: c.summary,
      watering_summary: null,
      image_url: null,
      image_alt: null,
      data_status: c.dataStatus,
      source_note: c.sourceNote,
      estimate_dataset: c.estimate!.dataset,
      estimate_harvest_meaning: c.estimate!.harvestMeaning,
      estimate_note: c.estimate!.note,
      estimate_links: c.estimate!.contextUrls,
      crop_planting_windows: c.windows.map((w, i) => ({ zone: w.zone, country_code: w.countryCode, start_month: w.startMonth, end_month: w.endMonth, method: w.method, note: w.note ?? null, confidence: "estimated", optional: Boolean(w.optional), sort_order: i })),
      crop_phase_windows: (c.phases ?? []).map((p, i) => ({ kind: p.kind, zone: p.zone, country_code: p.countryCode, start_month: p.startMonth, end_month: p.endMonth, optional: Boolean(p.optional), sort_order: i })),
      crop_zone_estimates: (c.zoneEstimates ?? []).map((z) => ({ zone: z.zone, country_code: z.countryCode, suitability: z.suitability, irrigation: z.irrigation, days_to_first_harvest: z.daysToFirstHarvest, years_to_first_yield: z.yearsToFirstYield, not_applicable: z.notApplicable })),
    };
    const m = mapCropRow(row);
    expect(m.windows).toEqual(c.windows);
    expect(m.phases).toEqual(c.phases);
    // Zone estimates have no sort column: compare in zone order.
    const byZone = (zs: Crop["zoneEstimates"]) => [...(zs ?? [])].sort((a, b) => a.zone.localeCompare(b.zone));
    expect(byZone(m.zoneEstimates)).toEqual(byZone(c.zoneEstimates));
    expect(m.estimate).toEqual(c.estimate);
    expect(isNotRecommended(m, "coastal", PS)).toBe(true);
  });
});
