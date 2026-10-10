/**
 * Détecte les visages Rekognition dont le JPEG public R2 répond 404.
 *
 * Usage :
 *   npm run galerie:orphans
 *   npm run galerie:orphans -- --album civil
 *   npm run galerie:orphans -- --delete
 *   npm run galerie:orphans -- --album civil --delete --concurrency 20
 *
 * Sans --delete : liste seulement (dry-run).
 */
import "dotenv/config";

import { albumById, photoPublicUrl } from "../lib/galerie/content";
import {
  deleteFacesByIds,
  listIndexedFaces,
  parseExternalId,
  type IndexedFace,
} from "../lib/galerie/rekognition";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function remoteExists(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (head.status === 200) return true;
    if (head.status === 404) return false;
    // Certains buckets R2 gèrent mal HEAD → fallback GET
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
    return get.status === 200 || get.status === 206;
  } catch {
    return false;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()),
  );
  return results;
}

async function main() {
  const albumFilter = arg("--album");
  const doDelete = hasFlag("--delete");
  const concurrency = Math.max(1, Number(arg("--concurrency") ?? "16") || 16);

  if (albumFilter && !albumById(albumFilter)) {
    console.error(`Album inconnu: ${albumFilter}`);
    process.exit(1);
  }

  console.log("Lecture de la collection Rekognition…");
  const faces = await listIndexedFaces();
  console.log(`${faces.length} visage(s) indexé(s)`);

  const byExternal = new Map<string, IndexedFace[]>();
  for (const face of faces) {
    const parsed = parseExternalId(face.externalImageId);
    if (!parsed) continue;
    if (albumFilter && parsed.albumId !== albumFilter) continue;
    const list = byExternal.get(face.externalImageId) ?? [];
    list.push(face);
    byExternal.set(face.externalImageId, list);
  }

  const externalIds = [...byExternal.keys()].sort();
  console.log(
    `${externalIds.length} ExternalImageId unique(s)${albumFilter ? ` (album ${albumFilter})` : ""} — contrôle R2…`,
  );

  const orphans: { externalId: string; url: string; faceIds: string[] }[] = [];
  let checked = 0;

  await mapPool(externalIds, concurrency, async (externalId) => {
    const parsed = parseExternalId(externalId);
    if (!parsed) return;
    const album = albumById(parsed.albumId);
    if (!album) return;

    const url = photoPublicUrl(album, parsed.filename);
    const ok = await remoteExists(url);
    checked += 1;
    if (checked % 50 === 0 || checked === externalIds.length) {
      console.log(`  … ${checked}/${externalIds.length}`);
    }
    if (ok) return;

    const faceIds = (byExternal.get(externalId) ?? []).map((face) => face.faceId);
    orphans.push({ externalId, url, faceIds });
  });

  orphans.sort((a, b) => a.externalId.localeCompare(b.externalId));

  console.log("");
  if (orphans.length === 0) {
    console.log("Aucun orphelin : toutes les photos indexées répondent sur R2.");
    return;
  }

  console.log(`${orphans.length} orphelin(s) (fichier R2 introuvable) :`);
  for (const orphan of orphans.slice(0, 40)) {
    console.log(`  ✕ ${orphan.externalId}  (${orphan.faceIds.length} face(s))`);
  }
  if (orphans.length > 40) {
    console.log(`  … +${orphans.length - 40} autres`);
  }

  if (!doDelete) {
    console.log("");
    console.log("Dry-run uniquement. Pour supprimer ces visages de Rekognition :");
    console.log(
      albumFilter
        ? `  npm run galerie:orphans -- --album ${albumFilter} --delete`
        : "  npm run galerie:orphans -- --delete",
    );
    return;
  }

  const faceIds = orphans.flatMap((orphan) => orphan.faceIds);
  console.log("");
  console.log(`Suppression de ${faceIds.length} FaceId (lots de 50, avec pause)…`);
  const deleted = await deleteFacesByIds(faceIds, { chunkSize: 50, pauseMs: 400 });
  console.log(`Terminé — supprimés: ${deleted}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
