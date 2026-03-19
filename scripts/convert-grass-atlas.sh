#!/bin/sh
set -eu

SRC_DIR="${1:-static/grass-atlas}"
OUT_DIR="${2:-static/grass-atlas-web}"

mkdir -p "$OUT_DIR"

for tif in "$SRC_DIR"/*.tif; do
  base_name="$(basename "$tif" .tif)"
  magick "$tif" -auto-orient -depth 8 "$OUT_DIR/$base_name.png"
done
