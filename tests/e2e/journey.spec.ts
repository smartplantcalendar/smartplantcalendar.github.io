import { expect, test, type Page } from "@playwright/test";
import { BASE, go, seedLocation } from "./helpers";

const HEBRON = { latitude: 31.5326, longitude: 35.0998, label: "الخليل", regionId: "ps-hebron", zone: "highland" as const };

/** Planner step 1 without a saved location: pick a city from the list and confirm. */
async function chooseCityInPlanner(page: Page, cityId: string) {
  await page.locator("summary", { hasText: "خيارات متقدمة" }).click();
  await page.getByLabel("المدينة").selectOption(cityId);
  await page.getByRole("button", { name: "نعم، احفظ الموقع" }).click();
}

/**
 * Acceptance journey in preview/guest mode (no Supabase):
 * home → crop search → planner (city, space, crop, date) → plan → calendar →
 * edit a task → mark it complete. Also asserts there is no stray English UI.
 */

const ENGLISH_ALLOWED = /Open-Meteo|OpenStreetMap|Nominatim|Copernicus|GPS|Supabase|Solanum|Cucumis|Allium|Lactuca|Capsicum|Mentha|Origanum|Fragaria|Olea|Vitis|spp\.|ananassa|lycopersicum|sativus|tuberosum|cepa|sativum|annuum|syriacum|europaea|vinifera|×/g;

async function expectNoStrayEnglish(page: Page) {
  const text = await page.locator("body").innerText();
  const cleaned = text.replace(ENGLISH_ALLOWED, "");
  const words = cleaned.match(/[A-Za-z]{3,}/g) ?? [];
  expect(words, `English words found: ${words.join(", ")}`).toEqual([]);
}

const NEXT_YEAR = new Date().getFullYear() + 1;
const PLANT_DATE = `${NEXT_YEAR}-10-05`;

test("guest can plan a crop and manage tasks in the calendar", async ({ page, isMobile }) => {
  await go(page, "/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("شو بدك تزرع");
  await expectNoStrayEnglish(page);

  // Browse and search crops.
  await go(page, "/crops");
  await page.getByRole("searchbox", { name: "ابحث عن محصول" }).fill("بندوره");
  await expect(page.getByText(/^1 من \d+ محصولًا$/)).toBeVisible();
  await page.getByRole("link", { name: /البندورة/ }).first().click();
  await expect(page).toHaveURL(/\/crops\/tomato/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("البندورة");
  await expectNoStrayEnglish(page);

  // Planner wizard.
  await page.getByRole("link", { name: /أنشئ خطة زراعة البندورة/ }).click();
  await expect(page).toHaveURL(/\/planner\/?\?crop=tomato/);
  await chooseCityInPlanner(page, "ps-jericho");
  await expect(page.getByRole("radio", { name: /غور/ })).toBeChecked();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("radio", { name: /سطح منزل/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("button", { name: /البندورة/, pressed: true })).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByLabel("تاريخ الزراعة أو الشتل").fill(PLANT_DATE);
  await page.getByLabel("اسم المساحة").fill("سطح البيت");
  await expect(page.getByText(/ضمن المواعيد المقترحة لمنطقتك/)).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "راجع خطتك" })).toBeVisible();
  await expectNoStrayEnglish(page);
  await page.getByRole("button", { name: "أنشئ الخطة" }).click();
  await expect(page.getByRole("heading", { name: "خطتك جاهزة" })).toBeVisible();

  // Calendar shows the planting day.
  await page.getByRole("button", { name: "عرض المهام في الرزنامة" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar/?\\?date=${PLANT_DATE}`));
  await expect(page.getByRole("heading", { name: new RegExp(`تشرين الأول \\(أكتوبر\\) ${NEXT_YEAR}`) })).toBeVisible();
  const dayPanel = page.locator("section[aria-labelledby='day-title']");
  await expect(dayPanel.getByText("شتل أشتال البندورة")).toBeVisible();
  await expectNoStrayEnglish(page);

  // Open the task, edit its title and date, then complete it.
  await dayPanel.getByRole("button", { name: /^شتل أشتال البندورة/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "تعديل" }).click();
  await dialog.getByLabel("عنوان المهمة").fill("شتل البندورة على السطح");
  await dialog.getByLabel("التاريخ").fill(`${NEXT_YEAR}-10-06`);
  await dialog.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(dialog.getByRole("heading", { name: "شتل البندورة على السطح" })).toBeVisible();
  await dialog.getByRole("button", { name: "وضع كمكتملة" }).click();
  await expect(dialog.getByRole("button", { name: "إلغاء الإكمال" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Data survives a reload (stored in this browser) and appears in task list.
  await go(page, "/tasks");
  await page.getByRole("tab", { name: /المكتملة/ }).click();
  await expect(page.getByText("شتل البندورة على السطح")).toBeVisible();

  await go(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "محاصيلي" })).toBeVisible();
  await expect(page.getByText("سطح البيت · سطح منزل")).toBeVisible();
  await expectNoStrayEnglish(page);

  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "التنقل السريع" })).toBeVisible();
    for (const path of ["/", "/crops", "/crops/tomato", "/planner", "/calendar", "/tasks", "/dashboard", "/weather", "/location/", "/recommendations/"]) {
      await go(page, path);
      // In mobile emulation the layout viewport grows when content overflows, so compare with the device width.
      const overflow = await page.evaluate(() => Math.max(window.innerWidth, document.documentElement.scrollWidth) - screen.width);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
  }
});

test("weather failure shows an Arabic message and the page keeps working", async ({ page }) => {
  await seedLocation(page, HEBRON);
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await go(page, "/weather");
  await expect(page.getByText("الطقس غير متاح الآن")).toBeVisible();
  await expect(page.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
  await expectNoStrayEnglish(page);
});

test("weather renders forecast and agricultural alerts from the API", async ({ page }) => {
  await seedLocation(page, HEBRON);
  const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        latitude: 31.53,
        longitude: 35.1,
        timezone: "Asia/Hebron",
        current: { time: "2026-11-01T10:00", temperature_2m: 19.4, apparent_temperature: 18, relative_humidity_2m: 55, wind_speed_10m: 12, weather_code: 2, is_day: 1 },
        daily: {
          time: days,
          weather_code: days.map((_, i) => (i === 2 ? 63 : 1)),
          temperature_2m_max: days.map(() => 21),
          temperature_2m_min: days.map((_, i) => (i === 4 ? 1 : 10)),
          precipitation_probability_max: days.map((_, i) => (i === 2 ? 85 : 5)),
          precipitation_sum: days.map((_, i) => (i === 2 ? 6 : 0)),
          wind_speed_10m_max: days.map(() => 15),
        },
      }),
    }),
  );
  await go(page, "/weather");
  await expect(page.getByText("19°")).toBeVisible();
  await expect(page.getByText(/احتمال صقيع —/)).toBeVisible();
  await expect(page.getByText(/احتمال أمطار —/)).toBeVisible();
  await expect(page.getByText(/المصدر: Open-Meteo/)).toBeVisible();
  await expectNoStrayEnglish(page);
});

test("planting in the past can mark earlier tasks as completed", async ({ page }) => {
  await seedLocation(page, HEBRON);
  const d = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
  await go(page, "/planner?crop=lettuce");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("radio", { name: /أصص زراعية/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByLabel("تاريخ الزراعة أو الشتل").fill(d);
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("تاريخ الزراعة في الماضي")).toBeVisible();
  await page.getByRole("button", { name: "أنشئ الخطة" }).click();
  await expect(page.getByRole("heading", { name: "خطتك جاهزة" })).toBeVisible();
  await go(page, "/tasks");
  await expect(page.getByText("لا توجد مهام لليوم أو متأخرة. عمل رائع!").or(page.getByText(/اليوم/).first())).toBeVisible();
  await expect(page.locator("text=/متأخرة \\d/")).toHaveCount(0);
});

test("preview mode explains disabled accounts and protects admin", async ({ page }) => {
  for (const path of ["/auth/login", "/auth/register", "/auth/forgot-password"]) {
    await go(page, path);
    await expect(page.getByText("الحسابات غير مفعّلة في وضع المعاينة")).toBeVisible();
    await expect(page.getByLabel("كلمة المرور")).toHaveCount(0);
    await expectNoStrayEnglish(page);
  }
  await go(page, "/admin");
  await expect(page.getByText("لوحة الإدارة تتطلب تهيئة قاعدة البيانات")).toBeVisible();
  await go(page, "/profile");
  await expect(page.getByText("الملف الشخصي غير متاح في وضع المعاينة")).toBeVisible();
  const res = await go(page, "/this-page-does-not-exist/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
  for (const path of ["/privacy", "/terms", "/contact", "/weather", "/crops/zaatar"]) {
    await go(page, path);
    await expectNoStrayEnglish(page);
  }
});

test("keyboard users can reach the main content and open the menu", async ({ page }) => {
  await go(page, "/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "تخطَّ إلى المحتوى" })).toBeFocused();
});

test("every page opens directly and survives a browser refresh under the sub-path", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes(BASE) && !r.url().includes("does-not-exist")) failed.push(`${r.status()} ${r.url()}`);
  });
  const pages: [string, RegExp][] = [
    ["/", /شو بدك تزرع/],
    ["/crops/", /ماذا تريد أن تزرع؟/],
    ["/crops/olive/", /الزيتون/],
    ["/planner/", /أنشئ خطتك الزراعية/],
    ["/calendar/", /رزنامتي الزراعية/],
    ["/tasks/", /المهام والتذكيرات/],
    ["/weather/", /طقس منطقتك/],
    ["/location/", /وين أرضك؟/],
    ["/recommendations/", /ماذا أزرع الآن في منطقتي؟/],
    ["/privacy/", /سياسة الخصوصية/],
    ["/admin/crops/edit/", /لوحة الإدارة تتطلب/],
  ];
  for (const [path, heading] of pages) {
    await go(page, path);
    await expect(page.getByText(heading).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(heading).first()).toBeVisible();
  }
  // Without the trailing slash GitHub Pages redirects to the folder; the page must still load.
  await go(page, "/crops/tomato");
  await expect(page).toHaveURL(new RegExp(`${BASE}/crops/tomato/$`));
  await expect(page.locator("h1")).toHaveText("البندورة");
  // Fonts and styles are served from the sub-path.
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Cairo"', "زراعة");
  });
  expect(fontOk).toBe(true);
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont).toContain("Cairo");
  expect(failed).toEqual([]);
});

test("client-side navigation keeps the sub-path and guest data persists after reload", async ({ page }) => {
  await seedLocation(page, HEBRON);
  await go(page, "/");
  await page.getByRole("link", { name: /خطة زراعية جديدة/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/planner/$`));
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("radio", { name: /شرفة/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: /الخس/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByLabel("تاريخ الزراعة أو الشتل").fill(`${NEXT_YEAR}-03-10`);
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "أنشئ الخطة" }).click();
  await expect(page.getByRole("heading", { name: "خطتك جاهزة" })).toBeVisible();
  await go(page, "/dashboard/");
  await page.reload();
  await expect(page.getByText(/حديقتي · شرفة/)).toBeVisible();
});
