/**
 * Maps every crop to iNaturalist taxon ids (and their descendants), by
 * SCIENTIFIC name, for scripts/crop-photos/inat-candidates.sh.
 *   npx tsx scripts/crop-photos/inat-taxa.ts <taxa.csv.gz> > taxon_slug.tsv
 * Varieties owned by another crop stay with that crop (cabbage, cauliflower
 * and broccoli are separate Brassica oleracea varieties; chard is not
 * beetroot), so similar crops are never mixed.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { SEED_CROPS } from "../../src/data/crops";

/**
 * Where iNaturalist's name differs from ours, or a narrower taxon avoids a
 * look-alike. `null` = no reliable taxon: the crop keeps its drawing.
 */
export const INAT_TAXON_OVERRIDES: Record<string, number[] | null> = {
  pumpkin: [122866, 122869], // Cucurbita maxima + moschata (not C. pepo = zucchini)
  radish: [995125], // Raphanus raphanistrum sativus
  lentil: [1375470], // Vicia lens (= Lens culinaris)
  almond: [69936], // Prunus amygdalus (= P. dulcis)
  lemon: [331124], // Citrus × limon
  // iNaturalist lumps sweet orange, bitter orange and grapefruit in Citrus × aurantium:
  // the photo's identity cannot be verified, so they keep their drawings.
  orange: null,
  grapefruit: null,
};

/** iNaturalist taxon id of the kingdom Plantae. */
const PLANTAE = 47126;

const norm = (s: string) => s.replace(/\s+(subsp\.|var\.|ssp\.)\s+/g, " ").replace(/\s+spp?\.$/, "").trim();

async function main() {
  const file = process.argv[2];
  const rows: { id: number; ancestry: number[]; rankLevel: number; name: string; active: boolean }[] = [];
  for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()) })) {
    const [id, ancestry, rankLevel, , name, active] = line.split("\t");
    if (id === "taxon_id") continue;
    rows.push({ id: Number(id), ancestry: ancestry.split("/").filter(Boolean).map(Number), rankLevel: Number(rankLevel), name, active: active === "true" });
  }
  // Plants only (the same name can be an animal genus: Morus = gannets), and
  // the genus rather than a same-named subgenus or section.
  const byName = new Map<string, { id: number; rankLevel: number }>();
  for (const r of rows) {
    if (!r.active || !r.ancestry.includes(PLANTAE)) continue;
    const prev = byName.get(r.name);
    if (!prev || r.rankLevel > prev.rankLevel) byName.set(r.name, { id: r.id, rankLevel: r.rankLevel });
  }
  const owner = new Map<number, string>();
  for (const c of SEED_CROPS) {
    const o = INAT_TAXON_OVERRIDES[c.slug];
    if (o === null) continue;
    const ids = o ?? [(byName.get(c.scientificName ?? "") ?? byName.get(norm(c.scientificName ?? "")))?.id].filter((x): x is number => x != null);
    if (!ids.length) console.error(`no iNaturalist taxon for ${c.slug} (${c.scientificName})`);
    for (const id of ids) owner.set(id, c.slug);
  }
  const out: string[] = [];
  for (const r of rows) {
    const direct = owner.get(r.id);
    // Nearest owned ancestor wins, so a variety owned by another crop stays with it.
    const slug = direct ?? [...r.ancestry].reverse().map((a) => owner.get(a)).find(Boolean);
    if (slug) out.push(`${r.id}\t${slug}`);
  }
  process.stdout.write(out.join("\n") + "\n");
}

main();
