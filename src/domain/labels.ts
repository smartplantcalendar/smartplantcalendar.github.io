import type {
  ClimateZone,
  CropCategory,
  DataStatus,
  Difficulty,
  GuideSection,
  IrrigationSystem,
  LifeCycle,
  PlantingMethod,
  PlantingStatus,
  Season,
  SpaceType,
  SunRequirement,
  TaskStatus,
  TaskType,
  WaterNeed,
  ZoneSuitability,
} from "./types";

export const CLIMATE_ZONE_LABELS: Record<ClimateZone, string> = {
  coastal: "ساحلي",
  highland: "جبلي / مرتفعات",
  inland_plain: "سهلي داخلي",
  jordan_valley: "غور / منخفض حار",
  arid: "صحراوي / شبه جاف",
};

/** Countries a planting source can be scoped to. */
export const COUNTRY_LABELS: Record<string, string> = {
  PS: "فلسطين",
  JO: "الأردن",
  LB: "لبنان",
  SY: "سوريا",
};

export const CLIMATE_ZONE_DESCRIPTIONS: Record<ClimateZone, string> = {
  coastal: "شتاء معتدل نادر الصقيع وصيف رطب، مثل غزة ويافا وحيفا وبيروت.",
  highland: "شتاء بارد قد يشهد صقيعًا وثلوجًا أحيانًا وصيف معتدل، مثل الخليل والقدس ونابلس وعمّان.",
  inland_plain: "سهول داخلية متوسطة الارتفاع، أدفأ من الجبال وأبرد من الساحل شتاءً، مثل جنين وطولكرم.",
  jordan_valley: "منطقة منخفضة شديدة الحرارة صيفًا ودافئة شتاءً، مثل أريحا والأغوار؛ موسمها الرئيسي في الخريف والشتاء.",
  arid: "أمطار قليلة وحرارة مرتفعة وتبخر عالٍ، مثل النقب والعقبة؛ تحتاج الزراعة فيها إلى ري منتظم وحماية.",
};

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  home_garden: "حديقة منزلية",
  rooftop: "سطح منزل",
  balcony: "شرفة",
  containers: "أصص زراعية",
  small_plot: "قطعة أرض صغيرة",
  farm: "مزرعة",
  greenhouse: "بيت محمي",
};

export const SPACE_TYPE_DESCRIPTIONS: Record<SpaceType, string> = {
  home_garden: "تربة أرضية بجانب المنزل",
  rooftop: "أحواض أو أكياس زراعة على السطح",
  balcony: "مساحة محدودة وإضاءة متفاوتة",
  containers: "أوعية متنقلة بأحجام مختلفة",
  small_plot: "أرض مكشوفة حتى بضع مئات من الأمتار",
  farm: "مساحات إنتاجية أوسع",
  greenhouse: "زراعة تحت غطاء (لا توجد قواعد خاصة به بعد)",
};

/** Spaces where plants grow in containers and soil dries faster. */
export const CONTAINER_SPACES: SpaceType[] = ["rooftop", "balcony", "containers"];

/**
 * Space types without dedicated rules in the crop data. Recommendations and
 * plans fall back to open-field windows for them and say so.
 */
export const SPACES_WITHOUT_RULES: SpaceType[] = ["greenhouse"];

export const GREENHOUSE_NOTICE =
  "لا تتوفر في بيانات المنصة حاليًا مواعيد خاصة بالبيوت المحمية، لذلك نعرض مواعيد الزراعة المكشوفة. البيت المحمي يقي عادةً من الصقيع الخفيف لكنه قد يرفع الحرارة كثيرًا؛ استشر مرشدًا زراعيًا لمواعيد العروات المحمية.";

export const CATEGORY_LABELS: Record<CropCategory, string> = {
  fruiting_vegetable: "خضار ثمرية",
  leafy_vegetable: "خضار ورقية",
  root_tuber: "درنات وجذور",
  bulb: "أبصال",
  herb: "أعشاب عطرية",
  fruit: "فواكه",
  tree: "أشجار مثمرة",
  legume: "بقوليات",
  cereal: "حبوب",
  forage: "أعلاف",
  field_crop: "محاصيل حقلية",
  ornamental: "أزهار ونباتات زينة",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "متقدم",
};

export const SUN_LABELS: Record<SunRequirement, string> = {
  full_sun: "شمس كاملة",
  partial_sun: "شمس جزئية",
  shade_tolerant: "يتحمل الظل",
};

export const WATER_LABELS: Record<WaterNeed, string> = {
  low: "منخفضة",
  moderate: "متوسطة",
  high: "مرتفعة",
};

export const LIFE_CYCLE_LABELS: Record<LifeCycle, string> = {
  annual: "موسمي",
  perennial: "معمّر",
};

/** Full description of each method (planting in the final place unless stated). */
export const METHOD_LABELS: Record<PlantingMethod, string> = {
  direct_sowing: "بذر البذور مباشرة في الأرض",
  transplanting: "زراعة الأشتال الجاهزة في الأرض",
  tubers: "زراعة الدرنات في الأرض",
  cloves: "زراعة الفصوص في الأرض",
  cuttings: "زراعة العُقَل في الأرض",
  saplings: "غرس الغرسة الجاهزة في الأرض",
  nursery_sowing: "بذر البذور في المشتل لتجهيز الأشتال",
  offshoots: "زراعة الفسيلة الجاهزة المتجذرة في الأرض",
  bulbs: "زراعة الأبصال في الأرض",
};

/** Short label for lists, e.g. «زراعة الأشتال في الأرض: آذار – نيسان». */
export const METHOD_SHORT_LABELS: Record<PlantingMethod, string> = {
  direct_sowing: "البذر في الأرض",
  transplanting: "زراعة الأشتال في الأرض",
  tubers: "زراعة الدرنات",
  cloves: "زراعة الفصوص",
  cuttings: "زراعة العُقَل",
  saplings: "الغرس",
  nursery_sowing: "البذر في المشتل",
  offshoots: "زراعة الفسائل المتجذرة",
  bulbs: "زراعة الأبصال",
};

export const SEASON_LABELS: Record<Season, string> = {
  winter: "الشتاء",
  spring: "الربيع",
  summer: "الصيف",
  autumn: "الخريف",
};

/** Months that belong to each season in the Levant. */
export const SEASON_MONTHS: Record<Season, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

/** The farmer-facing caveat shown wherever an estimated date appears. */
export const ESTIMATE_NOTICE = "هذه مواعيد تقديرية قد تختلف بحسب الصنف والمنطقة والطقس.";

export const ZONE_SUITABILITY_LABELS: Record<ZoneSuitability, string> = {
  possible: "ممكن مبدئيًا ويحتاج تحققًا",
  needs_irrigation: "مشروط بريّ كافٍ وتحليل الموقع",
  needs_frost_protection: "مشروط بالحماية من الصقيع",
  local_guidance: "معلومة محلية استرشادية تحتاج تحققًا",
  not_recommended: "لا يُوصى بالزراعة المكشوفة (غير ملائم غالبًا)",
};

export const IRRIGATION_SYSTEM_LABELS: Record<IrrigationSystem, string> = {
  supplemental: "زراعة مكشوفة مع ريّ داعم",
  irrigated_only: "زراعة مكشوفة مروية فقط",
};

export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  preliminary: "بيانات أولية إرشادية",
  reviewed: "مراجعة من مختص",
  incomplete: "معلومات غير مكتملة",
  estimated: "مواعيد تقديرية",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  soil_prep: "تجهيز التربة",
  planting: "زراعة",
  irrigation: "ري",
  fertilizing: "تسميد",
  care: "عناية",
  pest_check: "فحص الآفات",
  harvest: "حصاد",
  custom: "مهمة خاصة",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "قيد الانتظار",
  done: "مكتملة",
  skipped: "متجاوزة",
};

export const PLANTING_STATUS_LABELS: Record<PlantingStatus, string> = {
  active: "نشط",
  harvested: "تم حصاده",
  archived: "مؤرشف",
};

export const GUIDE_SECTION_LABELS: Record<GuideSection, string> = {
  overview: "نظرة عامة",
  planting: "الزراعة",
  care: "العناية",
  irrigation: "الري",
  fertilization: "التسميد",
  harvest: "الحصاد",
  problems: "المشكلات الشائعة",
};
