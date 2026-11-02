import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { failGeolocation, go, mockGeoServices, seedLocation } from "./helpers";

const GPS = { latitude: 31.6103, longitude: 35.0711 }; // بيت أمر

async function savedInStorage(page: Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("smartplant:location:v1") ?? "null"));
}

async function locateWithGps(page: Page, context: BrowserContext, accuracy = 12, at = GPS) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...at, accuracy });
  await go(page, "/location/");
  await expect(page.getByRole("heading", { level: 1, name: "وين أرضك؟" })).toBeVisible();
  await expect(page.getByText("حدد موقع أرضك حتى نعرف مواعيد الزراعة المناسبة لمنطقتك.")).toBeVisible();
  await page.getByRole("button", { name: "حدد موقعي تلقائيًا" }).click();
}

test.describe("location: farmer flow", () => {
  test("one button, consent, «هل هذه قريتك؟», saved and reused everywhere (بيت أمر)", async ({ page, context }) => {
    const calls = await mockGeoServices(page, { elevation: 905 });
    await locateWithGps(page, context);
    // Short consent before anything leaves the device.
    await expect(page.getByRole("heading", { name: "نعرف اسم قريتك؟" })).toBeVisible();
    expect(calls.nominatim).toHaveLength(0);
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await expect(page.getByTestId("location-label")).toHaveText("بيت أمر");
    await expect(page.getByTestId("location-district")).toHaveText("محافظة الخليل");
    await expect(page.getByRole("heading", { name: "هل هذه قريتك؟" })).toBeVisible();
    await expect(page.getByText(/© مساهمو OpenStreetMap/).first()).toBeVisible();
    // Technical details stay folded away.
    await expect(page.getByTestId("location-coords")).toBeHidden();
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    await expect(page.getByText("تم حفظ موقع أرضك بنجاح")).toBeVisible();
    await expect(page.getByTestId("location-saved-name")).toHaveText("بيت أمر، محافظة الخليل");

    const saved = await savedInStorage(page);
    expect(saved).toMatchObject({ version: 2, source: "gps", latitude: 31.6103, longitude: 35.0711, accuracyM: 12, labelSource: "osm", countryCode: "PS", zone: "highland" });
    // Elevation lookups are rounded to ~100 m before leaving the device.
    expect(calls.elevation[0]).toContain("latitude=31.610&longitude=35.071");
    // Reverse geocoding happened once, after consent.
    expect(calls.nominatim.filter((u) => u.includes("/reverse"))).toHaveLength(1);

    // Recommendations, weather and the planner use the new location.
    await page.getByRole("link", { name: /اعرف ماذا تزرع الآن/ }).click();
    await expect(page).toHaveURL(/\/recommendations\/$/);
    await expect(page.getByTestId("saved-location-label")).toHaveText("بيت أمر، محافظة الخليل");
    await go(page, "/weather/");
    await expect(page.getByRole("heading", { name: "الطقس في بيت أمر، محافظة الخليل" })).toBeVisible();
    await expect.poll(() => calls.forecast.length).toBeGreaterThan(0);
    expect(calls.forecast[0]).toContain("latitude=31.6100&longitude=35.0700");
    await go(page, "/planner/");
    await expect(page.getByTestId("saved-location-label")).toHaveText("بيت أمر، محافظة الخليل");

    // Reopening the page shows the saved name directly, without asking again.
    await go(page, "/location/");
    await expect(page.getByTestId("location-saved-name")).toHaveText("بيت أمر، محافظة الخليل");
    await expect(page.getByRole("button", { name: "تغيير" })).toBeVisible();
    await expect(page.getByRole("button", { name: "حدد موقعي تلقائيًا" })).toHaveCount(0);
  });

  test("without consent nothing leaves the device; the farmer types the village name", async ({ page, context }) => {
    const calls = await mockGeoServices(page);
    await locateWithGps(page, context, 20);
    await page.getByRole("button", { name: "لا، سأكتب الاسم بنفسي" }).click();
    await expect(page.getByRole("heading", { name: "لم نتمكن من معرفة اسم القرية بدقة" })).toBeVisible();
    await page.getByRole("textbox", { name: "اسم قريتك" }).fill("بيت أمر");
    await page.getByRole("button", { name: "احفظ الموقع بهذا الاسم" }).click();
    await expect(page.getByTestId("location-saved-name")).toHaveText("بيت أمر");
    expect(await savedInStorage(page)).toMatchObject({ source: "gps", latitude: 31.6103, labelSource: "manual", externalConsent: false });
    await go(page, "/weather/");
    await expect(page.getByText("الطقس يحتاج موافقتك")).toBeVisible();
    await page.waitForTimeout(800);
    expect(calls).toEqual({ nominatim: [], elevation: [], forecast: [], tiles: 0 });
  });

  test("correcting only the name keeps the GPS point", async ({ page, context }) => {
    await mockGeoServices(page, { reverseAddress: { town: "حلحول", state_district: "محافظة الخليل", country_code: "ps" } });
    await locateWithGps(page, context);
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await expect(page.getByTestId("location-label")).toHaveText("حلحول");
    // A town, not a village: the farmer is told how to pick a nearby village.
    await expect(page.getByText(/إن كانت أرضك في قرية صغيرة قرب حلحول/)).toBeVisible();
    await page.getByRole("button", { name: "لا، غيّر القرية" }).click();
    await page.getByRole("textbox", { name: "الاسم الصحيح لقريتك" }).fill("بيت أمر");
    await page.getByRole("button", { name: "احفظ بهذا الاسم" }).click();
    await expect(page.getByTestId("location-saved-name")).toHaveText("بيت أمر");
    expect(await savedInStorage(page)).toMatchObject({ source: "gps", latitude: 31.6103, longitude: 35.0711, accuracyM: 12, label: "بيت أمر", labelSource: "manual" });
  });

  test("land in another village: search by name, same name in two governorates (سعير)", async ({ page, context }) => {
    const calls = await mockGeoServices(page, {
      searchResults: [
        { lat: "31.5772", lon: "35.1617", display_name: "سعير، محافظة الخليل، الضفة الغربية، فلسطين", address: { village: "سعير", state_district: "محافظة الخليل", country_code: "ps" } },
        { lat: "32.4200", lon: "35.2100", display_name: "سعير، محافظة جنين، الضفة الغربية، فلسطين", address: { village: "سعير", state_district: "محافظة جنين", country_code: "ps" } },
      ],
    });
    await locateWithGps(page, context);
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await page.getByRole("button", { name: "لا، غيّر القرية" }).click();
    await page.getByRole("button", { name: "ابحث عن قريتك" }).click();
    await page.getByRole("textbox", { name: "اسم القرية أو البلدة" }).fill("سعير");
    // No request while typing — only on submit.
    expect(calls.nominatim.filter((u) => u.includes("/search"))).toHaveLength(0);
    await page.getByRole("button", { name: "بحث", exact: true }).click();
    await expect(page.getByText(/انتبه للمحافظة إن تكرر الاسم/)).toBeVisible();
    await page.getByRole("button", { name: /سعير، محافظة الخليل/ }).click();
    await expect(page.getByTestId("location-label")).toHaveText("سعير");
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect(await savedInStorage(page)).toMatchObject({ source: "search", latitude: 31.5772, longitude: 35.1617, accuracyM: null, label: "سعير، محافظة الخليل", labelSource: "search", countryCode: "PS" });
    expect(calls.nominatim.filter((u) => u.includes("/search"))).toHaveLength(1);
  });

  test("search without GPS: Jericho (Jordan Valley) and Gaza (coast)", async ({ page }) => {
    await mockGeoServices(page, {
      elevation: -250,
      searchResults: [{ lat: "31.8570", lon: "35.4600", display_name: "أريحا، محافظة أريحا والأغوار، فلسطين", address: { city: "أريحا", state_district: "محافظة أريحا والأغوار", country_code: "ps" } }],
    });
    await go(page, "/location/");
    await page.getByRole("button", { name: "أو ابحث عن قريتك بالاسم" }).click();
    await page.getByRole("textbox", { name: "اسم القرية أو البلدة" }).fill("أريحا");
    await page.getByRole("button", { name: "بحث", exact: true }).click();
    await page.getByRole("button", { name: /أريحا، محافظة أريحا والأغوار/ }).click();
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect(await savedInStorage(page)).toMatchObject({ source: "search", zone: "jordan_valley", countryCode: "PS" });

    const gaza = await page.context().newPage();
    await mockGeoServices(gaza, {
      elevation: 20,
      searchResults: [{ lat: "31.5017", lon: "34.4668", display_name: "غزة، محافظة غزة، فلسطين", address: { city: "غزة", state_district: "محافظة غزة", country_code: "ps" } }],
    });
    await go(gaza, "/location/");
    // Same browser: the Jericho location is already saved, so change it.
    await gaza.getByRole("button", { name: "تغيير" }).click();
    await gaza.getByRole("button", { name: "أو ابحث عن قريتك بالاسم" }).click();
    await gaza.getByRole("textbox", { name: "اسم القرية أو البلدة" }).fill("غزة");
    await gaza.getByRole("button", { name: "بحث", exact: true }).click();
    await gaza.getByRole("button", { name: /غزة، محافظة غزة/ }).first().click();
    await gaza.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect(await savedInStorage(gaza)).toMatchObject({ zone: "coastal", countryCode: "PS" });
  });

  test("the map does not recognise a village name", async ({ page, context }) => {
    await mockGeoServices(page, { reverseAddress: { state_district: "محافظة الخليل", country_code: "ps" } });
    await locateWithGps(page, context);
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await expect(page.getByRole("heading", { name: "لم نتمكن من معرفة اسم القرية بدقة" })).toBeVisible();
    await expect(page.getByTestId("name-unknown-reason")).toContainText("محافظة الخليل");
    // The nearest listed city is never offered as the village name.
    await expect(page.getByTestId("location-label")).toHaveCount(0);
  });

  test("no internet: the GPS point is kept and the name can be typed", async ({ page, context }) => {
    await mockGeoServices(page, { nominatimOffline: true });
    await locateWithGps(page, context);
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await expect(page.getByTestId("name-unknown-reason")).toContainText("لا يوجد اتصال بالإنترنت");
    await page.getByRole("textbox", { name: "اسم قريتك" }).fill("بيت أمر");
    await page.getByRole("button", { name: "احفظ الموقع بهذا الاسم" }).click();
    expect(await savedInStorage(page)).toMatchObject({ source: "gps", latitude: 31.6103, label: "بيت أمر" });
  });

  test("near the Jordanian border the country is not guessed", async ({ page, context }) => {
    await mockGeoServices(page, { reverseAddress: { village: "قرية حدودية", country_code: "il" } });
    await locateWithGps(page, context, 15, { latitude: 31.873, longitude: 35.54 });
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click();
    await expect(page.getByText("لم نتأكد من البلد")).toBeVisible();
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect((await savedInStorage(page)).countryCode).toBeNull();
    await expect(page.getByText(/لم نتأكد من البلد لهذا الموقع/)).toBeVisible();
    // The farmer can confirm the country explicitly.
    await page.getByRole("button", { name: "تغيير" }).click();
    await page.getByRole("button", { name: "حدد موقعي تلقائيًا" }).click();
    await page.getByRole("button", { name: "فلسطين" }).click();
    await expect(page.getByText("لم نتأكد من البلد")).toHaveCount(0);
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect((await savedInStorage(page)).countryCode).toBe("PS");
  });

  test("low GPS accuracy is reported honestly", async ({ page, context }) => {
    await mockGeoServices(page);
    await locateWithGps(page, context, 3500, { latitude: 31.9, longitude: 35.2 });
    await page.getByRole("button", { name: "نعم، اعرف اسم قريتي" }).click({ timeout: 40_000 });
    await expect(page.getByText("الموقع تقريبي")).toBeVisible();
    await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
    await expect(page.getByTestId("location-accuracy")).toHaveText("الدقة كما أبلغ عنها جهازك: ± 3.5 كم");
  });

  for (const [code, text] of [
    [1, "رُفض إذن الوصول إلى الموقع"],
    [2, "تعذّر تحديد موقعك الآن"],
    [3, "استغرق تحديد الموقع وقتًا أطول"],
  ] as const) {
    test(`geolocation error ${code}: Arabic message and a search alternative`, async ({ page }) => {
      await failGeolocation(page, code);
      await go(page, "/location/");
      await page.getByRole("button", { name: "حدد موقعي تلقائيًا" }).click();
      await expect(page.getByText("تعذّر تحديد الموقع")).toBeVisible();
      await expect(page.getByText(new RegExp(text))).toBeVisible();
      await page.getByRole("button", { name: "ابحث عن قريتك بالاسم", exact: true }).click();
      await expect(page.getByRole("heading", { name: "ابحث عن قريتك" })).toBeVisible();
    });
  }

  test("advanced options: town list (offline) and the map", async ({ page, isMobile }) => {
    const calls = await mockGeoServices(page, { elevation: 420 });
    await go(page, "/location/");
    await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
    await page.getByLabel("المدينة").selectOption("ps-hebron");
    await expect(page.getByTestId("location-label")).toHaveText("الخليل");
    await page.getByRole("radio", { name: /سهلي داخلي/ }).check();
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    expect(await savedInStorage(page)).toMatchObject({ source: "list", labelSource: "list", zone: "inland_plain", zoneSource: "manual", countryCode: "PS" });
    expect(calls.nominatim).toHaveLength(0);

    await page.getByRole("button", { name: "تغيير" }).click();
    await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
    // Agreeing replaces the box with the map button.
    await page.getByRole("checkbox", { name: /أوافق على تحميل الخريطة/ }).click();
    await page.getByRole("button", { name: "افتح الخريطة" }).click();
    const map = page.getByRole("application", { name: /خريطة تفاعلية/ });
    await expect(map).toBeVisible();
    const box = (await map.boundingBox())!;
    const position = { x: Math.round(box.width * 0.3), y: Math.round(box.height * 0.4) };
    if (isMobile) await map.tap({ position });
    else await map.click({ position });
    expect(calls.tiles).toBeGreaterThan(0);
    await page.getByRole("button", { name: "استخدم هذا المكان" }).click();
    await expect(page.getByTestId("location-label")).toHaveText("بيت أمر");
  });

  test("a location saved by the previous version opens directly", async ({ page }) => {
    await seedLocation(page, { source: "gps", latitude: 31.61, longitude: 35.07, label: "بيت أمر، محافظة الخليل", regionId: "ps-hebron", zone: "highland" });
    await go(page, "/location/");
    await expect(page.getByTestId("location-saved-name")).toHaveText("بيت أمر، محافظة الخليل");
    await expect(page.getByRole("link", { name: /اعرف ماذا تزرع الآن/ })).toBeVisible();
  });
});

/** Makes the browser refuse to store/remove the location until the flags are cleared. */
async function breakLocationStorage(page: Page, fail: { set: boolean; remove: boolean }) {
  await page.addInitScript((f) => {
    (window as unknown as { __failLocation: typeof f }).__failLocation = f;
    const key = "smartplant:location:v1";
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key && (window as unknown as { __failLocation: typeof f }).__failLocation.set) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, k, v);
    };
    Storage.prototype.removeItem = function (k: string) {
      if (k === key && (window as unknown as { __failLocation: typeof f }).__failLocation.remove) throw new DOMException("denied", "SecurityError");
      return remove.call(this, k);
    };
  }, fail);
}

test.describe("location: saving failures", () => {
  test("no success message unless the location is really saved; retry works", async ({ page }) => {
    await breakLocationStorage(page, { set: true, remove: false });
    await go(page, "/location/");
    await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
    await page.getByLabel("المدينة").selectOption("ps-hebron");
    await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
    await expect(page.getByText("لم يُحفظ الموقع")).toBeVisible();
    await expect(page.getByTestId("location-save-error")).toContainText("تعذّر حفظ الموقع في هذا المتصفح");
    await expect(page.getByText("تم حفظ موقع أرضك بنجاح")).toHaveCount(0);
    expect(await savedInStorage(page)).toBeNull();
    // The rest of the app still has no location.
    await expect(page.getByRole("button", { name: "نعم، احفظ الموقع" })).toBeVisible();

    await page.evaluate(() => ((window as unknown as { __failLocation: { set: boolean } }).__failLocation.set = false));
    await page.getByRole("button", { name: "حاول مرة أخرى" }).click();
    await expect(page.getByText("تم حفظ موقع أرضك بنجاح")).toBeVisible();
    await expect(page.getByText("لم يُحفظ الموقع")).toHaveCount(0);
    expect(await savedInStorage(page)).toMatchObject({ label: "الخليل", source: "list" });
  });

  test("a failed delete keeps the location and can be retried", async ({ page }) => {
    await seedLocation(page, { latitude: 31.5326, longitude: 35.0998, label: "الخليل", regionId: "ps-hebron", zone: "highland" });
    await breakLocationStorage(page, { set: false, remove: true });
    await go(page, "/location/");
    await page.getByRole("button", { name: "تغيير" }).click();
    await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
    await page.getByRole("button", { name: "حذف الموقع المحفوظ" }).click();
    await expect(page.getByText("لم يُحذف الموقع")).toBeVisible();
    await expect(page.getByTestId("location-delete-error")).toContainText("تعذّر حذف الموقع من هذا المتصفح");
    expect(await savedInStorage(page)).toMatchObject({ label: "الخليل" });

    await page.evaluate(() => ((window as unknown as { __failLocation: { remove: boolean } }).__failLocation.remove = false));
    await page.getByRole("button", { name: "حاول مرة أخرى" }).click();
    await expect(page.getByText("تم حذف الموقع المحفوظ")).toBeVisible();
    await expect(page.getByText("لم يُحذف الموقع")).toHaveCount(0);
    expect(await savedInStorage(page)).toBeNull();
  });
});

test.describe("what to plant now", () => {
  const hebron = { latitude: 31.5326, longitude: 35.0998, label: "الخليل", regionId: "ps-hebron", zone: "highland" as const };
  const jericho = { latitude: 31.8667, longitude: 35.45, label: "أريحا والأغوار", regionId: "ps-jericho", zone: "jordan_valley" as const };
  const gaza = { latitude: 31.5017, longitude: 34.4668, label: "غزة", regionId: "ps-gaza", zone: "coastal" as const };

  test("prompts for a location first", async ({ page }) => {
    await go(page, "/recommendations/");
    await expect(page.getByText("لم تحدد موقع أرضك بعد.")).toBeVisible();
  });

  test("highland vs Jordan Valley vs coast in October", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-10T09:00:00+03:00"));
    await seedLocation(page, hebron);
    await go(page, "/recommendations/");
    await expect(page.getByTestId("rec-tomato")).toHaveAttribute("data-status", "later");
    await expect(page.getByTestId("rec-garlic")).toHaveAttribute("data-status", "now");

    const p2 = await page.context().newPage();
    await p2.clock.setFixedTime(new Date("2026-10-10T09:00:00+03:00"));
    await seedLocation(p2, jericho);
    await go(p2, "/recommendations/");
    await expect(p2.getByTestId("rec-tomato")).toHaveAttribute("data-status", "now");
    await expect(p2.getByTestId("rec-tomato")).toContainText("غور / منخفض حار");

    const p3 = await page.context().newPage();
    await p3.clock.setFixedTime(new Date("2026-10-10T09:00:00+03:00"));
    await seedLocation(p3, gaza);
    await go(p3, "/recommendations/");
    await expect(p3.getByTestId("rec-lettuce")).toHaveAttribute("data-status", "now");
  });

  test("updates with the month and the space type, and links to the planner", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-04-20T09:00:00+03:00"));
    await seedLocation(page, hebron);
    await go(page, "/recommendations/");
    await expect(page.getByTestId("rec-tomato")).toHaveAttribute("data-status", "now");
    // Same location, another date → recomputed without reload.
    await page.getByLabel("التاريخ").fill("2026-07-01");
    await expect(page.getByTestId("rec-tomato")).toHaveAttribute("data-status", "later");
    await expect(page.getByText(/معاينة لتاريخ آخر/)).toBeVisible();
    await page.getByLabel("التاريخ").fill("2026-12-15");
    await expect(page.getByTestId("rec-olive")).toHaveAttribute("data-status", "now");
    // Space type: an olive tree on a balcony needs special care.
    await page.getByLabel("نوع المساحة").selectOption("balcony");
    await expect(page.getByTestId("rec-olive")).toHaveAttribute("data-status", "protect");
    await page.getByLabel("نوع المساحة").selectOption("greenhouse");
    await expect(page.getByText(/لا تتوفر في بيانات المنصة حاليًا مواعيد خاصة بالبيوت المحمية/)).toBeVisible();
    // Method filter.
    await page.getByLabel("نوع المساحة").selectOption("home_garden");
    await page.getByLabel("طريقة الزراعة").selectOption("tubers");
    await expect(page.getByTestId("rec-tomato")).toHaveAttribute("data-status", "no_data");
    await page.getByLabel("طريقة الزراعة").selectOption("all");
    // Add to plan → planner with crop and space preselected.
    await page.getByLabel("التاريخ").fill("2026-04-20");
    await page.getByTestId("rec-tomato").getByRole("link", { name: "أضف إلى خطتي الزراعية" }).click();
    await expect(page).toHaveURL(/\/planner\/?\?crop=tomato&space=home_garden/);
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByRole("radio", { name: /حديقة منزلية/ })).toHaveAttribute("aria-checked", "true");
  });

  test("frost in the forecast moves frost-sensitive crops to 'needs protection'", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-01T09:00:00+02:00"));
    await mockGeoServices(page);
    await seedLocation(page, { ...jericho, externalConsent: true });
    await go(page, "/recommendations/");
    await expect(page.getByTestId("rec-tomato")).toHaveAttribute("data-status", "protect");
    await expect(page.getByTestId("rec-tomato")).toContainText("حساس للصقيع");
    await expect(page.getByTestId("rec-garlic")).toHaveAttribute("data-status", "now");
  });

  test("home page shows the section with the saved location", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-10T09:00:00+03:00"));
    await seedLocation(page, jericho);
    await go(page, "/");
    await expect(page.getByTestId("home-location-label")).toHaveText("أريحا والأغوار");
    await expect(page.getByRole("heading", { name: "يُزرع الآن في منطقتك" })).toBeVisible();
    await expect(page.getByTestId("home-now-context")).toContainText("لـأريحا والأغوار");
    // Same engine as /recommendations: tomato is in season in the Jordan Valley in October.
    await expect(page.getByTestId("home-now-tomato")).toContainText("مناسب الآن");
  });
});
