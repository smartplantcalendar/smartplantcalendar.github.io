import type { Crop } from "./types";

/**
 * Forgiving Arabic crop search shared by the home page, the crop guide and
 * the planner. It tolerates:
 *  - diacritics, tatweel, alef/hamza forms, taa marbuta, alef maqsura;
 *  - the definite article on any word ("البندورة" = "بندورة");
 *  - small typos (one wrong/missing/extra/swapped letter, two for long words);
 *  - dialect names, through each crop's `otherNames` (بطيخ/جبس، بندورة/طماطم).
 */

const DIACRITICS = /[ً-ٰٟـۖ-ۭ]/g;

export function normalizeArabic(input: string): string {
  return input
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/گ/g, "ك")
    .replace(/[ڤ]/g, "ف")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(^|\s)(?:وال|بال|فال|كال|لل)(?=\S{2,})/g, "$1")
    .replace(/(^|\s)ال(?=\S{2,})/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau–Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a query word of this length. */
function allowedTypos(len: number): number {
  if (len < 4) return 0;
  if (len < 7) return 1;
  return 2;
}

export interface SearchableCrop {
  slug: string;
  name: string;
  otherNames?: string[];
  scientificName?: string;
}

interface IndexedName {
  text: string;
  words: string[];
  primary: boolean;
}

export interface CropSearchIndex<T extends SearchableCrop> {
  items: { crop: T; names: IndexedName[]; latin: string }[];
}

export function buildCropIndex<T extends SearchableCrop>(crops: T[]): CropSearchIndex<T> {
  return {
    items: crops.map((crop) => ({
      crop,
      names: [crop.name, ...(crop.otherNames ?? [])].map((n, i) => {
        const text = normalizeArabic(n);
        return { text, words: text.split(" ").filter(Boolean), primary: i === 0 };
      }),
      latin: (crop.scientificName ?? "").toLowerCase(),
    })),
  };
}

/** Lower is better; null = no match. */
function scoreName(q: string, qWords: string[], name: IndexedName): number | null {
  const bonus = name.primary ? 0 : 1;
  if (name.text === q) return 0 + bonus;
  if (name.text.startsWith(q)) return 2 + bonus;
  if (name.words.some((w) => w.startsWith(q))) return 4 + bonus;
  if (name.text.includes(q)) return 6 + bonus;
  // Every query word must match some word of the name (prefix or small typo).
  let typos = 0;
  for (const qw of qWords) {
    let best = Infinity;
    for (const w of name.words) {
      if (w.startsWith(qw)) {
        best = 0;
        break;
      }
      const max = allowedTypos(qw.length);
      if (max === 0) continue;
      const d = editDistance(qw, w, max);
      if (d <= max && d < best) best = d;
    }
    if (best === Infinity) return null;
    typos += best;
  }
  return 8 + typos * 2 + bonus;
}

export function searchCropIndex<T extends SearchableCrop>(index: CropSearchIndex<T>, query: string, limit = Infinity): T[] {
  const q = normalizeArabic(query);
  if (!q) return index.items.slice(0, limit).map((i) => i.crop);
  const qWords = q.split(" ");
  const latinQ = query.trim().toLowerCase();
  const scored: { crop: T; score: number; name: string }[] = [];
  for (const item of index.items) {
    let best: number | null = null;
    for (const n of item.names) {
      const s = scoreName(q, qWords, n);
      if (s != null && (best == null || s < best)) best = s;
    }
    if (best == null && latinQ.length >= 3 && item.latin.includes(latinQ)) best = 20;
    if (best != null) scored.push({ crop: item.crop, score: best, name: item.names[0].text });
  }
  scored.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name, "ar"));
  return scored.slice(0, limit).map((s) => s.crop);
}

/** One-off search (builds the index each time; keep an index for repeated queries). */
export function searchCrops<T extends SearchableCrop>(crops: T[], query: string, limit = Infinity): T[] {
  return searchCropIndex(buildCropIndex(crops), query, limit);
}

/**
 * Crops with at least one planting window can be planned (crops without
 * their own task rules get general tasks from the plan generator).
 */
export function isPlannable(crop: Pick<Crop, "windows" | "dataStatus">): boolean {
  return crop.dataStatus !== "incomplete" && crop.windows.some((w) => !w.optional);
}

/**
 * The crop without its long texts (guide, task rules, notes): enough for
 * lists, search, statuses and recommendations. Keeps page payloads small now
 * that the catalogue has 100+ crops.
 */
export function listCrop(crop: Crop): Crop {
  return {
    ...crop,
    summary: "",
    wateringSummary: "",
    sourceNote: "",
    growthNote: undefined,
    templates: [],
    guide: [],
    // Flowering/harvest seasons are only shown on the crop page.
    phases: [],
    estimate: crop.estimate ? { ...crop.estimate, note: "", contextUrls: [] } : crop.estimate,
  };
}
