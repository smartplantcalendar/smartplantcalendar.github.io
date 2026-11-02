import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, type CsvTable } from "../../scripts/estimates/csv";
import { EXTRA_COLUMNS, ZONE_COLUMNS, harvestConflict, importEstimates, type ImportResult } from "../../scripts/estimates/import-core";
import { CATALOGUE_BASE } from "@/data/crop-catalogue";
import { CROP_ESTIMATES, ESTIMATE_DATASET } from "@/data/crop-estimates";
import { FIELD_METHODS } from "@/domain/types";

const read = (name: string) => parseCsv(readFileSync(join(process.cwd(), "data/imports", name), "utf8"));
const MAIN = read("smartplant_88_main.csv");
const REGIONS = read("smartplant_88_regions.csv");
const EXTRA = read("smartplant_88_extra_seasons.csv");
const empty = (t: CsvTable): CsvTable => ({ headers: t.headers, rows: [] });

function run(over: Partial<{ main: CsvTable; regions: CsvTable; extra: CsvTable }> = {}): ImportResult {
  return importEstimates({ main: MAIN, regions: REGIONS, extra: EXTRA, catalogue: CATALOGUE_BASE, dataset: "smartplant-88-ps", ...over });
}
const real = run();

/** A one-row table built from a real row with some values changed. */
function oneRow(base: CsvTable, slug: string, zone: string, changes: Record<string, string>, col: string = ZONE_COLUMNS.slug, zoneCol: string = ZONE_COLUMNS.zone): CsvTable {
  const row = base.rows.find((r) => r.values[col] === slug && r.values[zoneCol] === zone)!;
  return { headers: base.headers, rows: [{ line: 2, values: { ...row.values, ...changes } }] };
}

describe("CSV reader", () => {
  it("handles the BOM, quoted commas, doubled quotes and CRLF", () => {
    const t = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows[0].values).toEqual({ a: "x, y", b: 'say "hi"' });
  });
  it("rejects a row with the wrong number of cells", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow();
  });
});

describe("importing the 88-crop estimates", () => {
  it("reads all sheets in full without dropping a crop", () => {
    expect(real.stats).toMatchObject({ mainRows: 88, regionRows: 352, extraRows: 18, crops: 88, plantingWindows: 397, optionalWindows: 17, notRecommendedZones: 43 });
    expect(real.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(new Set(real.crops.map((c) => c.slug)).size).toBe(88);
    // Every crop has exactly the five Palestinian zones.
    for (const c of real.crops) expect(c.zones.map((z) => z.zone).sort(), c.slug).toEqual(["arid", "coastal", "highland", "inland_plain", "jordan_valley"]);
  });

  it("the generated module is up to date with the CSV files", () => {
    const generated = Object.fromEntries(real.crops.map(({ slug, name, ...data }) => (void name, [slug, data])));
    expect(CROP_ESTIMATES).toEqual(generated);
    expect(ESTIMATE_DATASET.crops).toBe(88);
  });

  it("everything is an estimate for Palestine, planted in the ground", () => {
    for (const c of real.crops) {
      for (const w of c.windows) {
        expect(w.confidence).toBe("estimated");
        expect(w.countryCode).toBe("PS");
        expect(w.zone).not.toBeNull();
        expect(FIELD_METHODS).toContain(w.method);
      }
      for (const p of c.phases) expect(p.countryCode).toBe("PS");
    }
  });

  it("«لا يُوصى» is a restriction, never a month; «لا ينطبق» is not applicable", () => {
    const apple = real.crops.find((c) => c.slug === "apple")!;
    expect(apple.zones.find((z) => z.zone === "coastal")?.suitability).toBe("not_recommended");
    expect(apple.windows.some((w) => w.zone === "coastal")).toBe(false);
    const cabbage = real.crops.find((c) => c.slug === "cabbage")!;
    expect(cabbage.zones[0].notApplicable).toContain("flowering");
    const fig = real.crops.find((c) => c.slug === "fig")!;
    expect(fig.zones.find((z) => z.zone === "highland")).toMatchObject({ daysToFirstHarvest: null, yearsToFirstYield: 2, notApplicable: ["days"] });
    // Banana does flower: «لا ينطبق» there becomes unknown, with a warning.
    const banana = real.crops.find((c) => c.slug === "banana")!;
    expect(banana.zones.find((z) => z.zone === "coastal")?.notApplicable).not.toContain("flowering");
  });

  it("maps the planting methods to planting in the ground", () => {
    const method = (slug: string) => real.crops.find((c) => c.slug === slug)!.method;
    expect(method("fig")).toBe("saplings");
    expect(method("date-palm")).toBe("offshoots");
    expect(method("eggplant")).toBe("transplanting");
    expect(method("zucchini")).toBe("direct_sowing");
    expect(method("narcissus")).toBe("bulbs");
    expect(method("caper")).toBe("transplanting");
  });

  it("excludes harvest seasons that contradict their planting window, and reports why", () => {
    const excluded = real.issues.filter((i) => i.level === "excluded");
    expect(excluded).toHaveLength(10);
    const cress = excluded.find((i) => i.slug === "cress")!;
    expect(cress).toMatchObject({ zone: "jordan_valley", what: "موسم القطف" });
    expect(cress.message).toContain("يسبق الزراعة");
    const cressCrop = real.crops.find((c) => c.slug === "cress")!;
    expect(cressCrop.phases.some((p) => p.kind === "harvest" && p.zone === "jordan_valley")).toBe(false);
    // The planting window of that zone is kept.
    expect(cressCrop.windows.some((w) => w.zone === "jordan_valley")).toBe(true);
    // A duplicate extra season (radish, highland) is excluded.
    expect(excluded.some((i) => i.file === "extra" && i.slug === "radish" && i.message.includes("تكرار"))).toBe(true);
  });

  it("harvestConflict allows month-level slack but flags contradictions", () => {
    expect(harvestConflict({ start: 4, end: 5 }, { start: 7, end: 10 }, 80)).toBeNull(); // eggplant
    expect(harvestConflict({ start: 9, end: 2 }, { start: 10, end: 5 }, 65)).toBeNull(); // one month early: tolerated
    expect(harvestConflict({ start: 10, end: 12 }, { start: 10, end: 3 }, 45)).toContain("شهر بدء الزراعة");
    expect(harvestConflict({ start: 10, end: 4 }, { start: 9, end: 3 }, 20)).toContain("يسبق الزراعة");
    expect(harvestConflict({ start: 10, end: 12 }, { start: 11, end: 4 }, 110)).toContain("بشهرين");
  });
});

describe("validation of bad rows", () => {
  const only = (t: CsvTable) => run({ main: t, regions: empty(REGIONS), extra: empty(EXTRA) });

  it("an unknown month value is excluded, not guessed", () => {
    const r = only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.plantStart]: "نيسانن" }));
    expect(r.crops[0].windows).toEqual([]);
    expect(r.issues.some((i) => i.level === "excluded" && i.what === "موعد الزراعة")).toBe(true);
  });

  it("a row claiming documented/reviewed status is not imported", () => {
    const r = only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.status]: "documented" }));
    expect(r.crops).toEqual([]);
    expect(r.issues[0].message).toContain("لا تُستورد كمعلومة موثقة");
  });

  it("another country is never imported as Palestinian data", () => {
    const r = only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.country]: "الأردن" }));
    expect(r.crops).toEqual([]);
    expect(r.issues[0].level).toBe("excluded");
  });

  it("nursery sowing is not a planting method", () => {
    const r = only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.method]: "بذر في المشتل" }));
    expect(r.crops).toEqual([]);
  });

  it("an unknown crop or a name that does not match the catalogue stops the import", () => {
    expect(only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.slug]: "unknown-crop" })).issues[0].level).toBe("error");
    expect(only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.name]: "البطاطس" })).issues[0].level).toBe("error");
  });

  it("duplicate crop/zone rows are excluded", () => {
    const row = oneRow(MAIN, "eggplant", "مرتفعات", {});
    const r = only({ headers: row.headers, rows: [row.rows[0], { ...row.rows[0], line: 3 }] });
    expect(r.crops[0].windows).toHaveLength(1);
    expect(r.issues.some((i) => i.message.includes("مكرر"))).toBe(true);
  });

  it("a restriction with planting months is reported as a conflict, and no window is created", () => {
    const r = only(oneRow(MAIN, "eggplant", "مرتفعات", { [ZONE_COLUMNS.suitability]: "غير ملائم غالبًا" }));
    expect(r.crops[0].windows).toEqual([]);
    expect(r.crops[0].zones[0].suitability).toBe("not_recommended");
    expect(r.issues.some((i) => i.level === "excluded" && i.message.includes("تعارض في القيود"))).toBe(true);
  });

  it("a missing column stops the import", () => {
    const t = { headers: MAIN.headers.filter((h) => h !== ZONE_COLUMNS.days), rows: [] };
    expect(only(t).issues.some((i) => i.level === "error" && i.message.includes(ZONE_COLUMNS.days))).toBe(true);
  });

  it("an extra season in a not-recommended zone is excluded", () => {
    const extra = oneRow(EXTRA, "zucchini", "مرتفعات", {}, EXTRA_COLUMNS.slug, EXTRA_COLUMNS.zone);
    const main = oneRow(MAIN, "zucchini", "مرتفعات", { [ZONE_COLUMNS.status]: "not_suitable_estimate", [ZONE_COLUMNS.suitability]: "غير ملائم غالبًا", [ZONE_COLUMNS.plantStart]: "لا يُوصى", [ZONE_COLUMNS.plantEnd]: "لا يُوصى" });
    const r = run({ main, regions: empty(REGIONS), extra });
    expect(r.crops[0].windows).toEqual([]);
    expect(r.issues.some((i) => i.file === "extra" && i.level === "excluded")).toBe(true);
  });
});
