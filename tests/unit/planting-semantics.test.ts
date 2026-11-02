import { describe, expect, it } from "vitest";
import { SEED_CROPS } from "@/data/crops";
import { generatePlan } from "@/domain/plan-generator";
import {
  describeSimpleStatus,
  fieldMethods,
  isFieldWindow,
  mainWindowsForZone,
  nurseryWindowsForZone,
  plantingTitle,
  primaryMethod,
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
    expect(fieldMethods(crop("rose"))).toEqual(["saplings", "cuttings"]);
  });
});
