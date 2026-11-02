#!/usr/bin/env bash
set -euo pipefail
# Streams iNaturalist open data (observations + photos, ~35 GB compressed) through
# filters without storing it: keeps observations of our taxa (taxon_slug.tsv from
# inat-taxa.ts) and their FIRST photo when licensed CC0 / CC-BY / CC-BY-SA only.
#   scripts/crop-photos/inat-candidates.sh <work-dir containing taxon_slug.tsv>
S="$1"; B=https://inaturalist-open-data.s3.amazonaws.com
# 1) observations of our taxa (cap per crop: 4000 research + 1500 other)
curl -sS --retry 3 "$B/observations.csv.gz" | gzip -dc | mawk -F'\t' -v OFS='\t' '
  NR==FNR { slug[$1]=$2; next }
  FNR==1 { next }
  ($6 in slug) { s=slug[$6]; k=($7=="research")?"r":"o"; c=s k; if ((k=="r" && n[c]<4000) || (k=="o" && n[c]<1500)) { n[c]++; print $1,$2,$6,$7,s } }
' "$S/taxon_slug.tsv" - > "$S/obs.tsv"
echo "obs done $(wc -l < "$S/obs.tsv")"
# 2) first photo of those observations, free licences only (no NC/ND)
curl -sS --retry 3 "$B/photos.csv.gz" | gzip -dc | mawk -F'\t' -v OFS='\t' '
  NR==FNR { obs[$1]=$5 "\t" $4 "\t" $3; next }
  FNR==1 { next }
  ($3 in obs) && ($6=="CC0" || $6=="CC-BY" || $6=="CC-BY-SA") && $9==0 && ($7>=900 || $8>=900) { print $2,$3,$4,$5,$6,$7,$8,obs[$3] }
' "$S/obs.tsv" - > "$S/photos.tsv"
echo "photos done $(wc -l < "$S/photos.tsv")"
