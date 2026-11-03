/**
 * Pure helpers for scripts/crop-photos.ts (unit-tested, no network).
 * Reads Wikimedia Commons API responses and decides, file by file, whether a
 * photo may be used: bitmap, large enough, and under an allowed licence with
 * a named author.
 */
import { INAT_LICENSES, isAllowedLicense, isPublicDomain, plainText, type CropPhotoCredit, type PhotoSubject } from "../../src/domain/crop-photos";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Descriptive client id required by Wikimedia's API etiquette (no personal data). */
export const USER_AGENT = "SmartPlantCalendarImageImport/1.0 (https://github.com/smartplantcalendar/smartplantcalendar.github.io)";
export const MIN_WIDTH = 800;
export const OUTPUT_WIDTHS = [320, 640, 960] as const;

/** One file of a Commons `prop=imageinfo` response (formatversion=2). */
export interface CommonsPage {
  title: string;
  missing?: boolean;
  imageinfo?: {
    url: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
}

export type Verdict =
  | { ok: true; credit: CropPhotoCredit; width: number; height: number; downloadUrl: string }
  | { ok: false; reason: string };

const BITMAPS = ["image/jpeg", "image/png", "image/webp"];

/** Decides whether a Commons file can be re-hosted, and builds its credit. */
export function judgeCommonsFile(page: CommonsPage): Verdict {
  if (page.missing) return { ok: false, reason: "الملف غير موجود في ويكيميديا كومنز" };
  const info = page.imageinfo?.[0];
  if (!info) return { ok: false, reason: "لا توجد بيانات للصورة" };
  if (!BITMAPS.includes(info.mime)) return { ok: false, reason: `نوع ملف غير مناسب (${info.mime})` };
  if (info.width < MIN_WIDTH) return { ok: false, reason: `الصورة صغيرة (${info.width} بكسل)` };
  const meta = info.extmetadata ?? {};
  const license = plainText(meta.LicenseShortName?.value);
  if (!license || !isAllowedLicense(license)) return { ok: false, reason: `ترخيص غير مسموح: «${license || "غير مذكور"}»` };
  const author = plainText(meta.Artist?.value);
  if (!author && !isPublicDomain(license)) return { ok: false, reason: "الترخيص يشترط النسب لكن المؤلف غير مذكور" };
  if (plainText(meta.Restrictions?.value)) return { ok: false, reason: `قيود إضافية على الاستخدام: «${plainText(meta.Restrictions?.value)}»` };
  return {
    ok: true,
    width: info.width,
    height: info.height,
    downloadUrl: info.thumburl ?? info.url,
    credit: {
      title: page.title,
      pageUrl: info.descriptionurl,
      author: author.slice(0, 160),
      license,
      licenseUrl: plainText(meta.LicenseUrl?.value) || null,
      source: "Wikimedia Commons",
    },
  };
}

const SEARCH_WORDS: Record<PhotoSubject, string> = {
  fruit: "fruit",
  fruit_on_tree: "fruit tree",
  flower: "flower",
  ear: "ear field",
  plant: "plant",
  pods: "pods",
  roots: "root",
  leaves: "leaves",
  bulbs: "flower",
};

/** Commons search for candidates, by SCIENTIFIC name (Arabic names are ambiguous). */
export function searchQuery(scientificName: string, subject: PhotoSubject): string {
  // Genus-only names ("Musa spp.") search the genus.
  const name = scientificName.replace(/\s+spp?\.$/, "").replace(/×\s*/g, "");
  return `"${name}" ${SEARCH_WORDS[subject]} filetype:bitmap`;
}

export function imageInfoParams(extra: Record<string, string>): URLSearchParams {
  return new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Restrictions",
    ...extra,
  });
}

/** iNaturalist open data (https://github.com/inaturalist/inaturalist-open-data): one photo row. */
export interface InatPhoto {
  photoId: number;
  extension: string;
  /** Licence code as in photos.csv: CC0, CC-BY, CC-BY-SA (NC/ND rejected). */
  license: string;
  /** Observer's name (or login when no name), from observers.csv. */
  author: string;
  observationUuid: string;
  width: number;
  height: number;
}

export const INAT_BUCKET = "https://inaturalist-open-data.s3.amazonaws.com";

/** Decides whether an iNaturalist open-data photo can be re-hosted, and builds its credit. */
export function judgeInatPhoto(p: InatPhoto): Verdict {
  const license = INAT_LICENSES[p.license];
  if (!license) return { ok: false, reason: `ترخيص غير مسموح: «${p.license}»` };
  if (!/^(jpe?g|png)$/i.test(p.extension)) return { ok: false, reason: `نوع ملف غير مناسب (${p.extension})` };
  if (Math.max(p.width, p.height) < MIN_WIDTH) return { ok: false, reason: `الصورة صغيرة (${p.width}×${p.height})` };
  const author = p.author.trim();
  if (!author && !isPublicDomain(license)) return { ok: false, reason: "الترخيص يشترط النسب لكن المصوّر غير مذكور" };
  return {
    ok: true,
    width: p.width,
    height: p.height,
    // "large" is at most 1024 px on the long side: enough for our 960 px file.
    // The bucket keys keep the uploaded extension's case ("JPG" ≠ "jpg").
    downloadUrl: `${INAT_BUCKET}/photos/${p.photoId}/large.${p.extension}`,
    credit: {
      title: `inaturalist-photo-${p.photoId}`,
      pageUrl: `https://www.inaturalist.org/photos/${p.photoId}`,
      author: author.slice(0, 160),
      license,
      // The photo page shows the exact licence version.
      licenseUrl: null,
      source: "iNaturalist",
    },
  };
}

/** Output file names: stable slug + width, e.g. "fig-640.webp". */
export function outputName(slug: string, width: number): string {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new Error(`invalid slug ${slug}`);
  return `${slug}-${width}.webp`;
}
