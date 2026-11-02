/**
 * The user's confirmed farm location (v2). Stored locally (guest) or on the
 * user's own profile row (signed in). Pure helpers, unit-tested.
 */
import { findRegion, nearestRegion, REGIONS } from "@/data/regions";
import { countryFromCoordinates, roundForService, type LatLon } from "./geo";
import { CLIMATE_ZONES, type ClimateZone } from "./types";

export type LocationSource = "gps" | "map" | "search" | "list";
export type ZoneSource = "manual" | "elevation" | "nearest_town" | "list";
/**
 * Where the place NAME came from — independent of how precise the
 * coordinates are: "osm" = OpenStreetMap name for the point, "search" = the
 * place the user picked in a search, "list" = a town from our list,
 * "manual" = typed by the user (coordinates unchanged), "none" = unknown.
 */
export type LabelSource = "osm" | "search" | "list" | "manual" | "none";

/** Countries a location can be confirmed in (others → unknown). */
export const SUPPORTED_COUNTRIES = ["PS", "JO", "LB", "SY"] as const;

export interface SavedLocation {
  version: 2;
  source: LocationSource;
  latitude: number;
  longitude: number;
  /** GPS accuracy radius in metres (gps only). */
  accuracyM: number | null;
  /** What the user sees: village/area name, or a coordinate description. */
  label: string;
  /** Nearest listed town — for grouping and fallbacks only, never shown as "your location". */
  regionId: string | null;
  zone: ClimateZone;
  zoneSource: ZoneSource;
  elevationM: number | null;
  timezone: string;
  /** Consent to send (rounded) coordinates to OpenStreetMap / Open-Meteo. */
  externalConsent: boolean;
  confirmedAt: string;
  /** Optional (added later; older saves lack it): where `label` came from. */
  labelSource?: LabelSource;
  /**
   * Optional: country confirmed for the point — by OpenStreetMap for the
   * exact point, by the town chosen from the list, or by the user. Absent =
   * derive it carefully from the coordinates (null near borders).
   */
  countryCode?: string | null;
}

export const LOCATION_SOURCE_LABELS: Record<LocationSource, string> = {
  gps: "تحديد GPS",
  map: "اختيار يدوي على الخريطة",
  search: "بحث عن مكان",
  list: "اختيار من قائمة المدن",
};

export const ZONE_SOURCE_LABELS: Record<ZoneSource, string> = {
  manual: "حددتها يدويًا",
  elevation: "مقترحة حسب الارتفاع والموقع",
  nearest_town: "مقترحة حسب أقرب بلدة (دون بيانات ارتفاع)",
  list: "حسب المدينة المختارة",
};

/** GPS and map pins can point at someone's home or field: they need consent before leaving the device. */
export function isPrecise(loc: Pick<SavedLocation, "source">): boolean {
  return loc.source === "gps" || loc.source === "map";
}

/**
 * Coordinates allowed to be sent to an external service (weather/elevation),
 * or null when the user has not consented for a precise location.
 */
export function coordsForServices(loc: SavedLocation | null): LatLon | null {
  if (!loc) return null;
  if (isPrecise(loc) && !loc.externalConsent) return null;
  return isPrecise(loc) ? roundForService(loc) : { latitude: loc.latitude, longitude: loc.longitude };
}

function isZone(v: unknown): v is ClimateZone {
  return typeof v === "string" && (CLIMATE_ZONES as readonly string[]).includes(v);
}

/** Accepts v2 objects and upgrades the old v1 shape {regionId, zone, latitude, longitude, timezone}. */
export function normalizeLocation(raw: unknown): SavedLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = typeof r.latitude === "number" ? r.latitude : null;
  const lon = typeof r.longitude === "number" ? r.longitude : null;
  if (r.version === 2) {
    if (lat == null || lon == null || !isZone(r.zone)) return null;
    const loc = { ...(raw as SavedLocation) };
    // Optional fields added later: keep only valid values (older saves lack them).
    loc.countryCode = normalizeCountry(typeof r.countryCode === "string" ? r.countryCode : null);
    loc.labelSource = (["osm", "search", "list", "manual", "none"] as const).find((v) => v === r.labelSource);
    return loc;
  }
  // v1
  const region = findRegion(typeof r.regionId === "string" ? r.regionId : null);
  const latitude = lat ?? region?.latitude;
  const longitude = lon ?? region?.longitude;
  if (latitude == null || longitude == null) return null;
  const near = region ?? nearestRegion(latitude, longitude);
  return {
    version: 2,
    source: "list",
    latitude,
    longitude,
    accuracyM: null,
    label: near.name,
    regionId: near.id,
    zone: isZone(r.zone) ? r.zone : near.zone,
    zoneSource: isZone(r.zone) && r.zone !== near.zone ? "manual" : "list",
    elevationM: null,
    timezone: typeof r.timezone === "string" && r.timezone ? r.timezone : near.timezone,
    externalConsent: false,
    confirmedAt: new Date(0).toISOString(),
  };
}

/** Normalises a country code from OSM/the user; only supported countries are kept. */
export function normalizeCountry(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(c) ? c : null;
}

/**
 * ISO country of a saved location, or null when it cannot be established.
 *  1. a confirmed `countryCode` (OpenStreetMap for the point, the chosen
 *     town, or the user's own choice);
 *  2. a town chosen from the list;
 *  3. otherwise `countryFromCoordinates`, which returns null near borders
 *     instead of guessing.
 */
export function countryOfLocation(
  loc: Pick<SavedLocation, "source" | "regionId" | "latitude" | "longitude"> & { countryCode?: string | null } | null,
): string | null {
  if (!loc) return null;
  const confirmed = normalizeCountry(loc.countryCode);
  if (confirmed) return confirmed;
  if (loc.source === "list") return findRegion(loc.regionId)?.countryCode ?? null;
  return countryFromCoordinates(loc, REGIONS);
}

export interface LocationDraft extends LatLon {
  source: LocationSource;
  /** Browser-reported accuracy radius (gps only); never "improved" by us. */
  accuracyM: number | null;
}

/**
 * Builds the location to save. The name and the coordinates are independent:
 * correcting only the name keeps the original point (and its accuracy);
 * choosing another place replaces the point. `regionId`/`timezone` come from
 * the nearest listed town for internal use only and are never shown as the
 * place name.
 */
export function buildSavedLocation(input: {
  draft: LocationDraft;
  label: string;
  labelSource: LabelSource;
  countryCode: string | null;
  zone: ClimateZone;
  zoneSource: ZoneSource;
  elevationM: number | null;
  externalConsent: boolean;
  now?: Date;
}): SavedLocation {
  const near = nearestRegion(input.draft.latitude, input.draft.longitude);
  return {
    version: 2,
    source: input.draft.source,
    latitude: input.draft.latitude,
    longitude: input.draft.longitude,
    accuracyM: input.draft.source === "gps" ? input.draft.accuracyM : null,
    label: input.label.trim().slice(0, 160),
    labelSource: input.labelSource,
    regionId: near.id,
    zone: input.zone,
    zoneSource: input.zoneSource,
    elevationM: input.elevationM == null ? null : Math.round(input.elevationM),
    timezone: near.timezone,
    externalConsent: input.externalConsent,
    countryCode: normalizeCountry(input.countryCode),
    confirmedAt: (input.now ?? new Date()).toISOString(),
  };
}
