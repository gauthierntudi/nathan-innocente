/**
 * Vérifie quelles photos de la galerie correspondent à un visage.
 *
 * Usage :
 *   npm run galerie:check-faces -- --face "/chemin/selfie.jpg"
 *   npm run galerie:check-faces -- --face "/chemin/selfie.jpg" --album soiree
 *   npm run galerie:check-faces -- --face "/chemin/selfie.jpg" --threshold 85 --limit 40
 *
 * Affiche les photos indexées qui matchent (similarité + URL publique).
 */
import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  albumById,
  canonicalAlbumId,
  galleryAlbumFolders,
  photoPublicUrl,
} from "../lib/galerie/content";
import { parseExternalId, searchFaceMatches } from "../lib/galerie/rekognition";

const MAX_BYTES = 5_242_880;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function bytesForSearch(filePath: string) {
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
  throw new Error(`Image trop lourde: ${path.basename(filePath)}`);
}

async function main() {
  const facePath = arg("--face");
  if (!facePath) {
    console.error(`Usage:
  npm run galerie:check-faces -- --face "/chemin/selfie.jpg"
  npm run galerie:check-faces -- --face "/chemin/selfie.jpg" --album soiree
  npm run galerie:check-faces -- --face "/chemin/selfie.jpg" --threshold 85 --limit 40`);
    process.exit(1);
  }

  const albumFilter = arg("--album");
  if (albumFilter && !albumById(albumFilter)) {
    console.error(`Album inconnu: ${albumFilter}`);
    console.error(
      `Albums: ${galleryAlbumFolders.map((a) => a.id).join(", ")}`,
    );
    process.exit(1);
  }

  const threshold = Math.min(
    99,
    Math.max(70, Number(arg("--threshold") ?? "80") || 80),
  );
  const limit = Math.max(1, Number(arg("--limit") ?? "50") || 50);

  console.log(`Recherche visage: ${facePath}`);
  console.log(`Seuil: ${threshold}% — max affichage: ${limit}`);
  if (albumFilter) console.log(`Filtre album source: ${albumFilter}`);

  const bytes = await bytesForSearch(facePath);
  const hits = await searchFaceMatches(bytes, {
    threshold,
    maxFaces: 1000,
  });

  type Row = {
    similarity: number;
    sourceAlbumId: string;
    displayAlbumId: string;
    filename: string;
    url: string;
  };

  const bestByPhoto = new Map<string, Row>();

  for (const hit of hits) {
    const parsed = parseExternalId(hit.externalImageId);
    if (!parsed) continue;
    if (albumFilter && parsed.albumId !== albumFilter) {
      // Aussi accepter si le filtre est l’album canonique (ex. civil)
      if (canonicalAlbumId(parsed.albumId) !== albumFilter) continue;
    }

    const source = albumById(parsed.albumId);
    if (!source) continue;

    const url = photoPublicUrl(source, parsed.filename);
    const prev = bestByPhoto.get(url);
    if (prev && prev.similarity >= hit.similarity) continue;

    bestByPhoto.set(url, {
      similarity: hit.similarity,
      sourceAlbumId: parsed.albumId,
      displayAlbumId: canonicalAlbumId(parsed.albumId),
      filename: parsed.filename,
      url,
    });
  }

  const rows = [...bestByPhoto.values()].sort(
    (a, b) => b.similarity - a.similarity,
  );

  const byDisplay = new Map<string, number>();
  for (const row of rows) {
    byDisplay.set(
      row.displayAlbumId,
      (byDisplay.get(row.displayAlbumId) ?? 0) + 1,
    );
  }

  console.log(`\n${rows.length} photo(s) distincte(s) avec ce visage.\n`);
  if (byDisplay.size) {
    console.log("Par album (affichage) :");
    for (const [id, count] of [...byDisplay.entries()].sort()) {
      console.log(`  ${id.padEnd(24)} ${count}`);
    }
    console.log("");
  }

  const shown = rows.slice(0, limit);
  console.log(
    `${"%".padStart(6)}  ${"album".padEnd(24)}  ${"fichier".padEnd(28)}  url`,
  );
  console.log("-".repeat(100));
  for (const row of shown) {
    console.log(
      `${row.similarity.toFixed(1).padStart(6)}  ${row.displayAlbumId.padEnd(24)}  ${row.filename.slice(0, 28).padEnd(28)}  ${row.url}`,
    );
  }

  if (rows.length > shown.length) {
    console.log(
      `\n… ${rows.length - shown.length} autre(s) (augmente avec --limit ${rows.length})`,
    );
  }

  if (rows.length === 0) {
    console.log(
      "Aucun match. Vérifie que le visage est indexé et que la photo de référence est nette.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
