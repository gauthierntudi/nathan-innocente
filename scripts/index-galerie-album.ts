/**
 * Indexe un album dans AWS Rekognition.
 *
 * Usage :
 *   npm run galerie:index -- --album soiree --from-r2
 *   npm run galerie:index -- --album civil --dir "/Users/mac/Downloads/civil"
 *
 * Les ExternalImageId sont du type "civil__VIS06975.jpg".
 * Le scan n’indexe plus les photos à la volée : lancer ce script après chaque upload R2.
 */
import "dotenv/config";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  albumById,
  galleryAlbumFolders,
  photoPublicUrl,
  type GalleryAlbum,
} from "../lib/galerie/content";
import { mergeConfirmedNoFacePhotos } from "../lib/galerie/no-face";
import {
  externalIdFor,
  imageHasAnyFace,
  indexFaceBytes,
  listIndexedExternalIds,
} from "../lib/galerie/rekognition";

/** Limite AWS Rekognition pour Image.Bytes (5 Mo). */
const MAX_BYTES = 5_242_880;

const BUCKET = process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants dans .env",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listR2JpegFilenames(album: GalleryAlbum) {
  const client = r2Client();
  const prefix = album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  const files: string[] = [];
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const item of page.Contents ?? []) {
      const key = item.Key ?? "";
      if (!key.startsWith(prefix)) continue;
      const filename = key.slice(prefix.length);
      if (!filename || filename.includes("/")) continue;
      if (!/\.jpe?g$/i.test(filename)) continue;
      files.push(filename);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return files.sort();
}

async function compressForRekognition(raw: Buffer, label: string) {
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

  throw new Error(`Image trop lourde même après compression: ${label}`);
}

async function bytesFromLocal(filePath: string) {
  return compressForRekognition(await readFile(filePath), path.basename(filePath));
}

async function bytesFromR2(album: GalleryAlbum, filename: string) {
  const client = r2Client();
  const key = `${album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/")}${filename}`;
  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const raw = Buffer.from((await obj.Body?.transformToByteArray()) ?? []);
    if (raw.byteLength === 0) throw new Error("objet vide");
    return compressForRekognition(raw, filename);
  } catch {
    // Fallback URL publique si GetObject échoue
    const url = photoPublicUrl(album, filename);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
    const raw = Buffer.from(await response.arrayBuffer());
    return compressForRekognition(raw, filename);
  }
}

async function main() {
  const albumId = arg("--album");
  const dir = arg("--dir");
  const fromR2 = hasFlag("--from-r2");

  if (!albumId || (!dir && !fromR2)) {
    console.error(`Usage:
  npm run galerie:index -- --album soiree --from-r2
  npm run galerie:index -- --album civil --dir "/chemin/photos"`);
    process.exit(1);
  }

  const album = albumById(albumId);
  if (!album) {
    console.error(`Album inconnu: ${albumId}`);
    console.error(
      `Albums: ${galleryAlbumFolders.map((entry) => entry.id).join(", ")}`,
    );
    process.exit(1);
  }

  const files = fromR2
    ? await listR2JpegFilenames(album)
    : (await readdir(dir!)).filter((name) => /\.jpe?g$/i.test(name)).sort();

  const sourceLabel = fromR2 ? `R2 ${BUCKET}/${album.prefix}` : dir!;
  console.log(
    `Album ${album.id} (${album.title}) — ${files.length} JPEG depuis ${sourceLabel}`,
  );

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
      const bytes = fromR2
        ? await bytesFromR2(album, filename)
        : await bytesFromLocal(path.join(dir!, filename));
      const result = await indexFaceBytes(album.id, filename, bytes);
      if (result.faces > 0) {
        added += 1;
        present.add(externalId);
        console.log(
          `[${index + 1}/${files.length}] + ${filename} (${result.faces} visage)`,
        );
      } else {
        const hasFace = await imageHasAnyFace(bytes);
        if (hasFace) {
          failed += 1;
          console.log(
            `[${index + 1}/${files.length}] ! ${filename} (visage vu, non indexable)`,
          );
        } else {
          empty += 1;
          confirmedNoFace.push(filename);
          console.log(
            `[${index + 1}/${files.length}] · ${filename} (aucun visage)`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/no face/i.test(message)) {
        try {
          const bytes = fromR2
            ? await bytesFromR2(album, filename)
            : await bytesFromLocal(path.join(dir!, filename));
          const hasFace = await imageHasAnyFace(bytes);
          if (hasFace) {
            failed += 1;
            console.log(
              `[${index + 1}/${files.length}] ! ${filename} (visage vu, non indexable)`,
            );
          } else {
            empty += 1;
            confirmedNoFace.push(filename);
            console.log(
              `[${index + 1}/${files.length}] · ${filename} (aucun visage)`,
            );
          }
        } catch {
          failed += 1;
          console.error(
            `[${index + 1}/${files.length}] ✕ ${filename} — ${message}`,
          );
        }
      } else {
        failed += 1;
        console.error(
          `[${index + 1}/${files.length}] ✕ ${filename} — ${message}`,
        );
      }
    }
  }

  console.log(
    `Terminé — indexées: ${added}, déjà présentes: ${skipped}, sans visage: ${empty}, erreurs: ${failed}`,
  );

  if (confirmedNoFace.length === 0) return;

  try {
    console.log("Mise à jour manifeste no-face (hors affichage Ambiance)…");
    const manifest = await mergeConfirmedNoFacePhotos(
      album.id,
      confirmedNoFace,
    );
    console.log(`Manifeste — ${manifest.photos.length} photo(s) sans visage.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Manifeste no-face non mis à jour: ${message}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
