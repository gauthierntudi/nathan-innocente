/**
 * Reconstruit le manifeste des photos sans visage (R2 − Rekognition).
 * Normalement automatique (fin d’index + /api/galerie/index).
 *
 * Usage :
 *   npm run galerie:no-face
 *   npm run galerie:no-face -- --album civil
 */
import "dotenv/config";

import { albumById } from "../lib/galerie/content";
import { NO_FACE_MANIFEST_KEY, rebuildNoFaceManifest } from "../lib/galerie/no-face";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const albumId = arg("--album");
  if (albumId && !albumById(albumId)) {
    console.error(`Album inconnu: ${albumId}`);
    process.exit(1);
  }

  console.log(
    albumId
      ? `Reconstruction Ambiance pour l’album ${albumId}…`
      : "Reconstruction Ambiance (tous les albums)…",
  );
  const manifest = await rebuildNoFaceManifest(albumId ? { albumId } : undefined);
  console.log(
    `Écrit ${NO_FACE_MANIFEST_KEY} — ${manifest.photos.length} photo(s) sans visage.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
