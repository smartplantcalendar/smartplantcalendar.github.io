/**
 * Prints the real size and coverage of the crop catalogue.
 * Run: npm run crops:report
 */
import { CROP_SOURCES } from "../src/data/crop-sources";
import { SEED_CROPS } from "../src/data/crops";
import { CATEGORY_LABELS, CLIMATE_ZONE_LABELS, DATA_STATUS_LABELS } from "../src/domain/labels";
import { isEstimatedOnly, windowsForZone } from "../src/domain/planting-windows";
import { CLIMATE_ZONES, CROP_CATEGORIES, DATA_STATUSES, type PlantingWindow } from "../src/domain/types";

const total = SEED_CROPS.length;
const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
const aliases = SEED_CROPS.reduce((n, c) => n + (c.otherNames?.length ?? 0), 0);

console.log(`المحاصيل: ${total}`);
for (const s of DATA_STATUSES) console.log(`  ${DATA_STATUS_LABELS[s]}: ${SEED_CROPS.filter((c) => c.dataStatus === s).length}`);
console.log(`الأسماء البديلة: ${aliases}`);
console.log("حسب التصنيف:");
for (const cat of CROP_CATEGORIES) console.log(`  ${CATEGORY_LABELS[cat]}: ${SEED_CROPS.filter((c) => c.category === cat).length}`);
const usedIds = new Set(CROP_SOURCES.filter((s) => s.status === "used").map((s) => s.id));
const sourced = (w: PlantingWindow) => Boolean(w.sourceId && usedIds.has(w.sourceId));
const withWindows = SEED_CROPS.filter((c) => c.windows.length > 0);
const sourcedCrops = SEED_CROPS.filter((c) => c.windows.some(sourced));
const sourcedWindows = SEED_CROPS.flatMap((c) => c.windows.filter(sourced));
console.log(`محاصيل لها مواعيد مسجّلة: ${withWindows.length}`);
console.log(`محاصيل لها مواعيد موثّقة بمصدر: ${sourcedCrops.length} (${sourcedCrops.map((c) => c.name).join("، ")})`);
console.log(`عدد المواعيد الموثّقة بمصدر: ${sourcedWindows.length} (لمنطقة محددة: ${sourcedWindows.filter((w) => w.zone).length}، عامة لفلسطين: ${sourcedWindows.filter((w) => !w.zone).length})`);
console.log("التغطية لموقع في فلسطين، حسب المنطقة:");
for (const z of CLIMATE_ZONES) {
  const anyN = SEED_CROPS.filter((c) => windowsForZone(c, z, "PS").length > 0).length;
  const specific = SEED_CROPS.filter((c) => c.windows.some((w) => w.zone === z && sourced(w))).length;
  const general = SEED_CROPS.filter((c) => {
    const ws = windowsForZone(c, z, "PS");
    return ws.length > 0 && ws.every((w) => w.zone === null) && ws.some(sourced);
  }).length;
  const estimatedN = SEED_CROPS.filter((c) => isEstimatedOnly(windowsForZone(c, z, "PS"))).length;
  console.log(`  ${CLIMATE_ZONE_LABELS[z]}: أي موعد ${anyN} (${pct(anyN)}) · موثّق لهذه المنطقة ${specific} (${pct(specific)}) · موثّق عام لفلسطين فقط ${general} (${pct(general)}) · تقديري فقط ${estimatedN} (${pct(estimatedN)})`);
}
console.log("التغطية لموقع خارج فلسطين (الأردن مثلًا): المواعيد الفلسطينية لا تُطبّق، فتبقى المحاصيل الموثّقة فلسطينيًا بلا موعد هناك:");
for (const z of CLIMATE_ZONES) {
  const n = SEED_CROPS.filter((c) => windowsForZone(c, z, "JO").length > 0).length;
  console.log(`  ${CLIMATE_ZONE_LABELS[z]}: ${n} (${pct(n)})`);
}
const used = usedIds.size;
console.log(`المراجع: ${CROP_SOURCES.length} (مستخدمة: ${used}، بانتظار المراجعة: ${CROP_SOURCES.length - used})`);
