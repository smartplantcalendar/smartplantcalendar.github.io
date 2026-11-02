/**
 * Final audit of the imported estimates across all 88 crops, five zones and
 * twelve months: search, planting-in-the-ground semantics, climate
 * restrictions in recommendations, and optional seasons.
 */
import { describe, expect, it } from "vitest";
import { SEED_CROPS } from "@/data/crops";
import { buildCropIndex, searchCropIndex } from "@/domain/crop-search";
import { mainWindowsForZone, monthInWindow, simplePlantingStatus, zoneEstimateFor } from "@/domain/planting-windows";
import { recommendCrops } from "@/domain/recommendations";
import { CLIMATE_ZONES, FIELD_METHODS, type PlantingWindow } from "@/domain/types";

const PS = "PS";
const estimated = SEED_CROPS.filter((c) => c.dataStatus === "estimated");
const index = buildCropIndex(SEED_CROPS);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const day = (m: number) => `2026-${String(m).padStart(2, "0")}-15`;

describe("audit of the 88 estimated crops", () => {
  it("every estimated crop is found by its name in the search", () => {
    expect(estimated).toHaveLength(88);
    for (const c of estimated) {
      const hits = searchCropIndex(index, c.name, 6).map((h) => h.slug);
      expect(hits, c.name).toContain(c.slug);
    }
  });

  it("every crop shows an estimated planting date for at least one Palestinian zone", () => {
    for (const c of estimated) {
      const zones = CLIMATE_ZONES.filter((z) => mainWindowsForZone(c, z, PS).length > 0);
      expect(zones.length, c.slug).toBeGreaterThan(0);
    }
  });

  it("planting dates are planting in the ground — never nursery sowing", () => {
    for (const c of estimated) for (const w of c.windows) expect(FIELD_METHODS, `${c.slug} ${w.method}`).toContain(w.method);
    expect(estimated.flatMap((c) => c.windows).some((w) => w.method === "nursery_sowing")).toBe(false);
  });

  it("crops unsuitable for a zone never appear as plantable there, in any month", () => {
    let restricted = 0;
    for (const zone of CLIMATE_ZONES) {
      for (const m of MONTHS) {
        const rec = recommendCrops({ crops: SEED_CROPS, today: day(m), zone, spaceType: "farm", country: PS });
        const shown = [...rec.groups.now, ...rec.groups.protect, ...rec.groups.soon, ...rec.groups.later];
        for (const r of shown) {
          expect(zoneEstimateFor(r.crop, zone, PS)?.suitability, `${r.crop.slug} ${zone} month ${m}`).not.toBe("not_recommended");
        }
        for (const r of rec.groups.no_data) if (zoneEstimateFor(r.crop, zone, PS)?.suitability === "not_recommended") restricted++;
      }
    }
    // 43 restricted crop/zone pairs × 12 months, all in "no data / not recommended".
    expect(restricted).toBe(43 * 12);
  });

  it("data that looks contradictory is explained, never shown as «لا ينطبق» by mistake", () => {
    const crop = (slug: string) => SEED_CROPS.find((c) => c.slug === slug)!;
    for (const slug of ["carob", "banana", "lemon", "sweet-potato", "akkoub"]) {
      expect(crop(slug).estimate?.reviewNotes?.length, slug).toBeGreaterThan(0);
    }
    // Akkoub and rose have a harvest season: the time to the first harvest is unknown, not "not applicable".
    for (const slug of ["akkoub", "rose"]) {
      for (const z of crop(slug).zoneEstimates ?? []) expect(z.notApplicable, `${slug} ${z.zone}`).not.toContain("days");
    }
    // Banana flowers: never «لا ينطبق».
    for (const z of crop("banana").zoneEstimates ?? []) expect(z.notApplicable).not.toContain("flowering");
    // No crop with a harvest season says both days and years are «لا ينطبق».
    for (const c of estimated) {
      for (const z of c.zoneEstimates ?? []) {
        const harvested = (c.phases ?? []).some((p) => p.kind === "harvest" && p.zone === z.zone);
        if (harvested) expect(z.notApplicable.includes("days") && z.notApplicable.includes("years"), `${c.slug} ${z.zone}`).toBe(false);
      }
    }
  });

  it("optional extra seasons never duplicate the main window and never drive recommendations", () => {
    const optional = estimated.flatMap((c) => c.windows.filter((w) => w.optional).map((w) => ({ c, w })));
    expect(optional).toHaveLength(17);
    const months = (w: PlantingWindow) => MONTHS.filter((m) => monthInWindow(m, w.startMonth, w.endMonth));
    for (const { c, w } of optional) {
      const main = mainWindowsForZone(c, w.zone!, PS);
      // Same zone and method as a main window, but not fully inside it.
      expect(months(w).some((m) => !main.some((x) => monthInWindow(m, x.startMonth, x.endMonth))), `${c.slug} ${w.zone}`).toBe(true);
      // In the optional-only months the crop is never "plant now".
      for (const m of months(w)) {
        if (main.some((x) => monthInWindow(m, x.startMonth, x.endMonth))) continue;
        expect(simplePlantingStatus(c, w.zone!, day(m), PS).kind, `${c.slug} ${w.zone} ${m}`).not.toBe("now");
        const rec = recommendCrops({ crops: [c], today: day(m), zone: w.zone!, spaceType: "farm", country: PS });
        expect(rec.groups.now, `${c.slug} ${w.zone} ${m}`).toHaveLength(0);
      }
    }
  });
});
