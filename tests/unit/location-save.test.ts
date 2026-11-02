import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSavedLocation } from "@/domain/location";
import { LOCAL_LOCATION_DELETE_FAILED, LOCAL_LOCATION_SAVE_FAILED, persistLocation } from "@/lib/location-save";
import { writeLocation } from "@/lib/local-store";

const loc = buildSavedLocation({
  draft: { latitude: 31.6103, longitude: 35.0711, source: "gps", accuracyM: 12 },
  label: "بيت أمر",
  labelSource: "osm",
  countryCode: "PS",
  zone: "highland",
  zoneSource: "elevation",
  elevationM: 905,
  externalConsent: true,
});
const ok = async () => ({ ok: true as const });
const fail = async () => ({ ok: false as const, error: "انقطع الاتصال" });

describe("persistLocation: saving", () => {
  it("guest: success only when the browser stored it", async () => {
    expect(await persistLocation(loc, { signedIn: false, writeLocal: () => true, saveToAccount: ok })).toEqual({
      ok: true,
      data: { savedLocally: true, savedToAccount: null },
    });
    expect(await persistLocation(loc, { signedIn: false, writeLocal: () => false, saveToAccount: ok })).toEqual({ ok: false, error: LOCAL_LOCATION_SAVE_FAILED });
  });

  it("signed in: saved on the device but not in the account → device only", async () => {
    const res = await persistLocation(loc, { signedIn: true, writeLocal: () => true, saveToAccount: fail });
    expect(res).toEqual({ ok: true, data: { savedLocally: true, savedToAccount: false, accountError: "انقطع الاتصال" } });
  });

  it("signed in: the account is enough even if the browser refused", async () => {
    expect(await persistLocation(loc, { signedIn: true, writeLocal: () => false, saveToAccount: ok })).toEqual({
      ok: true,
      data: { savedLocally: false, savedToAccount: true },
    });
  });

  it("signed in: both failed → not saved", async () => {
    const res = await persistLocation(loc, { signedIn: true, writeLocal: () => false, saveToAccount: fail });
    expect(res.ok).toBe(false);
  });
});

describe("persistLocation: deleting", () => {
  it("guest: reports a browser that refused to delete", async () => {
    expect(await persistLocation(null, { signedIn: false, writeLocal: () => false, saveToAccount: ok })).toEqual({ ok: false, error: LOCAL_LOCATION_DELETE_FAILED });
    expect((await persistLocation(null, { signedIn: false, writeLocal: () => true, saveToAccount: ok })).ok).toBe(true);
  });

  it("signed in: an account failure leaves the device untouched", async () => {
    const writeLocal = vi.fn(() => true);
    const res = await persistLocation(null, { signedIn: true, writeLocal, saveToAccount: fail });
    expect(res.ok).toBe(false);
    expect(writeLocal).not.toHaveBeenCalled();
  });
});

describe("writeLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when the browser refuses (private mode, full storage)", () => {
    const store = {
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
      removeItem: vi.fn(() => {
        throw new Error("SecurityError");
      }),
    };
    vi.stubGlobal("window", { localStorage: store });
    expect(writeLocation(loc)).toBe(false);
    expect(writeLocation(null)).toBe(false);
  });

  it("returns true when stored", () => {
    const store = { setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("window", { localStorage: store });
    expect(writeLocation(loc)).toBe(true);
    expect(store.setItem).toHaveBeenCalledWith("smartplant:location:v1", JSON.stringify(loc));
    expect(writeLocation(null)).toBe(true);
  });
});
