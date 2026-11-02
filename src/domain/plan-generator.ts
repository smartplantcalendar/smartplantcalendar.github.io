/**
 * Plan generator: expands a crop's task templates into dated tasks relative to
 * the planting date. Pure and deterministic so it can run both in the browser
 * (guest mode) and on the server (signed-in users, where the crop rules are
 * re-loaded from the database instead of trusted from the client).
 */
import { addDays, monthOf } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { CONTAINER_SPACES, GREENHOUSE_NOTICE, SPACES_WITHOUT_RULES, SPACE_TYPE_LABELS } from "./labels";
import { evaluateWindowFit, isGeneralOnly, mainWindowsForZone, primaryMethod, windowsForZone, type WindowFit } from "./planting-windows";
import type { ClimateZone, Crop, ISODate, PlantingMethod, SpaceType, TaskTemplate, TaskType } from "./types";

export interface PlanInput {
  crop: Crop;
  plantedOn: ISODate;
  zone: ClimateZone;
  spaceType: SpaceType;
  /** ISO country of the garden; windows scoped to another country are ignored. */
  country?: string | null;
}

export interface GeneratedTask {
  templateKey: string;
  type: TaskType;
  title: string;
  description: string;
  dueDate: ISODate;
}

export interface GeneratedPlan {
  tasks: GeneratedTask[];
  expectedHarvestStart: ISODate | null;
  expectedHarvestEnd: ISODate | null;
  windowFit: WindowFit;
  /** Arabic notices the UI must show next to the plan. */
  warnings: string[];
  /** True when the plan relies on incomplete data (e.g. unknown growth period). */
  isTentative: boolean;
}

/** Safety cap so a misconfigured template can never explode the plan. */
export const MAX_TASKS_PER_PLAN = 400;

/** Containers dry out faster: shorten irrigation check intervals. */
export function adjustIntervalForSpace(interval: number, type: TaskType, spaceType: SpaceType): number {
  if (type !== "irrigation" || !CONTAINER_SPACES.includes(spaceType)) return interval;
  return Math.max(1, Math.round(interval * 0.6));
}

const PLANT_TITLE: Record<PlantingMethod, (name: string) => string> = {
  direct_sowing: (n) => `بذر ${n} في الأرض`,
  nursery_sowing: (n) => `بذر ${n} في المشتل أو الصواني`,
  transplanting: (n) => `نقل أشتال ${n} إلى الأرض`,
  tubers: (n) => `زراعة درنات ${n}`,
  cloves: (n) => `زراعة فصوص ${n}`,
  cuttings: (n) => `زراعة عُقَل ${n}`,
  saplings: (n) => `زراعة غراس ${n}`,
  offshoots: (n) => `زراعة فسائل ${n}`,
  bulbs: (n) => `زراعة أبصال ${n}`,
};

/**
 * General tasks for crops that have documented planting windows but no
 * crop-specific task rules yet. They contain nothing crop-specific beyond the
 * planting method of the zone: no fertiliser doses, no harvest date.
 */
export function genericTemplates(
  crop: Pick<Crop, "name" | "windows" | "propagation" | "primaryMethod">,
  zone: ClimateZone,
  country?: string | null,
): TaskTemplate[] {
  // The plan starts on the day the plant goes into its final place.
  const method = mainWindowsForZone(crop, zone, country)[0]?.method ?? primaryMethod(crop) ?? "direct_sowing";
  return [
    {
      key: "generic-soil",
      type: "soil_prep",
      offsetDays: -7,
      title: `تجهيز التربة لـ${crop.name}`,
      description: "نظّف المكان من الأعشاب، واقلب التربة وأضف سمادًا عضويًا متحللًا، وتأكد من تصريف الماء. هذه مهمة عامة وليست توصية خاصة بالمحصول.",
    },
    {
      key: "generic-plant",
      type: "planting",
      offsetDays: 0,
      title: PLANT_TITLE[method](crop.name),
      description: "الموعد حسب التاريخ الذي اخترته. راجع مصدر المواعيد في صفحة المحصول.",
    },
    {
      key: "generic-water",
      type: "irrigation",
      offsetDays: 2,
      repeatEveryDays: 3,
      untilOffsetDays: 60,
      title: `متابعة رطوبة التربة لـ${crop.name}`,
      description:
        "إن كانت زراعتك مروية: افحص رطوبة التربة بإصبعك على عمق 3–5 سم، واروِ عند جفافها فقط. في الزراعة البعلية تعتمد على المطر، فتجاوز المهمة. تجاوزها أيضًا إن هطلت أمطار كافية.",
    },
    {
      key: "generic-pests",
      type: "pest_check",
      offsetDays: 14,
      repeatEveryDays: 7,
      untilOffsetDays: 60,
      title: `تفقّد ${crop.name}`,
      description: "افحص الأوراق من الجهتين بحثًا عن حشرات أو بقع، واسأل المرشد الزراعي عند الشك.",
    },
  ];
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const { crop, plantedOn, zone, spaceType } = input;
  const tasks: GeneratedTask[] = [];
  const warnings: string[] = [];
  const containerSpace = CONTAINER_SPACES.includes(spaceType);

  const generic = crop.templates.length === 0;
  const templates = generic ? genericTemplates(crop, zone, input.country) : crop.templates;
  if (generic) {
    warnings.push("لا تتوفر بعد قواعد مهام خاصة بهذا المحصول، لذلك تتضمن الخطة مهام عامة فقط: تجهيز التربة والزراعة ومتابعة الرطوبة والتفقد.");
  }

  for (const t of templates) {
    const base = {
      templateKey: t.key,
      type: t.type,
      title: t.title,
      description:
        containerSpace && t.type === "irrigation"
          ? `${t.description} في الأصص والأحواض تجف التربة أسرع، لذلك قُرّبت مواعيد المتابعة.`
          : t.description,
    };

    if (t.repeatEveryDays && t.repeatEveryDays > 0) {
      const interval = adjustIntervalForSpace(t.repeatEveryDays, t.type, spaceType);
      const until = t.untilOffsetDays ?? t.offsetDays;
      for (let offset = t.offsetDays; offset <= until; offset += interval) {
        const dueDate = addDays(plantedOn, offset);
        if (t.activeMonths?.length && !t.activeMonths.includes(monthOf(dueDate))) continue;
        tasks.push({ ...base, templateKey: `${t.key}#${offset}`, dueDate });
        if (tasks.length >= MAX_TASKS_PER_PLAN) break;
      }
    } else {
      tasks.push({ ...base, dueDate: addDays(plantedOn, t.offsetDays) });
    }
    if (tasks.length >= MAX_TASKS_PER_PLAN) break;
  }

  tasks.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  let expectedHarvestStart: ISODate | null = null;
  let expectedHarvestEnd: ISODate | null = null;
  let isTentative = crop.dataStatus !== "reviewed";

  if (crop.growthDaysMin != null && crop.growthDaysMax != null) {
    expectedHarvestStart = addDays(plantedOn, crop.growthDaysMin);
    expectedHarvestEnd = addDays(plantedOn, crop.growthDaysMax);
    const harvest = tasks.find((t) => t.type === "harvest");
    if (harvest) {
      harvest.description = `${harvest.description} نافذة الحصاد التقديرية: من ${formatShortDate(expectedHarvestStart)} إلى ${formatShortDate(expectedHarvestEnd)}.`;
    }
  } else {
    isTentative = true;
    warnings.push(
      crop.lifeCycle === "perennial"
        ? "هذا محصول معمّر ولا تتوفر لدينا مدة موثوقة حتى أول إنتاج، لذلك تركز الخطة على العناية في السنة الأولى دون موعد حصاد محدد."
        : "لا تتوفر مدة نمو موثوقة لهذا المحصول، لذلك لم نحدد موعد حصاد متوقع.",
    );
  }

  const windowFit = evaluateWindowFit(crop, zone, monthOf(plantedOn), input.country);
  if (isGeneralOnly(windowsForZone(crop, zone, input.country))) {
    warnings.push("مواعيد هذا المحصول عامة على مستوى البلد وليست خاصة بمنطقتك المناخية؛ تأكد من الإرشاد الزراعي المحلي.");
  }
  if (windowFit === "outside_window") {
    warnings.push(
      "تاريخ الزراعة المختار يقع خارج المواعيد الأولية المقترحة لمنطقتك المناخية. قد يتأثر النبات بالحرارة أو البرودة؛ راجع المواعيد المقترحة أو استشر مرشدًا زراعيًا محليًا.",
    );
  } else if (windowFit === "near_window") {
    warnings.push("تاريخ الزراعة قريب من حافة الموعد المقترح لمنطقتك؛ راقب الطقس جيدًا في الأسابيع الأولى.");
  } else if (windowFit === "no_data") {
    warnings.push("لا تتوفر لدينا مواعيد زراعة لهذا المحصول في منطقتك المناخية، لذلك لا يمكن تقييم ملاءمة التاريخ.");
  }

  if (SPACES_WITHOUT_RULES.includes(spaceType)) {
    warnings.push(GREENHOUSE_NOTICE);
  } else if (crop.spaceTypes.length === 0) {
    warnings.push("لم نوثّق بعد أنواع المساحات المناسبة لهذا المحصول.");
  } else if (!crop.spaceTypes.includes(spaceType)) {
    warnings.push(
      `لا يُعد هذا المحصول مناسبًا عادةً لـ«${SPACE_TYPE_LABELS[spaceType]}». يمكنك المتابعة، لكن النتائج قد تكون محدودة.`,
    );
  }

  if (crop.dataStatus !== "reviewed") {
    warnings.push(
      "الجدول مبني على بيانات أولية عامة وليس توصية قطعية. عدّل المواعيد حسب حالة نباتك وتربتك وطقسك.",
    );
  }

  return { tasks, expectedHarvestStart, expectedHarvestEnd, windowFit, warnings, isTentative };
}
