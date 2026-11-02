#!/usr/bin/env node
/**
 * Review helper for iNaturalist candidates (see docs/CROP_PHOTOS.md):
 *   node scripts/crop-photos/inat-sheets.mjs <photos.tsv> <observers.csv.gz> <out-dir> [per-crop=8] [--only a,b] [--skip previous/candidates.json]
 * --only limits the crops; --skip leaves out photos already shown in an earlier round.
 * photos.tsv rows: photo_id, observation_uuid, observer_id, extension, license,
 *   width, height, slug, quality_grade, taxon_id (from inat-candidates.sh).
 * Picks up to N candidates per crop (research grade and landscape first),
 * downloads the small "medium" previews, and writes one labelled contact sheet
 * per crop plus candidates.json (licence + author per candidate) for review.
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const only = flag("only")?.split(",");
const skipFile = flag("skip");
const skipIds = new Set(skipFile ? Object.values(JSON.parse(readFileSync(skipFile, "utf8"))).flat().map((c) => c.photoId) : []);
const [tsv, observersGz, out, perArg] = argv;
const PER = Number(perArg ?? 8);
const BUCKET = "https://inaturalist-open-data.s3.amazonaws.com";
const { default: sharp } = await import("sharp");
mkdirSync(join(out, "previews"), { recursive: true });

const bySlug = new Map();
for (const line of readFileSync(tsv, "utf8").split("\n")) {
  if (!line) continue;
  const [photoId, observationUuid, observerId, extension, license, width, height, slug, quality, taxonId] = line.split("\t");
  const row = { photoId: Number(photoId), observationUuid, observerId, extension, license, width: Number(width), height: Number(height), slug, quality, taxonId };
  if ((only && !only.includes(slug)) || skipIds.has(row.photoId)) continue;
  if (!bySlug.has(slug)) bySlug.set(slug, []);
  bySlug.get(slug).push(row);
}
const score = (r) => (r.quality === "research" ? 2 : 0) + (r.width >= r.height ? 1 : 0) + Math.min(r.width, 3000) / 3000;
const chosen = new Map();
const needObservers = new Set();
for (const [slug, rows] of bySlug) {
  // Spread over observers so one person's photos do not fill the sheet.
  const seen = new Set();
  const pick = [];
  for (const r of rows.sort((a, b) => score(b) - score(a))) {
    if (seen.has(r.observerId)) continue;
    seen.add(r.observerId);
    pick.push(r);
    if (pick.length === PER) break;
  }
  chosen.set(slug, pick);
  for (const r of pick) needObservers.add(r.observerId);
}
const observers = new Map();
const rl = createInterface({ input: createReadStream(observersGz).pipe(createGunzip()) });
for await (const line of rl) {
  const [id, login, name] = line.split("\t");
  if (needObservers.has(id)) observers.set(id, { login, name: (name ?? "").trim() });
}

const TILE = 300;
const catalogue = {};
for (const [slug, rows] of [...chosen].sort()) {
  const tiles = [];
  catalogue[slug] = [];
  for (const [i, r] of rows.entries()) {
    const file = join(out, "previews", `${slug}-${i + 1}.${r.extension}`);
    try {
      execFileSync("curl", ["-sSf", "--max-time", "30", "-o", file, `${BUCKET}/photos/${r.photoId}/medium.${r.extension}`]);
    } catch {
      continue;
    }
    const o = observers.get(r.observerId) ?? { login: "", name: "" };
    catalogue[slug].push({ index: i + 1, photoId: r.photoId, extension: r.extension, license: r.license, author: o.name || o.login, observationUuid: r.observationUuid, width: r.width, height: r.height, quality: r.quality, taxonId: r.taxonId });
    const img = await sharp(file).resize(TILE, TILE, { fit: "cover" }).toBuffer();
    const label = Buffer.from(`<svg width="${TILE}" height="${TILE}"><rect x="0" y="0" width="54" height="40" fill="black" opacity="0.7"/><text x="10" y="30" font-size="28" font-family="sans-serif" fill="white">${i + 1}</text></svg>`);
    tiles.push(await sharp(img).composite([{ input: label }]).toBuffer());
  }
  if (!tiles.length) continue;
  const cols = 4;
  const rowsN = Math.ceil(tiles.length / cols);
  const header = Buffer.from(`<svg width="${cols * TILE}" height="44"><rect width="100%" height="100%" fill="white"/><text x="10" y="32" font-size="28" font-family="sans-serif" fill="black">${slug}</text></svg>`);
  await sharp({ create: { width: cols * TILE, height: rowsN * TILE + 44, channels: 3, background: "white" } })
    .composite([{ input: header, top: 0, left: 0 }, ...tiles.map((t, i) => ({ input: t, top: 44 + Math.floor(i / cols) * TILE, left: (i % cols) * TILE }))])
    .jpeg({ quality: 70 })
    .toFile(join(out, `sheet-${slug}.jpg`));
}
writeFileSync(join(out, "candidates.json"), JSON.stringify(catalogue, null, 1));
console.log(`sheets: ${Object.keys(catalogue).length}`);
