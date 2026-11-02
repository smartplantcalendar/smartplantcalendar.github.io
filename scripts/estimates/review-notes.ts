/**
 * Agronomic review notes written by hand while checking an imported dataset:
 * observations the automatic rules cannot decide. They never change an
 * imported value; they are shown to the farmer on the crop page (so that data
 * that looks contradictory comes with its explanation) and listed in the
 * import report.
 */
export interface ReviewNote {
  slugs: string[];
  note: string;
}

const CITRUS = ["lemon", "orange", "mandarin", "grapefruit"];

export const REVIEW_NOTES: Record<string, ReviewNote[]> = {
  "smartplant-88-ps": [
    {
      slugs: ["carob"],
      note: "يزهر الخروب في أواخر الصيف والخريف، وتحتاج قرونه قرابة سنة لتنضج؛ لذلك يتزامن قطف قرون السنة الماضية مع الإزهار الجديد. تشابه موسمي الإزهار والقطف هنا ليس خطأ.",
    },
    {
      slugs: ["banana"],
      note: "الموز يزهر قبل تكوّن السباطة، لكن موعد إزهاره غير مسجّل في هذا التقدير، فتركناه «غير معروف» بدل «لا ينطبق».",
    },
    {
      slugs: ["sweet-potato"],
      note: "البطاطا الحلوة قلّما تزهر في الحقل، ومحصول الدرنات لا يعتمد على الإزهار؛ موعد الإزهار المذكور تقريبي ولا يلزم انتظاره.",
    },
    {
      slugs: ["akkoub"],
      note: "العكوب نبات بري معمّر يحتاج عادة أكثر من موسم من البذر حتى يصلح للقطف؛ موسم القطف (آذار–أيار) يخص النباتات القائمة، لا البذور المزروعة في الموسم نفسه. لذلك المدة حتى أول قطف «غير معروفة».",
    },
    {
      slugs: ["lemon"],
      note: "الليمون يحمل ثمارًا في معظم أشهر السنة، لذلك يغطي موسم القطف السنة كلها تقريبًا.",
    },
    {
      slugs: CITRUS,
      note: "موعد الغرس التقديري في السهول الداخلية (تشرين الأول–تشرين الثاني) يختلف كثيرًا عن الساحل (شباط–نيسان) مع أن المنطقتين متجاورتان؛ تحقق من الإرشاد المحلي قبل الغرس.",
    },
    {
      slugs: ["date-palm"],
      note: "زراعة الفسائل التقديرية في الأغوار في أيلول–تشرين الأول، وفي الساحل والسهول في الربيع؛ تحقق من الموعد محليًا.",
    },
    {
      slugs: ["watermelon", "melon"],
      note: "العروة الإضافية في الساحل (بذر في آب) عالية المخاطرة حسب ملف التقديرات؛ نعرضها كخيار فقط ولا ندخلها في «ماذا أزرع الآن؟».",
    },
  ],
};

/** The review notes of one crop in a dataset. */
export function reviewNotesFor(dataset: string, slug: string): string[] {
  return (REVIEW_NOTES[dataset] ?? []).filter((n) => n.slugs.includes(slug)).map((n) => n.note);
}
