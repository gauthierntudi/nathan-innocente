/**
 * Remise à zéro complète de la galerie : photos R2, manifestes et collections
 * Rekognition. IRRÉVERSIBLE avec --confirm.
 *
 * Usage :
 *   npm run galerie:reset                         (à blanc : liste seulement)
 *   npm run galerie:reset -- --confirm SUPPRIMER  (supprime réellement)
 *   npm run galerie:reset -- --all-collections    (inclut les collections d’autres projets)
 *
 * Par défaut, seules les collections dont le nom commence par « mariage » sont visées :
 * le compte AWS en héberge d’autres.
 * Les autres dossiers du bucket (dresscode, invitations, videos…) ne sont pas touchés.
 */
import "dotenv/config";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DeleteCollectionCommand,
  DescribeCollectionCommand,
  ListCollectionsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";

import { galleryAlbumFolders } from "../lib/galerie/content";

const CONFIRM_WORD = "SUPPRIMER";
const META_PREFIX = "galerie-meta/";
const COLLECTION_PREFIX = "mariage";

const BUCKET = process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function r2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants dans .env");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function rekognitionClient() {
  const region = process.env.AWS_REGION?.trim();
  if (!region) throw new Error("AWS_REGION manquant dans .env");
  return new RekognitionClient({ region });
}

async function listKeys(client: S3Client, prefix: string) {
  const keys: string[] = [];
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
      if (item.Key) keys.push(item.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function deleteOneByOne(client: S3Client, keys: string[]) {
  for (const Key of keys) {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
  }
}

async function deleteKeys(client: S3Client, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = (result.Errors ?? []).flatMap((error) => (error.Key ? [error.Key] : []));
      if (failed.length) await deleteOneByOne(client, failed);
    } catch (error) {
      // R2 refuse parfois tout le lot (ex. nom avec parenthèses) : un par un.
      console.warn(
        `  · suppression groupée refusée (${error instanceof Error ? error.message : error}), un par un…`,
      );
      await deleteOneByOne(client, chunk);
    }
  }
}

async function listCollections(client: RekognitionClient) {
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListCollectionsCommand({ NextToken: token }));
    ids.push(...(page.CollectionIds ?? []));
    token = page.NextToken;
  } while (token);
  return ids;
}

async function main() {
  const confirmed = arg("--confirm") === CONFIRM_WORD;
  const allCollections = hasFlag("--all-collections");
  const r2 = r2Client();
  const rekognition = rekognitionClient();

  // Préfixes de la config + manifestes ; « galeries/ » ne couvre pas « galeries-2/ ».
  const prefixes = [
    ...new Set([...galleryAlbumFolders.map((album) => album.prefix), META_PREFIX]),
  ];

  console.log(`R2 — bucket ${BUCKET}`);
  const keysByPrefix = new Map<string, string[]>();
  for (const prefix of prefixes) {
    const keys = await listKeys(r2, prefix);
    keysByPrefix.set(prefix, keys);
    console.log(`  ${prefix.padEnd(16)} ${String(keys.length).padStart(6)} objet(s)`);
  }
  const totalKeys = [...keysByPrefix.values()].reduce((sum, keys) => sum + keys.length, 0);

  console.log(`\nRekognition — région ${process.env.AWS_REGION}`);
  const isTarget = (id: string) => allCollections || id.startsWith(COLLECTION_PREFIX);
  const existing = await listCollections(rekognition);
  const collections = existing.filter(isTarget);
  for (const id of existing) {
    const info = await rekognition.send(new DescribeCollectionCommand({ CollectionId: id }));
    const label = isTarget(id) ? "" : "  (conservée)";
    console.log(`  ${id.padEnd(32)} ${String(info.FaceCount ?? 0).padStart(6)} visage(s)${label}`);
  }
  if (existing.length === 0) console.log("  (aucune collection)");

  console.log(`\nTotal : ${totalKeys} objet(s) R2, ${collections.length} collection(s).`);

  if (!confirmed) {
    console.log(
      `\nÀ blanc : rien n’a été supprimé. Pour supprimer réellement :\n  npm run galerie:reset -- --confirm ${CONFIRM_WORD}`,
    );
    return;
  }

  console.log("\nSuppression…");
  for (const [prefix, keys] of keysByPrefix) {
    if (keys.length === 0) continue;
    await deleteKeys(r2, keys);
    console.log(`  ✓ ${prefix} — ${keys.length} objet(s) supprimé(s)`);
  }
  for (const id of collections) {
    await rekognition.send(new DeleteCollectionCommand({ CollectionId: id }));
    console.log(`  ✓ collection ${id} supprimée`);
  }

  const leftover = (
    await Promise.all(prefixes.map((prefix) => listKeys(r2, prefix)))
  ).flat().length;
  const leftoverCollections = (await listCollections(rekognition)).filter(isTarget).length;
  console.log(
    `\nTerminé — reste ${leftover} objet(s) R2 et ${leftoverCollections} collection(s) visée(s).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
