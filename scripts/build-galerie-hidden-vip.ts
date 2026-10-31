/**
 * Construit le manifeste des photos d’un personnage public à cacher
 * pour les autres invités (visible seulement s’il scanne lui-même).
 *
 * Usage :
 *   npm run galerie:hide-vip -- --dir "/chemin/photos-ref-vip"
 *   npm run galerie:hide-vip -- --dir "/refs" --label "Personnage public"
 *   npm run galerie:hide-vip -- --album civil --files VIS06975.jpg,VIS06976.jpg
 *   npm run galerie:hide-vip -- --list
 *   npm run galerie:hide-vip -- --clear
 *
 * Les JPEG de référence doivent montrer clairement le VIP (portrait / plan serré).
 */
import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { albumById, photoPublicUrl } from "../lib/galerie/content";
import {
  emptyHiddenVipManifest,
  HIDDEN_VIP_MANIFEST_KEY,
  loadHiddenVipManifest,
  writeHiddenVipManifest,
} from "../lib/galerie/hidden-vip";
import { searchFaceMatches } from "../lib/galerie/rekognition";

const MAX_BYTES = 5_242_880;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string) {
  return process.argv.includes(name);
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

async function bytesFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength <= MAX_BYTES) return raw;
  return sharp(raw)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function collectFromBytes(
  bytes: Uint8Array,
  label: string,
  faceIds: Set<string>,
  externalIds: Set<string>,
) {
  const threshold = Number(arg("--threshold") ?? "85") || 85;
  const hits = await searchFaceMatches(bytes, {
    threshold: Math.min(99, Math.max(70, threshold)),
  });
  console.log(`  ${label} — ${hits.length} correspondance(s)`);
  for (const hit of hits) {
    faceIds.add(hit.faceId);
    externalIds.add(hit.externalImageId);
  }
}

async function main() {
  if (hasFlag("--list")) {
    const manifest = await loadHiddenVipManifest();
    console.log(
      JSON.stringify(
        {
          key: HIDDEN_VIP_MANIFEST_KEY,
          updatedAt: manifest.updatedAt || null,
          label: manifest.label || null,
          faceIds: manifest.faceIds.length,
          externalIds: manifest.externalIds.length,
          sample: manifest.externalIds.slice(0, 10),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (hasFlag("--clear")) {
    await writeHiddenVipManifest(emptyHiddenVipManifest());
    console.log(`✓ ${HIDDEN_VIP_MANIFEST_KEY} vidé — plus de filtre VIP.`);
    return;
  }

  const dir = arg("--dir");
  const albumId = arg("--album");
  const filesArg = arg("--files");
  const label = arg("--label")?.trim();

  if (!dir && !(albumId && filesArg)) {
    console.error(`Usage:
  npm run galerie:hide-vip -- --dir "/chemin/refs-vip"
  npm run galerie:hide-vip -- --album civil --files photo1.jpg,photo2.jpg
  npm run galerie:hide-vip -- --list
  npm run galerie:hide-vip -- --clear`);
    process.exit(1);
  }

  const faceIds = new Set<string>();
  const externalIds = new Set<string>();

  if (dir) {
    const names = (await readdir(dir))
      .filter((name) => /\.jpe?g$/i.test(name))
      .sort();
    if (names.length === 0) {
      console.error(`Aucun JPEG dans ${dir}`);
      process.exit(1);
    }
    console.log(`Références locales: ${names.length} JPEG dans ${dir}`);
    for (const [index, name] of names.entries()) {
      const bytes = await bytesForSearch(path.join(dir, name));
      await collectFromBytes(
        bytes,
        `[${index + 1}/${names.length}] ${name}`,
        faceIds,
        externalIds,
      );
    }
  }

  if (albumId && filesArg) {
    const album = albumById(albumId);
    if (!album) {
      console.error(`Album inconnu: ${albumId}`);
      process.exit(1);
    }
    const files = filesArg
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    console.log(`Références R2 album ${album.id}: ${files.length} fichier(s)`);
    for (const [index, filename] of files.entries()) {
      const url = photoPublicUrl(album, filename);
      const bytes = await bytesFromUrl(url);
      await collectFromBytes(
        bytes,
        `[${index + 1}/${files.length}] ${album.id}/${filename}`,
        faceIds,
        externalIds,
      );
    }
  }

  if (faceIds.size === 0 || externalIds.size === 0) {
    console.error(
      "Aucune correspondance dans la collection. Vérifie que le VIP est bien indexé et que les refs sont nettes.",
    );
    process.exit(1);
  }

  const manifest = await writeHiddenVipManifest({
    updatedAt: new Date().toISOString(),
    faceIds: [...faceIds].sort(),
    externalIds: [...externalIds].sort(),
    label,
  });

  console.log(
    `\n✓ Écrit ${HIDDEN_VIP_MANIFEST_KEY}${manifest.label ? ` (${manifest.label})` : ""}`,
  );
  console.log(`  FaceIds VIP : ${manifest.faceIds.length}`);
  console.log(`  Photos cachées pour les autres : ${manifest.externalIds.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
