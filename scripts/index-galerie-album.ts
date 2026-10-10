/**
 * Indexe un album local dans AWS Rekognition (bucket mariage / R2).
 *
 * Usage :
 *   npx tsx scripts/index-galerie-album.ts --album civil --dir "/Users/mac/Downloads/civil-innocente-et-nathan"
 *   npx tsx scripts/index-galerie-album.ts --album eglise --dir "/chemin/vers/eglise"
 *   npx tsx scripts/index-galerie-album.ts --album soiree --dir "/chemin/vers/soiree"
 *
 * Les ExternalImageId sont du type "civil__VIS06975.jpg".
 * Le scan n’indexe plus les photos à la volée : lancer ce script après chaque upload R2.
 */
import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { albumById } from "../lib/galerie/content";
import { mergeConfirmedNoFacePhotos } from "../lib/galerie/no-face";
import {
  externalIdFor,
  indexFaceBytes,
  listIndexedExternalIds,
} from "../lib/galerie/rekognition";

/** Limite AWS Rekognition pour Image.Bytes (5 Mo). */
const MAX_BYTES = 5_242_880;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function bytesForRekognition(filePath: string) {
  const raw = await readFile(filePath);
  if (raw.byteLength <= MAX_BYTES) return raw;

  let maxSide = 2400;
  let quality = 82;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const compressed = await sharp(raw)
      .rotate()
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (compressed.byteLength <= MAX_BYTES) return compressed;
    maxSide = Math.max(960, Math.round(maxSide * 0.82));
    quality = Math.max(55, quality - 8);
  }

  throw new Error(`Image trop lourde même après compression: ${path.basename(filePath)}`);
}

async function main() {
  const albumId = arg("--album");
  const dir = arg("--dir");
  if (!albumId || !dir) {
    console.error(
      'Usage: npx tsx scripts/index-galerie-album.ts --album civil --dir "/chemin/photos"',
    );
    process.exit(1);
  }

  const album = albumById(albumId);
  if (!album) {
    console.error(`Album inconnu: ${albumId}`);
    console.error(`Albums: ${["civil", "eglise", "soiree", "pre-dot", "cocktail", "shoot-maries", "full-preparation", "civil-autres", "civil-moments", "civil-autres-instants", "nathan-chez-inno"].join(", ")}`);
    process.exit(1);
  }

  const files = (await readdir(dir))
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort();

  console.log(`Album ${album.id} (${album.title}) — ${files.length} JPEG dans ${dir}`);
  const present = await listIndexedExternalIds();
  const confirmedNoFace: string[] = [];
  let added = 0;
  let skipped = 0;
  let empty = 0;
  let failed = 0;

  for (const [index, filename] of files.entries()) {
    const externalId = externalIdFor(album.id, filename);
    if (present.has(externalId)) {
      skipped += 1;
      continue;
    }

    try {
      const bytes = await bytesForRekognition(path.join(dir, filename));
      const result = await indexFaceBytes(album.id, filename, bytes);
      if (result.faces > 0) {
        added += 1;
        present.add(externalId);
        console.log(`[${index + 1}/${files.length}] + ${filename} (${result.faces} visage)`);
      } else {
        empty += 1;
        confirmedNoFace.push(filename);
        console.log(`[${index + 1}/${files.length}] · ${filename} (aucun visage)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/no face/i.test(message)) {
        empty += 1;
        confirmedNoFace.push(filename);
        console.log(`[${index + 1}/${files.length}] · ${filename} (aucun visage)`);
      } else {
        failed += 1;
        console.error(`[${index + 1}/${files.length}] ✕ ${filename} — ${message}`);
      }
    }
  }

  console.log(
    `Terminé — indexées: ${added}, déjà présentes: ${skipped}, sans visage: ${empty}, erreurs: ${failed}`,
  );

  try {
    console.log("Mise à jour Ambiance (photos confirmées sans visage)…");
    const manifest = await mergeConfirmedNoFacePhotos(album.id, confirmedNoFace);
    console.log(`Ambiance à jour — ${manifest.photos.length} photo(s) sans visage au total.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Ambiance non mise à jour: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
