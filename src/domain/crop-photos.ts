/**
 * Real crop photographs: types and the pure rules used both by the download
 * script (scripts/crop-photos.ts) and by the UI.
 *
 * Photos are keyed by the crop's stable slug (never its Arabic name), come
 * only from Wikimedia Commons under a licence that allows re-hosting with
 * attribution, and always carry their author, licence and source link.
 */
import type { Crop, CropCategory } from "./types";

/** What the photo shows — the part a farmer recognises. */
export const PHOTO_SUBJECTS = ["fruit", "fruit_on_tree", "flower", "ear", "plant", "pods", "roots", "leaves", "bulbs"] as const;
export type PhotoSubject = (typeof PHOTO_SUBJECTS)[number];

export interface CropPhotoCredit {
  /** Commons file title, e.g. "File:Aubergine.jpg". */
  title: string;
  /** Commons file page. */
  pageUrl: string;
  /** Author as shown on Commons (plain text). */
  author: string;
  /** Licence short name, e.g. "CC BY-SA 4.0", "CC0", "Public domain". */
  license: string;
  licenseUrl: string | null;
  source: "Wikimedia Commons";
}

export interface CropPhoto {
  /** Responsive WebP files under /public (paths without the base path). */
  srcSet: { src: string; width: number }[];
  /** Intrinsic size of the largest file (prevents layout shift). */
  width: number;
  height: number;
  /** Arabic description of what the photo shows. */
  alt: string;
  subject: PhotoSubject;
  credit: CropPhotoCredit;
}

/**
 * Licences that allow re-hosting a resized copy with attribution. Anything
 * else (NC, ND, GFDL-only, fair use, unknown) is rejected.
 */
export function isAllowedLicense(shortName: string): boolean {
  const s = shortName.trim();
  if (/^(CC0|CC0 1\.0|Public domain|PD|No restrictions)$/i.test(s)) return true;
  // CC BY / CC BY-SA, any version 1.0–4.0, optionally ported ("CC BY-SA 3.0 de").
  return /^CC BY(-SA)? [1-4]\.0( [a-z]{2,3})?$/i.test(s);
}

/** True for licences that need no attribution (we still credit the author when known). */
export function isPublicDomain(shortName: string): boolean {
  return /^(CC0|CC0 1\.0|Public domain|PD|No restrictions)$/i.test(shortName.trim());
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Commons metadata is HTML: keep the visible text only. */
export function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The Arabic name without the article, for alt texts: «التين» → «التين» (kept), used as is. */
function subjectPhrase(subject: PhotoSubject, name: string): string {
  switch (subject) {
    case "fruit":
      return `ثمار ${name} على النبات`;
    case "fruit_on_tree":
      return `ثمار ${name} على الشجرة`;
    case "flower":
      return `أزهار ${name}`;
    case "ear":
      return `سنابل ${name} في الحقل`;
    case "pods":
      return `قرون ${name} على النبات`;
    case "roots":
      return `جذور ${name} بعد القلع`;
    case "leaves":
      return `أوراق ${name}`;
    case "bulbs":
      return `أبصال ${name} وأزهاره`;
    default:
      return `نبات ${name}`;
  }
}

/** Arabic alt text, e.g. «صورة حقيقية: ثمار التين على الشجرة». */
export function photoAlt(crop: Pick<Crop, "name">, subject: PhotoSubject): string {
  return `صورة حقيقية: ${subjectPhrase(subject, crop.name)}`;
}

/** The subject a farmer recognises best, by category (can be overridden per crop). */
export function defaultSubject(category: CropCategory): PhotoSubject {
  switch (category) {
    case "tree":
    case "fruit":
      return "fruit_on_tree";
    case "fruiting_vegetable":
      return "fruit";
    case "ornamental":
      return "flower";
    case "cereal":
      return "ear";
    case "legume":
      return "pods";
    case "root_tuber":
      return "roots";
    case "bulb":
      return "bulbs";
    case "leafy_vegetable":
      return "leaves";
    default:
      return "plant";
  }
}

/** Short Arabic credit line, e.g. «الصورة: فلان، CC BY-SA 4.0، ويكيميديا كومنز». */
export function creditLine(credit: CropPhotoCredit): string {
  const author = credit.author || "مؤلف غير مذكور";
  return `الصورة: ${author}، ${credit.license}، ويكيميديا كومنز`;
}
