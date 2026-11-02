import { describe, expect, it } from "vitest";
import { buildSavedLocation, countryOfLocation, normalizeLocation, type LocationDraft } from "@/domain/location";
import { localityOf } from "@/lib/geo/nominatim";

const gps: LocationDraft = { latitude: 31.6103, longitude: 35.0711, source: "gps", accuracyM: 12 };

describe("place names from OpenStreetMap", () => {
  it("prefers the village, then the town, then the city", () => {
    expect(localityOf({ village: "بيت أمر", town: "حلحول", city: "الخليل" })).toEqual({ name: "بيت أمر", kind: "village" });
    expect(localityOf({ hamlet: "خربة", village: "سعير" })).toEqual({ name: "خربة", kind: "village" });
    expect(localityOf({ town: "حلحول", city: "الخليل" })).toEqual({ name: "حلحول", kind: "town" });
    expect(localityOf({ city: "أريحا", suburb: "حي" })).toEqual({ name: "أريحا", kind: "city" });
    // A district alone is not a village name.
    expect(localityOf({ state_district: "محافظة الخليل" })).toEqual({ name: null, kind: null });
  });
});

describe("saving a location", () => {
  it("keeps the GPS point and its reported accuracy when only the name is corrected", () => {
    const saved = buildSavedLocation({
      draft: gps,
      label: "بيت أمر الفوقا",
      labelSource: "manual",
      countryCode: "ps",
      zone: "highland",
      zoneSource: "elevation",
      elevationM: 905.4,
      externalConsent: true,
      now: new Date("2026-11-02T08:00:00Z"),
    });
    expect(saved).toMatchObject({
      source: "gps",
      latitude: 31.6103,
      longitude: 35.0711,
      accuracyM: 12,
      label: "بيت أمر الفوقا",
      labelSource: "manual",
      countryCode: "PS",
      elevationM: 905,
      regionId: "ps-hebron",
      version: 2,
    });
  });

  it("uses the chosen village's coordinates when another place is picked, with no GPS accuracy", () => {
    const saved = buildSavedLocation({
      draft: { latitude: 31.5772, longitude: 35.1617, source: "search", accuracyM: 30 },
      label: "سعير، محافظة الخليل",
      labelSource: "search",
      countryCode: "PS",
      zone: "highland",
      zoneSource: "elevation",
      elevationM: null,
      externalConsent: false,
    });
    expect(saved.latitude).toBe(31.5772);
    expect(saved.longitude).toBe(35.1617);
    expect(saved.accuracyM).toBeNull();
  });

  it("never stores an unsupported country", () => {
    const saved = buildSavedLocation({ draft: gps, label: "x", labelSource: "osm", countryCode: "il", zone: "highland", zoneSource: "elevation", elevationM: null, externalConsent: true });
    expect(saved.countryCode).toBeNull();
  });
});

describe("country of a location", () => {
  it("prefers the country confirmed for the point", () => {
    // A border point (Allenby bridge) is unknown from coordinates alone…
    expect(countryOfLocation({ source: "gps", regionId: "ps-jericho", latitude: 31.873, longitude: 35.54 })).toBeNull();
    // …but OpenStreetMap or the user can confirm it.
    expect(countryOfLocation({ source: "gps", regionId: "ps-jericho", latitude: 31.873, longitude: 35.54, countryCode: "PS" })).toBe("PS");
    expect(countryOfLocation({ source: "gps", regionId: "ps-jericho", latitude: 31.873, longitude: 35.54, countryCode: "JO" })).toBe("JO");
    // An unsupported code falls back to the careful rule.
    expect(countryOfLocation({ source: "gps", regionId: null, latitude: 31.6103, longitude: 35.0711, countryCode: "IL" })).toBe("PS");
  });

  it("reads locations saved by the previous version and drops invalid new fields", () => {
    const old = { version: 2, source: "gps", latitude: 31.61, longitude: 35.07, accuracyM: 15, label: "بيت أمر", regionId: "ps-hebron", zone: "highland", zoneSource: "elevation", elevationM: 900, timezone: "Asia/Hebron", externalConsent: true, confirmedAt: "2026-01-01T00:00:00Z" };
    const loc = normalizeLocation(old)!;
    expect(loc.label).toBe("بيت أمر");
    expect(loc.countryCode).toBeNull();
    expect(loc.labelSource).toBeUndefined();
    expect(countryOfLocation(loc)).toBe("PS");
    const tampered = normalizeLocation({ ...old, countryCode: "XX", labelSource: "guess" })!;
    expect(tampered.countryCode).toBeNull();
    expect(tampered.labelSource).toBeUndefined();
  });
});
