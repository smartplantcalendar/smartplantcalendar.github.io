/**
 * Catalogue entries: crops that are listed so farmers can find them by any
 * common name, but whose planting information is NOT documented yet.
 *
 * What is here is identity data only — Arabic names and dialect synonyms,
 * scientific name, category, life cycle and the usual ways the crop is
 * established (seed, seedlings, tubers, saplings…). There are deliberately
 * no planting windows, growth periods, sun/water needs or task rules: those
 * must come from a reference in `crop-sources.ts` with status "used"
 * (see docs/CROP_DATA.md). Until then the UI shows «لا توجد معلومات موثوقة
 * كافية» and the crop cannot be added to a plan.
 */
import type { Crop, CropCategory, LifeCycle, PlantingMethod } from "@/domain/types";
import { DOCUMENTED_CROPS } from "./crop-documented";

type Entry = [
  slug: string,
  name: string,
  otherNames: string[],
  scientificName: string,
  category: CropCategory,
  lifeCycle: LifeCycle,
  propagation: PlantingMethod[],
];

const A: LifeCycle = "annual";
const P: LifeCycle = "perennial";

// Propagation: most common way to PLANT in the final place first (the
// farmer's default: a ready sapling for trees, a ready seedling for herbs);
// cuttings/offshoot propagation follow as secondary methods.
const ENTRIES: Entry[] = [
  // خضار ثمرية
  ["eggplant", "الباذنجان", ["البتنجان", "الباذنجان البلدي"], "Solanum melongena", "fruiting_vegetable", A, ["nursery_sowing", "transplanting"]],
  ["zucchini", "الكوسا", ["الكوسى", "الكوسة"], "Cucurbita pepo", "fruiting_vegetable", A, ["direct_sowing", "transplanting"]],
  ["okra", "البامية", ["الباميا", "البامياء"], "Abelmoschus esculentus", "fruiting_vegetable", A, ["direct_sowing"]],
  ["watermelon", "البطيخ", ["الجبس", "البطيخ الأحمر", "الحبحب", "البطيخ الأخضر"], "Citrullus lanatus", "fruiting_vegetable", A, ["direct_sowing", "transplanting"]],
  ["melon", "الشمام", ["البطيخ الأصفر", "القاوون", "الشمّام", "الكنتالوب"], "Cucumis melo", "fruiting_vegetable", A, ["direct_sowing", "transplanting"]],
  ["snake-cucumber", "الفقوس", ["القثاء", "الفقّوس", "الخيار الأرمني"], "Cucumis melo var. flexuosus", "fruiting_vegetable", A, ["direct_sowing"]],
  ["pumpkin", "اليقطين", ["القرع", "القرع العسلي", "القرع الأحمر"], "Cucurbita spp.", "fruiting_vegetable", A, ["direct_sowing"]],
  ["artichoke", "الخرشوف", ["الأرضي شوكي", "الخرشوفة", "الأرضيشوكي"], "Cynara cardunculus var. scolymus", "fruiting_vegetable", P, ["offshoots", "transplanting"]],
  ["corn", "الذرة الصفراء", ["الذرة", "الذرة الحلوة", "الذرة الشامية"], "Zea mays", "cereal", A, ["direct_sowing"]],

  // خضار ورقية
  ["cabbage", "الملفوف", ["الكرنب"], "Brassica oleracea var. capitata", "leafy_vegetable", A, ["nursery_sowing", "transplanting"]],
  ["cauliflower", "الزهرة", ["القرنبيط", "القرنابيط", "الزهرة البيضاء"], "Brassica oleracea var. botrytis", "leafy_vegetable", A, ["nursery_sowing", "transplanting"]],
  ["broccoli", "البروكلي", ["البروكولي", "القرنبيط الأخضر", "الزهرة الخضراء"], "Brassica oleracea var. italica", "leafy_vegetable", A, ["nursery_sowing", "transplanting"]],
  ["spinach", "السبانخ", ["السبانخ البلدي", "الإسبانخ"], "Spinacia oleracea", "leafy_vegetable", A, ["direct_sowing"]],
  ["chard", "السلق", ["السلق الأخضر", "السلق البلدي"], "Beta vulgaris subsp. vulgaris", "leafy_vegetable", A, ["direct_sowing", "transplanting"]],
  ["molokhia", "الملوخية", ["الملوخيه", "الملوخية الخضراء"], "Corchorus olitorius", "leafy_vegetable", A, ["direct_sowing"]],
  ["arugula", "الجرجير", ["الروكا", "الجرجير البلدي"], "Eruca vesicaria", "leafy_vegetable", A, ["direct_sowing"]],
  ["cress", "الرشاد", ["حب الرشاد", "الحرف", "الثفاء"], "Lepidium sativum", "leafy_vegetable", A, ["direct_sowing"]],
  ["purslane", "البقلة", ["الفرفحينة", "الرجلة", "الفرفحين"], "Portulaca oleracea", "leafy_vegetable", A, ["direct_sowing"]],
  ["chicory", "الهندباء", ["العلت", "الهندبة", "السريس"], "Cichorium intybus", "leafy_vegetable", P, ["direct_sowing"]],
  ["mallow", "الخبيزة", ["الخبّيزة", "الخبازى", "الخبيز"], "Malva spp.", "leafy_vegetable", A, ["direct_sowing"]],
  ["celery", "الكرفس", ["الكرفس البلدي", "الكرفس الأخضر"], "Apium graveolens", "leafy_vegetable", A, ["nursery_sowing", "transplanting"]],
  ["akkoub", "العكوب", ["عكوب"], "Gundelia tournefortii", "leafy_vegetable", P, ["direct_sowing"]],
  ["leek", "الكراث", ["الكرّاث", "الكراث الأبيض"], "Allium ampeloprasum", "bulb", A, ["nursery_sowing", "transplanting"]],

  // جذور ودرنات
  ["carrot", "الجزر", ["الجزر البلدي", "الجزر البرتقالي"], "Daucus carota subsp. sativus", "root_tuber", A, ["direct_sowing"]],
  ["radish", "الفجل", ["الفجل الأحمر", "الفجل البلدي", "الفجل الأبيض"], "Raphanus sativus", "root_tuber", A, ["direct_sowing"]],
  ["turnip", "اللفت", ["اللفت الأبيض", "الشلغم", "اللفت البلدي"], "Brassica rapa subsp. rapa", "root_tuber", A, ["direct_sowing"]],
  ["beetroot", "الشمندر", ["البنجر", "الشوندر", "الشمندر الأحمر", "البنجر الأحمر"], "Beta vulgaris", "root_tuber", A, ["direct_sowing"]],
  ["sweet-potato", "البطاطا الحلوة", ["البطاطس الحلوة", "البطاطا الحلوه"], "Ipomoea batatas", "root_tuber", A, ["cuttings"]],
  ["taro", "القلقاس", ["القلقاس البلدي"], "Colocasia esculenta", "root_tuber", A, ["tubers"]],

  // بقوليات
  ["green-beans", "الفاصولياء", ["الفاصوليا", "الفاصوليا الخضراء"], "Phaseolus vulgaris", "legume", A, ["direct_sowing"]],
  ["cowpea", "اللوبيا", ["اللوبياء", "اللوبيا البلدية"], "Vigna unguiculata", "legume", A, ["direct_sowing"]],
  ["broad-bean", "الفول", ["الفول الأخضر", "الفول البلدي"], "Vicia faba", "legume", A, ["direct_sowing"]],
  ["pea", "البازيلاء", ["البازلاء", "البسلة", "البازيلا"], "Pisum sativum", "legume", A, ["direct_sowing"]],
  ["chickpea", "الحمص", ["الحمّص", "الحاملة", "الملانة", "الحمص الأخضر"], "Cicer arietinum", "legume", A, ["direct_sowing"]],
  ["lentil", "العدس", ["العدس البلدي", "العدس الأحمر", "العدس الأسود"], "Lens culinaris", "legume", A, ["direct_sowing"]],
  ["lupin", "الترمس", ["الترمس البلدي", "الترمس الأبيض"], "Lupinus albus", "legume", A, ["direct_sowing"]],
  ["grass-pea", "الجلبان", ["الجلبان البلدي"], "Lathyrus sativus", "legume", A, ["direct_sowing"]],
  ["peanut", "الفول السوداني", ["الفستق السوداني", "فستق العبيد", "الفستق"], "Arachis hypogaea", "legume", A, ["direct_sowing"]],

  // حبوب
  ["wheat", "القمح", ["الحنطة", "القمح البلدي", "القمح القاسي", "الفريكة"], "Triticum spp.", "cereal", A, ["direct_sowing"]],
  ["barley", "الشعير", ["الشعير البلدي"], "Hordeum vulgare", "cereal", A, ["direct_sowing"]],
  ["sorghum", "الذرة البيضاء", ["الذرة الرفيعة", "السورغم"], "Sorghum bicolor", "cereal", A, ["direct_sowing"]],
  ["oats", "الشوفان", ["الشوفان البلدي"], "Avena sativa", "cereal", A, ["direct_sowing"]],

  // أعلاف
  ["alfalfa", "البرسيم الحجازي", ["الفصة", "الفصفصة", "الجت", "البرسيم"], "Medicago sativa", "forage", P, ["direct_sowing"]],
  ["berseem", "البرسيم المصري", ["البرسيم", "البرسيم البلدي"], "Trifolium alexandrinum", "forage", A, ["direct_sowing"]],
  ["vetch", "البيقيا", ["البيقة", "البيقيا العلفية"], "Vicia sativa", "forage", A, ["direct_sowing"]],
  ["bitter-vetch", "الكرسنة", ["الكرسنّة", "الكرسنه", "البيقيا المرة"], "Vicia ervilia", "forage", A, ["direct_sowing"]],

  // محاصيل حقلية
  ["sesame", "السمسم", ["السمسم البلدي", "الجلجلان"], "Sesamum indicum", "field_crop", A, ["direct_sowing"]],
  ["sunflower", "دوار الشمس", ["عباد الشمس", "زهرة الشمس"], "Helianthus annuus", "field_crop", A, ["direct_sowing"]],
  ["tobacco", "التبغ", ["الدخان", "التتن"], "Nicotiana tabacum", "field_crop", A, ["nursery_sowing", "transplanting"]],

  // أعشاب عطرية وطبية
  ["parsley", "البقدونس", ["المقدونس", "البقدونس البلدي"], "Petroselinum crispum", "herb", A, ["direct_sowing", "transplanting"]],
  ["coriander", "الكزبرة", ["الكسبرة", "الكزبرة الخضراء", "الكزبرة البلدية"], "Coriandrum sativum", "herb", A, ["direct_sowing"]],
  ["dill", "الشبت", ["الشبث", "الشبت الأخضر"], "Anethum graveolens", "herb", A, ["direct_sowing"]],
  ["fennel", "الشومر", ["الشمرة", "الشمر", "البسباس", "الشمار"], "Foeniculum vulgare", "herb", P, ["direct_sowing", "transplanting"]],
  ["sage", "الميرمية", ["الميرامية", "المرمية", "القصعين"], "Salvia fruticosa", "herb", P, ["transplanting", "cuttings"]],
  ["rosemary", "إكليل الجبل", ["الحصا لبان", "حصالبان", "الروزماري", "الإكليل"], "Salvia rosmarinus", "herb", P, ["transplanting", "cuttings"]],
  ["basil", "الريحان", ["الحبق", "الريحان البلدي"], "Ocimum basilicum", "herb", A, ["nursery_sowing", "transplanting", "direct_sowing"]],
  ["chamomile", "البابونج", ["البابونج البلدي"], "Matricaria chamomilla", "herb", A, ["direct_sowing"]],
  ["lemon-verbena", "اللويزة", ["الليمونية"], "Aloysia citrodora", "herb", P, ["transplanting", "cuttings"]],
  ["cumin", "الكمون", ["الكمون البلدي"], "Cuminum cyminum", "herb", A, ["direct_sowing"]],
  ["anise", "اليانسون", ["الينسون", "اليانسون البلدي"], "Pimpinella anisum", "herb", A, ["direct_sowing"]],
  ["black-seed", "حبة البركة", ["القزحة", "الحبة السوداء", "الكمون الأسود"], "Nigella sativa", "herb", A, ["direct_sowing"]],
  ["marjoram", "البردقوش", ["المردقوش", "المردكوش"], "Origanum majorana", "herb", P, ["transplanting", "cuttings"]],
  ["lavender", "الخزامى", ["اللافندر", "الخزامة"], "Lavandula spp.", "herb", P, ["transplanting", "cuttings"]],
  ["fenugreek", "الحلبة", ["الحلبة الخضراء", "الحلبة البلدية"], "Trigonella foenum-graecum", "herb", A, ["direct_sowing"]],

  // أشجار وفواكه
  ["fig", "التين", ["التين البلدي", "شجرة التين"], "Ficus carica", "tree", P, ["saplings", "cuttings"]],
  ["pomegranate", "الرمان", ["الرمان البلدي"], "Punica granatum", "tree", P, ["saplings", "cuttings"]],
  ["almond", "اللوز", ["اللوز الأخضر", "اللوز البلدي"], "Prunus dulcis", "tree", P, ["saplings"]],
  ["apricot", "المشمش", ["المشمش البلدي", "المستكاوي"], "Prunus armeniaca", "tree", P, ["saplings"]],
  ["plum", "البرقوق", ["الخوخ", "العنجاص", "الخوخ الأحمر"], "Prunus domestica", "tree", P, ["saplings"]],
  ["peach", "الدراق", ["الدرّاق", "الخوخ", "النكتارين"], "Prunus persica", "tree", P, ["saplings"]],
  ["apple", "التفاح", ["التفاح البلدي"], "Malus domestica", "tree", P, ["saplings"]],
  ["pear", "الإجاص", ["الإنجاص", "الكمثرى", "الأجاص"], "Pyrus communis", "tree", P, ["saplings"]],
  ["cherry", "الكرز", ["الكرز الحلو", "القراصيا"], "Prunus avium", "tree", P, ["saplings"]],
  ["quince", "السفرجل", ["السفرجل البلدي"], "Cydonia oblonga", "tree", P, ["saplings", "cuttings"]],
  ["loquat", "الأكي دنيا", ["البشملة", "الأسكدنيا", "الإكيدنيا", "المشمش الياباني"], "Eriobotrya japonica", "tree", P, ["saplings"]],
  ["lemon", "الليمون", ["الحامض", "الليمون الحامض", "الليمون البلدي"], "Citrus limon", "tree", P, ["saplings"]],
  ["orange", "البرتقال", ["البرتقال الشموطي", "البرتقال أبو صرة", "الفالنسيا"], "Citrus sinensis", "tree", P, ["saplings"]],
  ["mandarin", "اليوسفي", ["المندلينا", "الكلمنتينا", "اليوسف أفندي", "المندرين"], "Citrus reticulata", "tree", P, ["saplings"]],
  ["grapefruit", "الجريب فروت", ["الكريب فروت"], "Citrus × paradisi", "tree", P, ["saplings"]],
  ["date-palm", "النخيل", ["التمر", "النخلة", "البلح", "المجهول"], "Phoenix dactylifera", "tree", P, ["offshoots", "saplings"]],
  ["banana", "الموز", ["الموز البلدي"], "Musa spp.", "fruit", P, ["offshoots"]],
  ["guava", "الجوافة", ["الجوافا", "الغوافة"], "Psidium guajava", "tree", P, ["saplings"]],
  ["avocado", "الأفوكادو", ["الأفوكادو البلدي"], "Persea americana", "tree", P, ["saplings"]],
  ["mango", "المانجا", ["المانجو", "المنجا", "المنقا"], "Mangifera indica", "tree", P, ["saplings"]],
  ["mulberry", "التوت", ["التوت الشامي", "التوت الأبيض", "التوت البلدي"], "Morus spp.", "tree", P, ["saplings", "cuttings"]],
  ["carob", "الخروب", ["الخرنوب", "شجرة الخروب"], "Ceratonia siliqua", "tree", P, ["saplings"]],
  ["sidr", "السدر", ["النبق"], "Ziziphus spina-christi", "tree", P, ["saplings"]],
  ["pistachio", "الفستق الحلبي", ["الفستق", "الفستق الأخضر"], "Pistacia vera", "tree", P, ["saplings"]],
  ["walnut", "الجوز", ["عين الجمل", "الجوز البلدي"], "Juglans regia", "tree", P, ["saplings"]],
  ["prickly-pear", "الصبر", ["التين الشوكي", "الصبّر", "الصبار", "البرشومي"], "Opuntia ficus-indica", "fruit", P, ["cuttings"]],
  ["persimmon", "الكاكا", ["الكاكي", "الخرما"], "Diospyros kaki", "tree", P, ["saplings"]],
  ["hawthorn", "الزعرور", ["الزعرور البلدي", "الزعرور الأحمر"], "Crataegus azarolus", "tree", P, ["saplings"]],
  ["sumac", "السماق", ["السمّاق", "السماق البلدي"], "Rhus coriaria", "tree", P, ["saplings", "cuttings"]],
  // أزهار ونباتات زينة
  ["narcissus", "النرجس", ["نرجس", "زهرة النرجس", "العبهر"], "Narcissus spp.", "ornamental", P, ["bulbs"]],
  ["rose", "الورد", ["الورد البلدي", "الورد الجوري", "الجوري", "الوردة"], "Rosa spp.", "ornamental", P, ["saplings", "cuttings"]],
  ["caper", "القبار", ["الكبار", "الشفلح", "القبّار"], "Capparis spinosa", "herb", P, ["cuttings", "direct_sowing"]],
];

const NOTE =
  "أضفنا الاسم والتصنيف وطرق الإكثار الشائعة فقط. لم نوثّق بعد مواعيد زراعته في مناطق فلسطين من مصدر موثوق، لذلك لا نعرض له موعدًا ولا خطة. راجع الإرشاد الزراعي في منطقتك.";

export const CATALOGUE_CROPS: Crop[] = ENTRIES.map(([slug, name, otherNames, scientificName, category, lifeCycle, propagation]) => {
  const documented = DOCUMENTED_CROPS[slug];
  return {
    id: `seed-${slug}`,
    slug,
    name,
    otherNames,
    scientificName,
    category,
    lifeCycle,
    difficulty: null,
    sun: null,
    water: null,
    propagation,
    frostSensitive: false,
    spaceTypes: [],
    growthDaysMin: null,
    growthDaysMax: null,
    summary: documented?.summary ?? `${name}: لم تُضف بعد معلومات زراعية موثّقة لهذا المحصول.`,
    wateringSummary: "",
    imageAlt: `رسم توضيحي: ${name}`,
    dataStatus: documented ? "preliminary" : "incomplete",
    sourceNote: documented?.sourceNote ?? NOTE,
    windows: documented?.windows ?? [],
    templates: [],
    guide: [],
  };
});
