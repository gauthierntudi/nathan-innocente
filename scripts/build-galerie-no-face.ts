/**
 * Reconstruit Ambiance en confirmant l’absence de visage (DetectFaces).
 * Les photos seulement « non indexées » ne suffisent pas (elles peuvent avoir un visage).
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
      ? `DetectFaces Ambiance pour l’album ${albumId}…`
      : "DetectFaces Ambiance (tous les albums, peut être long)…",
  );

  const manifest = await rebuildNoFaceManifest({
    albumId: albumId || undefined,
    onProgress: (done, total, filename) => {
      if (done % 25 === 0 || done === total) {
        console.log(`  … ${done}/${total} (${filename})`);
      }
    },
  });

  console.log(
    `Écrit ${NO_FACE_MANIFEST_KEY} v${manifest.version ?? 2} — ${manifest.photos.length} photo(s) sans visage confirmées.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
