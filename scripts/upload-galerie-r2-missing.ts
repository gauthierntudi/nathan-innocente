/**
 * Envoie vers R2 uniquement les JPEG absents du préfixe album.
 *
 * Usage :
 *   npm run galerie:upload -- --album soiree --dir "/Users/mac/Downloads/soiree"
 *   npm run galerie:upload -- --album civil --dir "/chemin/photos" --concurrency 8
 *
 * Auth : R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY (+ R2_ACCOUNT_ID) dans .env
 */
import "dotenv/config";

import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { albumById } from "../lib/galerie/content";

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

async function listRemoteKeys(client: S3Client, prefix: string) {
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) keys.add(item.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function putObject(client: S3Client, objectKey: string, filePath: string) {
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: "image/jpeg",
    }),
  );
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
}

async function main() {
  const albumId = arg("--album");
  const dir = arg("--dir");
  const concurrency = Math.max(1, Number(arg("--concurrency") ?? "8") || 8);

  if (!albumId || !dir) {
    console.error(
      'Usage: npm run galerie:upload -- --album soiree --dir "/chemin/photos"',
    );
    process.exit(1);
  }

  const album = albumById(albumId);
  if (!album) {
    console.error(`Album inconnu: ${albumId}`);
    console.error(
      "Albums: civil, eglise, soiree, pre-dot, cocktail, shoot-maries, full-preparation, civil-autres, civil-moments, civil-autres-instants, nathan-chez-inno",
    );
    process.exit(1);
  }

  const prefix = album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  const client = r2Client();

  console.log(`Liste R2 ${BUCKET}/${prefix}…`);
  const remote = await listRemoteKeys(client, prefix);
  console.log(`${remote.size} objet(s) déjà présents`);

  const files = (await readdir(dir))
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort();

  const missing = files.filter((name) => !remote.has(`${prefix}${name}`));
  console.log(
    `Local: ${files.length} JPEG — à envoyer: ${missing.length} — déjà là: ${files.length - missing.length}`,
  );

  if (missing.length === 0) {
    console.log("Rien à envoyer.");
    return;
  }

  let ok = 0;
  let failed = 0;

  await mapPool(missing, concurrency, async (filename, index) => {
    const objectKey = `${prefix}${filename}`;
    const filePath = path.join(dir, filename);
    try {
      await putObject(client, objectKey, filePath);
      ok += 1;
      console.log(`[${index + 1}/${missing.length}] → ${objectKey}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${index + 1}/${missing.length}] ✕ ${objectKey} — ${message}`);
    }
  });

  console.log(
    `Terminé — envoyés: ${ok}, erreurs: ${failed}, ignorés: ${files.length - missing.length}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
