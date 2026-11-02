/**
 * Real crop photos from Wikimedia Commons.
 *
 *   npm run photos:candidates -- [--slugs fig,olive] [--preview-dir DIR]
 *     Searches Commons by SCIENTIFIC name for crops without a selected photo,
 *     keeps only files with an allowed licence, writes
 *     data/crop-photos/candidates.json and (optionally) small previews so a
 *     person can check each photo shows the right plant.
 *
 *   npm run photos:fetch
 *     For every file chosen in data/crop-photos/selection.json, re-checks the
 *     licence and author on Commons, downloads it once, writes WebP files
 *     (320/640/960 px, metadata stripped) to public/images/crops/, and
 *     regenerates src/data/crop-photos.ts and data/crop-photos/REPORT.md.
 *
 * selection.json: { "<slug>": { "file": "File:….jpg", "subject"?: "fruit_on_tree" } }
 *   or, for iNaturalist open data (scripts/crop-photos/inat-candidates.sh):
 *   { "<slug>": { "inaturalist": { photoId, extension, license, author, observationUuid, width, height } } }
 * Crops without a selection keep their drawing — never a doubtful photo.
 */
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SEED_CROPS } from "../src/data/crops";
import { defaultSubject, photoAlt, PHOTO_SUBJECTS, type CropPhoto, type PhotoSubject } from "../src/domain/crop-photos";
import { COMMONS_API, OUTPUT_WIDTHS, USER_AGENT, imageInfoParams, judgeCommonsFile, judgeInatPhoto, outputName, searchQuery, type CommonsPage, type InatPhoto, type Verdict } from "./crop-photos/core";

const run = promisify(execFile);
const root = process.cwd();
const SELECTION = join(root, "data/crop-photos/selection.json");
const OUT_DIR = join(root, "public/images/crops");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** curl honours the environment's proxy and CA bundle; one request per second. */
async function get(url: string): Promise<Buffer> {
  const { stdout } = await run("curl", ["-sSfL", "--max-time", "60", "-A", USER_AGENT, url], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  await sleep(1000);
  return stdout;
}

async function api(params: URLSearchParams): Promise<CommonsPage[]> {
  const body = JSON.parse((await get(`${COMMONS_API}?${params}`)).toString("utf8"));
  return (body.query?.pages ?? []) as CommonsPage[];
}

/** A Commons file title, or an iNaturalist open-data photo (recorded with its licence and author). */
interface Selection {
  file?: string;
  inaturalist?: InatPhoto;
  subject?: PhotoSubject;
}

function readSelection(): Record<string, Selection> {
  const raw = JSON.parse(readFileSync(SELECTION, "utf8")) as Record<string, Selection>;
  for (const [slug, s] of Object.entries(raw)) {
    if (!SEED_CROPS.some((c) => c.slug === slug)) throw new Error(`selection.json: unknown crop ${slug}`);
    if (Boolean(s.file) === Boolean(s.inaturalist)) throw new Error(`selection.json: ${slug}: give either "file" (Commons) or "inaturalist"`);
    if (s.file && !/^File:.+\.(jpe?g|png|webp)$/i.test(s.file)) throw new Error(`selection.json: ${slug}: not a Commons bitmap file title`);
    if (s.subject && !PHOTO_SUBJECTS.includes(s.subject)) throw new Error(`selection.json: ${slug}: unknown subject ${s.subject}`);
  }
  return raw;
}

async function candidates() {
  const selection = readSelection();
  const only = arg("slugs")?.split(",");
  const previewDir = arg("preview-dir");
  if (previewDir) mkdirSync(previewDir, { recursive: true });
  const out: Record<string, { query: string; files: { title: string; license: string; author: string; preview?: string }[]; rejected: number }> = {};
  for (const crop of SEED_CROPS) {
    if (only ? !only.includes(crop.slug) : selection[crop.slug]) continue;
    if (!crop.scientificName) continue;
    const query = searchQuery(crop.scientificName, defaultSubject(crop.category));
    const pages = await api(imageInfoParams({ generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: "12", iiurlwidth: "320" }));
    const files: (typeof out)[string]["files"] = [];
    let rejected = 0;
    for (const page of pages) {
      const v = judgeCommonsFile(page);
      if (!v.ok) {
        rejected++;
        continue;
      }
      let preview: string | undefined;
      if (previewDir && files.length < 6) {
        preview = join(previewDir, `${crop.slug}-${files.length + 1}.jpg`);
        writeFileSync(preview, await get(v.downloadUrl));
      }
      files.push({ title: page.title, license: v.credit.license, author: v.credit.author, preview });
    }
    out[crop.slug] = { query, files, rejected };
    console.log(`${crop.slug}: ${files.length} مرشحة، ${rejected} مرفوضة`);
  }
  writeFileSync(join(root, "data/crop-photos/candidates.json"), JSON.stringify(out, null, 2) + "\n");
}

async function fetchSelected() {
  const { default: sharp } = await import("sharp");
  const selection = readSelection();
  mkdirSync(OUT_DIR, { recursive: true });
  const photos: Record<string, CropPhoto> = {};
  const problems: string[] = [];
  for (const crop of SEED_CROPS) {
    const sel = selection[crop.slug];
    if (!sel) continue;
    let v: Verdict;
    if (sel.inaturalist) v = judgeInatPhoto(sel.inaturalist);
    else {
      const [page] = await api(imageInfoParams({ titles: sel.file!, iiurlwidth: "1280" }));
      v = judgeCommonsFile(page ?? { title: sel.file!, missing: true });
    }
    if (!v.ok) {
      problems.push(`${crop.slug} (${sel.file ?? `iNaturalist ${sel.inaturalist?.photoId}`}): ${v.reason}`);
      continue;
    }
    const original = await get(v.downloadUrl);
    const srcSet: CropPhoto["srcSet"] = [];
    let size = { width: 0, height: 0 };
    for (const width of OUTPUT_WIDTHS) {
      const name = outputName(crop.slug, width);
      // sharp drops EXIF/GPS metadata unless asked to keep it.
      const info = await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 70, effort: 5 }).toFile(join(OUT_DIR, name));
      if (srcSet.some((s) => s.width === info.width)) {
        unlinkSync(join(OUT_DIR, name));
        continue;
      }
      srcSet.push({ src: `/images/crops/${name}`, width: info.width });
      size = { width: info.width, height: info.height };
    }
    const subject = sel.subject ?? defaultSubject(crop.category);
    photos[crop.slug] = { srcSet, width: size.width, height: size.height, alt: photoAlt(crop, subject), subject, credit: v.credit };
    console.log(`${crop.slug}: ${v.credit.license} — ${v.credit.author}`);
  }
  // Remove files of crops that no longer have a photo.
  const keep = new Set(Object.values(photos).flatMap((p) => p.srcSet.map((s) => s.src.split("/").pop())));
  for (const f of readdirSync(OUT_DIR)) if (f.endsWith(".webp") && !keep.has(f)) unlinkSync(join(OUT_DIR, f));

  writeFileSync(
    join(root, "src/data/crop-photos.ts"),
    [
      "// Generated by scripts/crop-photos.ts (npm run photos:fetch) — do not edit by hand.",
      "// Real photos from Wikimedia Commons, keyed by the crop's stable slug.",
      'import type { CropPhoto } from "@/domain/crop-photos";',
      "",
      "export const CROP_PHOTOS: Record<string, CropPhoto> = {",
      ...Object.entries(photos).map(([slug, p]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(p)},`),
      "};",
      "",
    ].join("\n"),
  );
  writeReport(photos, problems);
  if (problems.length) {
    console.error(`تعذّر استخدام ${problems.length} صورة:\n${problems.join("\n")}`);
    process.exitCode = 1;
  }
}

function writeReport(photos: Record<string, CropPhoto>, problems: string[]) {
  const withPhoto = SEED_CROPS.filter((c) => photos[c.slug]);
  const without = SEED_CROPS.filter((c) => !photos[c.slug]);
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const lines = [
    "# تقرير صور المحاصيل",
    "",
    "> مولَّد آليًا بواسطة `npm run photos:fetch`. لا تعدّله يدويًا.",
    "",
    `- محاصيل بصورة حقيقية: **${withPhoto.length}** من ${SEED_CROPS.length}`,
    `- محاصيل بقيت بالرسم التوضيحي: **${without.length}**`,
    "",
    "## الصور المستخدمة",
    "",
    "| المحصول | الاسم العلمي | ما تُظهره | المؤلف | الترخيص | المصدر |",
    "| --- | --- | --- | --- | --- | --- |",
    ...withPhoto.map((c) => {
      const p = photos[c.slug];
      const license = p.credit.licenseUrl ? `[${p.credit.license}](${p.credit.licenseUrl})` : p.credit.license;
      return `| ${c.name} (\`${c.slug}\`) | ${c.scientificName ?? "—"} | ${p.alt} | ${esc(p.credit.author || "—")} | ${license} | [${p.credit.source}: ${esc(p.credit.title)}](${p.credit.pageUrl}) |`;
    }),
    "",
    "## محاصيل بقيت بالرسم التوضيحي",
    "",
    ...(without.length ? without.map((c) => `- ${c.name} (\`${c.slug}\`، ${c.scientificName ?? "—"})`) : ["لا يوجد."]),
    "",
    ...(problems.length ? ["## صور مختارة رُفضت عند التحقق", "", ...problems.map((p) => `- ${p}`), ""] : []),
  ];
  writeFileSync(join(root, "data/crop-photos/REPORT.md"), lines.join("\n"));
}

async function main() {
  const command = process.argv[2];
  if (command === "candidates") await candidates();
  else if (command === "fetch") await fetchSelected();
  else if (command === "report") writeReport((await import("../src/data/crop-photos")).CROP_PHOTOS, []);
  else {
    console.error("Usage: tsx scripts/crop-photos.ts candidates|fetch|report");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
