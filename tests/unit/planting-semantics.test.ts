import { describe, expect, it } from "vitest";
import { CATALOGUE_CROPS } from "@/data/crop-catalogue";
import { SEED_CROPS } from "@/data/crops";
import { METHOD_LABELS, METHOD_SHORT_LABELS } from "@/domain/labels";
import { generatePlan } from "@/domain/plan-generator";
import {
  describeSimpleStatus,
  fieldMethods,
  isFieldWindow,
  mainWindowsForZone,
  nurseryWindowsForZone,
  plantingTitle,
  primaryMethod,
  propagationMethods,
  simplePlantingStatus,
  windowsForZone,
} from "@/domain/planting-windows";
import { recommendCrops } from "@/domain/recommendations";
import type { Crop } from "@/domain/types";

const crop = (slug: string) => SEED_CROPS.find((c) => c.slug === slug)!;

/** A copy of the crop with an extra nursery-sowing window that must never become the planting date. */
function withNursery(c: Crop, zone: Crop["windows"][number]["zone"], startMonth: number, endMonth: number): Crop {
  return { ...c, windows: [...c.windows, { zone, startMonth, endMonth, method: "nursery_sowing", note: "بذر في المشتل" }] };
}

describe("the main date means planting in the final place", () => {
  it("every recorded window of the catalogue is a field planting window", () => {
    for (const c of SEED_CROPS) for (const w of c.windows) expect(isFieldWindow(w), `${c.slug} ${w.method}`).toBe(true);
  });

  it("tomato: ready seedlings planted in the ground", () => {
    const tomato = crop("tomato");
    expect(primaryMethod(tomato)).toBe("transplanting");
    expect(plantingTitle(tomato, primaryMethod(tomato))).toBe("موعد زراعة البندورة في الأرض");
    // Hebron (highland): April–May is planting in the ground.
    expect(simplePlantingStatus(tomato, "highland", "2026-04-15").kind).toBe("now");
    expect(describeSimpleStatus(simplePlantingStatus(tomato, "highland", "2026-04-15")).detail).toContain("زراعة الأشتال الجاهزة في الأرض");
    // Jericho vs Gaza keep their own climates.
    expect(simplePlantingStatus(tomato, "jordan_valley", "2026-10-10").kind).toBe("now");
    expect(simplePlantingStatus(tomato, "coastal", "2026-10-10").kind).toBe("later");
  });

  it("tomato: a nursery sowing date is kept apart and never used as the planting date", () => {
    // Nursery sowing in February in the highlands (illustrative test data, not a recommendation).
    const t = withNursery(crop("tomato"), "highland", 2, 2);
    expect(nurseryWindowsForZone(t, "highland").map((w) => w.startMonth)).toEqual([2]);
    expect(windowsForZone(t, "highland").every((w) => w.method === "transplanting")).toBe(true);
    // February is not «plant now»: neither the simple status, nor recommendations, nor plans.
    expect(simplePlantingStatus(t, "highland", "2026-02-10").kind).not.toBe("now");
    const rec = recommendCrops({ crops: [t], today: "2026-02-10", zone: "highland", spaceType: "home_garden" });
    expect(rec.groups.now).toHaveLength(0);
    const plan = generatePlan({ crop: t, plantedOn: "2026-02-10", zone: "highland", spaceType: "home_garden" });
    expect(plan.windowFit).not.toBe("in_window");
  });

  it("a crop known only from nursery dates has NO planting date (never copied from the nursery)", () => {
    const eggplant = withNursery(crop("eggplant"), "highland", 2, 3);
    expect(primaryMethod(eggplant)).toBe("transplanting");
    expect(simplePlantingStatus(eggplant, "highland", "2026-02-15").kind).toBe("no_data");
    expect(mainWindowsForZone(eggplant, "highland")).toEqual([]);
  });

  it("olive: planting a ready sapling; first yield is a separate fact", () => {
    const olive = crop("olive");
    expect(primaryMethod(olive)).toBe("saplings");
    expect(plantingTitle(olive, primaryMethod(olive))).toBe("موعد غرس شجرة الزيتون");
    expect(simplePlantingStatus(olive, "highland", "2026-01-10").kind).toBe("now");
    expect(olive.firstYieldNote).toContain("سنوات");
    expect(olive.growthDaysMin).toBeNull();
    // Sapling planting starts the plan on the planting day; no invented harvest date.
    const plan = generatePlan({ crop: olive, plantedOn: "2026-01-10", zone: "highland", spaceType: "farm" });
    expect(plan.tasks.find((t) => t.type === "planting")?.dueDate).toBe("2026-01-10");
    expect(plan.expectedHarvestStart).toBeNull();
  });

  it("wheat: seeds sown directly in the ground", () => {
    const wheat = crop("wheat");
    expect(primaryMethod(wheat)).toBe("direct_sowing");
    expect(plantingTitle(wheat, primaryMethod(wheat))).toBe("موعد بذر القمح في الأرض");
    expect(simplePlantingStatus(wheat, "highland", "2026-11-10", "PS")).toMatchObject({ kind: "now", general: true, methods: ["direct_sowing"] });
  });

  it("potato: tubers planted in the ground", () => {
    const potato = crop("potato");
    expect(primaryMethod(potato)).toBe("tubers");
    expect(plantingTitle(potato, primaryMethod(potato))).toBe("موعد زراعة درنات البطاطا");
    expect(simplePlantingStatus(potato, "highland", "2026-03-15").kind).toBe("now");
    const plan = generatePlan({ crop: potato, plantedOn: "2026-03-15", zone: "highland", spaceType: "home_garden" });
    // Harvest counted from planting the tubers in the ground, as recorded (90–120 days).
    expect(plan.expectedHarvestStart).toBe("2026-06-13");
  });

  it("narcissus: bulbs; no planting date until a source documents it", () => {
    const narcissus = crop("narcissus");
    expect(narcissus.category).toBe("ornamental");
    expect(primaryMethod(narcissus)).toBe("bulbs");
    expect(plantingTitle(narcissus, primaryMethod(narcissus))).toBe("موعد زراعة أبصال النرجس");
    expect(narcissus.windows).toEqual([]);
    expect(simplePlantingStatus(narcissus, "highland", "2026-10-10").kind).toBe("no_data");
  });

  it("the default method is the most common way to plant in the ground, nursery excluded", () => {
    expect(primaryMethod(crop("cabbage"))).toBe("transplanting"); // propagation lists nursery sowing first
    expect(fieldMethods(crop("basil"))).not.toContain("nursery_sowing");
    expect(primaryMethod(crop("zucchini"))).toBe("direct_sowing");
    // Cuttings next to a ready plant are secondary propagation, not a planting method.
    expect(fieldMethods(crop("rose"))).toEqual(["saplings"]);
    expect(propagationMethods(crop("rose"))).toEqual(["cuttings"]);
  });
});

const catalogue = (slug: string) => CATALOGUE_CROPS.find((c) => c.slug === slug)!;

/** A copy of the crop with one extra window of the given method (e.g. cuttings opening now). */
function withWindow(c: Crop, method: Crop["windows"][number]["method"], startMonth: number, endMonth: number): Crop {
  return { ...c, windows: [...c.windows, { zone: "highland", startMonth, endMonth, method }] };
}

describe("buying a ready plant is the default; producing it yourself is secondary", () => {
  it.each(["fig", "pomegranate", "mulberry", "quince", "sumac"])("%s: a ready sapling planted in the ground, cuttings secondary", (slug) => {
    const tree = catalogue(slug);
    expect(primaryMethod(tree)).toBe("saplings");
    expect(fieldMethods(tree)).toEqual(["saplings"]);
    expect(propagationMethods(tree)).toContain("cuttings");
    // Order in the data must not matter: cuttings listed first still lose to a ready sapling.
    const reordered = { ...tree, propagation: ["cuttings", "saplings"] as Crop["propagation"] };
    expect(primaryMethod(reordered)).toBe("saplings");
  });

  it("fig: the title is planting a ready tree and an unknown date stays unknown", () => {
    const fig = catalogue("fig");
    expect(plantingTitle(fig, primaryMethod(fig))).toBe("موعد غرس شجرة التين");
    expect(simplePlantingStatus(fig, "highland", "2026-02-10").kind).toBe("no_data");
    // Even with a documented cuttings window open now, the sapling date stays unknown.
    const withCuttings = withWindow(fig, "cuttings", 1, 3);
    expect(primaryMethod(withCuttings)).toBe("saplings");
    expect(mainWindowsForZone(withCuttings, "highland")).toEqual([]);
    expect(simplePlantingStatus(withCuttings, "highland", "2026-02-10").kind).toBe("no_data");
    const plan = generatePlan({ crop: withCuttings, plantedOn: "2026-02-10", zone: "highland", spaceType: "home_garden" });
    expect(plan.windowFit).toBe("no_data");
  });

  it("recommendations never use cuttings dates for a tree, whatever the method filter", () => {
    const fig = withWindow(catalogue("fig"), "cuttings", 1, 3);
    for (const methodGroup of ["all", "seedlings"] as const) {
      const rec = recommendCrops({ crops: [fig], today: "2026-02-10", zone: "highland", spaceType: "home_garden", methodGroup });
      expect(rec.groups.now, methodGroup).toHaveLength(0);
      expect(rec.groups.no_data.map((r) => r.crop.slug), methodGroup).toEqual(["fig"]);
    }
  });

  it("olive keeps its sapling dates when a cuttings window is added", () => {
    const olive = withWindow(crop("olive"), "cuttings", 6, 7);
    expect(primaryMethod(olive)).toBe("saplings");
    expect(mainWindowsForZone(olive, "highland").every((w) => w.method === "saplings")).toBe(true);
    expect(simplePlantingStatus(olive, "highland", "2026-06-15").kind).not.toBe("now");
  });

  it.each(["sage", "rosemary", "lemon-verbena", "marjoram", "lavender"])("%s: a ready seedling by default, cuttings secondary", (slug) => {
    const herb = catalogue(slug);
    expect(primaryMethod(herb)).toBe("transplanting");
    expect(propagationMethods(herb)).toEqual(["cuttings"]);
  });

  it("crops grown from cuttings in the ground keep cuttings as their method", () => {
    // No ready sapling or seedling option: the cutting itself is planted in place.
    expect(primaryMethod(catalogue("prickly-pear"))).toBe("cuttings");
    expect(primaryMethod(catalogue("sweet-potato"))).toBe("cuttings");
    expect(primaryMethod(crop("mint"))).toBe("cuttings");
  });

  it("date palm: a ready rooted offshoot, distinct from propagating offshoots", () => {
    const palm = catalogue("date-palm");
    expect(primaryMethod(palm)).toBe("offshoots");
    expect(METHOD_LABELS.offshoots).toBe("زراعة الفسيلة الجاهزة المتجذرة في الأرض");
    expect(METHOD_SHORT_LABELS.offshoots).toBe("زراعة الفسائل المتجذرة");
    expect(plantingTitle(palm, "offshoots")).toBe("موعد زراعة فسائل النخيل المتجذرة");
    expect(simplePlantingStatus(palm, "highland", "2026-03-10").kind).toBe("no_data");
  });

  it("the default method never changes a recorded date", () => {
    for (const c of SEED_CROPS) {
      const main = mainWindowsForZone(c, "highland");
      const all = windowsForZone(c, "highland");
      // Every crop's recorded windows use one method, so the main windows are all of them.
      expect(main, c.slug).toEqual(all);
    }
  });
});
