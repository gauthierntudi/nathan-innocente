/**
 * Compare photos R2 vs visages indexés Rekognition.
 *
 * Usage :
 *   npm run galerie:check-index
 *   npm run galerie:check-index -- --album soiree
 */
import "dotenv/config";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { galleryAlbumFolders } from "../lib/galerie/content";
import { listIndexedFaces } from "../lib/galerie/rekognition";

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

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listJpegFilenames(albumId: string, prefix: string) {
  const client = r2Client();
  const normalized = prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  const files: string[] = [];
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: normalized,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const item of page.Contents ?? []) {
      const key = item.Key ?? "";
      if (!key.startsWith(normalized)) continue;
      const filename = key.slice(normalized.length);
      if (!filename || filename.includes("/")) continue;
      if (!/\.jpe?g$/i.test(filename)) continue;
      files.push(filename);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return files;
}

async function main() {
  const albumFilter = arg("--album");
  const albums = albumFilter
    ? galleryAlbumFolders.filter((album) => album.id === albumFilter)
    : [...galleryAlbumFolders];

  if (albumFilter && albums.length === 0) {
    console.error(`Album inconnu: ${albumFilter}`);
    console.error(
      `Albums: ${galleryAlbumFolders.map((a) => a.id).join(", ")}`,
    );
    process.exit(1);
  }

  console.log("Lecture collection Rekognition…");
  const faces = await listIndexedFaces();
  const indexedByAlbum = new Map<string, Set<string>>();
  const faceCountByAlbum = new Map<string, number>();

  for (const face of faces) {
    const sep = face.externalImageId.indexOf("__");
    if (sep <= 0) continue;
    const albumId = face.externalImageId.slice(0, sep);
    const filename = face.externalImageId.slice(sep + 2);
    if (!indexedByAlbum.has(albumId)) indexedByAlbum.set(albumId, new Set());
    indexedByAlbum.get(albumId)!.add(filename);
    faceCountByAlbum.set(albumId, (faceCountByAlbum.get(albumId) ?? 0) + 1);
  }

  console.log(
    `${"album".padEnd(24)} ${"R2".padStart(6)} ${"index".padStart(6)} ${"visages".padStart(8)} ${"%".padStart(6)}  manquantes`,
  );
  console.log("-".repeat(72));

  for (const album of albums) {
    const jpeg = await listJpegFilenames(album.id, album.prefix);
    const indexed = indexedByAlbum.get(album.id) ?? new Set();
    const facesCount = faceCountByAlbum.get(album.id) ?? 0;
    const covered = jpeg.filter((f) => indexed.has(f)).length;
    const missing = jpeg.length - covered;
    const pct = jpeg.length
      ? `${Math.round((covered / jpeg.length) * 1000) / 10}`
      : "—";

    console.log(
      `${album.id.padEnd(24)} ${String(jpeg.length).padStart(6)} ${String(covered).padStart(6)} ${String(facesCount).padStart(8)} ${pct.padStart(6)}  ${missing}`,
    );

    if (albumFilter && missing > 0) {
      const sample = jpeg
        .filter((f) => !indexed.has(f))
        .slice(0, 12)
        .map((f) => `  - ${f}`);
      if (sample.length) {
        console.log("Exemples non indexés :");
        console.log(sample.join("\n"));
      }
    }
  }

  // Albums indexés hors config (anciens ids)
  if (!albumFilter) {
    const known = new Set<string>(galleryAlbumFolders.map((a) => a.id));
    const orphans = [...indexedByAlbum.keys()].filter((id) => !known.has(id));
    if (orphans.length) {
      console.log("\nIds indexés hors config actuelle :");
      for (const id of orphans.sort()) {
        console.log(
          `  ${id} — ${indexedByAlbum.get(id)!.size} photo(s), ${faceCountByAlbum.get(id) ?? 0} visage(s)`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
