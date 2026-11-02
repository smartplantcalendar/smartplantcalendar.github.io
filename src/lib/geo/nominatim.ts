"use client";

/**
 * OpenStreetMap Nominatim (https://nominatim.org) — used only after the user
 * consents, and only on explicit actions (pressing "search" or "find place
 * name"), never as autocomplete, per the usage policy:
 * https://operations.osmfoundation.org/policies/nominatim/
 *   - max 1 request per second (enforced below),
 *   - results cached locally (7 days),
 *   - attribution «© مساهمو OpenStreetMap» shown wherever results appear.
 * Browsers send the site's Referer, which identifies the application.
 */
import type { LatLon } from "@/domain/geo";

const ENDPOINT = "https://nominatim.openstreetmap.org";
const CACHE_PREFIX = "smartplant:nominatim:";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

export type LocalityKind = "village" | "town" | "city";

export interface Place extends LatLon {
  /** Short Arabic label: village/town, then district. */
  label: string;
  /** Full display name as returned by OSM. */
  displayName: string;
  osmType?: string;
  /** Village / small community, else town, else city. null when OSM has none for the point. */
  locality?: string | null;
  localityKind?: LocalityKind | null;
  /** Governorate / district when available. */
  district?: string | null;
  /** Lower-case ISO country code reported by OSM for the place. */
  countryCode?: string | null;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  osm_type?: string;
  address?: Record<string, string>;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    return Date.now() - at < CACHE_MS ? value : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage unavailable */
  }
}

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * Most specific settlement name: a village or small community first, then a
 * town, then a city. Suburbs/neighbourhoods are not used as the village name.
 */
export function localityOf(address: Record<string, string> | undefined): { name: string | null; kind: LocalityKind | null } {
  const a = address ?? {};
  const village = a.hamlet ?? a.village ?? a.isolated_dwelling ?? a.locality;
  if (village) return { name: village, kind: "village" };
  if (a.town) return { name: a.town, kind: "town" };
  const city = a.city ?? a.municipality;
  if (city) return { name: city, kind: "city" };
  return { name: null, kind: null };
}

function districtOf(address: Record<string, string> | undefined): string | null {
  const a = address ?? {};
  return a.state_district ?? a.county ?? a.state ?? null;
}

function toPlace(item: NominatimItem): Place {
  const { name, kind } = localityOf(item.address);
  const district = districtOf(item.address);
  const local = name ?? (item.address ? null : item.name ?? null);
  const parts = [local, district && district !== local ? district : null].filter(Boolean);
  return {
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    label: parts.length ? parts.join("، ") : item.display_name.split(",").slice(0, 2).join("،"),
    displayName: item.display_name,
    osmType: item.osm_type,
    locality: local,
    localityKind: local ? (kind ?? "village") : null,
    district,
    countryCode: item.address?.country_code ?? null,
  };
}

export class GeocodeError extends Error {}

/** Place name for a point (village/neighbourhood level). */
export async function reverseGeocode(p: LatLon): Promise<Place | null> {
  const key = `rev2:${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
  const cached = readCache<Place | null>(key);
  if (cached !== null) return cached;
  await throttle();
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: p.latitude.toFixed(5),
    lon: p.longitude.toFixed(5),
    // Village level: the address details still carry town/city/district.
    zoom: "16",
    addressdetails: "1",
    "accept-language": "ar",
  });
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/reverse?${params}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GeocodeError("network");
  }
  if (!res.ok) throw new GeocodeError(`status ${res.status}`);
  const json = (await res.json()) as NominatimItem & { error?: string };
  const place = json.error ? null : toPlace(json);
  writeCache(key, place);
  return place;
}

/** Search triggered by an explicit submit (never per keystroke). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = `search2:${q}`;
  const cached = readCache<Place[]>(key);
  if (cached) return cached;
  await throttle();
  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    limit: "8",
    addressdetails: "1",
    "accept-language": "ar",
    // Bias to the Levant; results elsewhere are still allowed.
    viewbox: "34.0,37.5,42.5,29.0",
    countrycodes: "ps,jo,lb,sy,il",
  });
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/search?${params}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GeocodeError("network");
  }
  if (!res.ok) throw new GeocodeError(`status ${res.status}`);
  const places = ((await res.json()) as NominatimItem[]).map(toPlace);
  writeCache(key, places);
  return places;
}
