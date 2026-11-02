import type { Page } from "@playwright/test";

export const BASE = process.env.E2E_BASE_PATH ?? "";
export const go = (page: Page, path: string) => page.goto(`${BASE}${path}`);

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export interface SeedLocation {
  source?: "gps" | "map" | "search" | "list";
  latitude: number;
  longitude: number;
  label: string;
  regionId: string;
  zone: "coastal" | "highland" | "inland_plain" | "jordan_valley" | "arid";
  externalConsent?: boolean;
  timezone?: string;
}

/** Stores a confirmed location in localStorage before the app loads. */
export async function seedLocation(page: Page, loc: SeedLocation) {
  const value = {
    version: 2,
    source: loc.source ?? "list",
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracyM: null,
    label: loc.label,
    regionId: loc.regionId,
    zone: loc.zone,
    zoneSource: "list",
    elevationM: null,
    timezone: loc.timezone ?? "Asia/Hebron",
    externalConsent: loc.externalConsent ?? false,
    confirmedAt: "2026-01-01T00:00:00.000Z",
  };
  await page.addInitScript((v) => window.localStorage.setItem("smartplant:location:v1", JSON.stringify(v)), value);
}

export interface ExternalCalls {
  nominatim: string[];
  elevation: string[];
  forecast: string[];
  tiles: number;
}

export interface MockPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

/** Mocks OpenStreetMap / Open-Meteo and records every request URL. */
export async function mockGeoServices(
  page: Page,
  opts: {
    elevation?: number;
    reverseLabel?: string;
    /** Address returned by reverse geocoding (default: بيت أمر، محافظة الخليل، فلسطين). */
    reverseAddress?: Record<string, string>;
    /** Simulate no internet for Nominatim. */
    nominatimOffline?: boolean;
    searchResults?: MockPlace[];
  } = {},
): Promise<ExternalCalls> {
  const calls: ExternalCalls = { nominatim: [], elevation: [], forecast: [], tiles: 0 };
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    calls.tiles += 1;
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1x1 });
  });
  await page.route("https://nominatim.openstreetmap.org/**", (route) => {
    const url = route.request().url();
    calls.nominatim.push(url);
    if (opts.nominatimOffline) return route.abort("internetdisconnected");
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (url.includes("/reverse")) {
      const address = opts.reverseAddress ?? { village: opts.reverseLabel ?? "بيت أمر", state_district: "محافظة الخليل", country_code: "ps" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({ lat: "31.6103", lon: "35.0711", display_name: Object.values(address).join("، "), address }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify(
        opts.searchResults ?? [
          { lat: "32.2763", lon: "35.1950", display_name: "سبسطية، محافظة نابلس، فلسطين", address: { village: "سبسطية", state_district: "محافظة نابلس", country_code: "ps" } },
        ],
      ),
    });
  });
  await page.route("https://api.open-meteo.com/v1/elevation**", (route) => {
    calls.elevation.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ elevation: [opts.elevation ?? 900] }) });
  });
  await page.route("https://api.open-meteo.com/v1/forecast**", (route) => {
    calls.forecast.push(route.request().url());
    const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        latitude: 31.61,
        longitude: 35.07,
        timezone: "Asia/Hebron",
        current: { time: "2026-11-01T10:00", temperature_2m: 17, relative_humidity_2m: 60, wind_speed_10m: 10, weather_code: 1, is_day: 1 },
        daily: {
          time: days,
          weather_code: days.map(() => 1),
          temperature_2m_max: days.map(() => 20),
          temperature_2m_min: days.map((_, i) => (i === 3 ? 1 : 9)),
          precipitation_probability_max: days.map(() => 5),
          precipitation_sum: days.map(() => 0),
          wind_speed_10m_max: days.map(() => 12),
        },
      }),
    });
  });
  return calls;
}

/** Replaces navigator.geolocation with a stub that fails with the given code. */
export async function failGeolocation(page: Page, code: 1 | 2 | 3) {
  await page.addInitScript((c) => {
    const err = { code: c, message: "stub", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => setTimeout(() => fail(err), 50),
        watchPosition: (_ok: unknown, fail: (e: unknown) => void) => {
          setTimeout(() => fail(err), 50);
          return 1;
        },
        clearWatch: () => {},
      },
    });
  }, code);
}
