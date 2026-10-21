/**
 * Ajoute un album galerie : inscription dans content.ts + préfixe R2.
 *
 * Usage :
 *   npm run galerie:add-album -- --title "Brunch" --dir "/chemin/photos"
 *   npm run galerie:add-album -- --title "Brunch" --id brunch --folder galeries-12
 *   npm run galerie:add-album -- --title "Brunch" --cover /img/03.jpg
 *   npm run galerie:add-album -- --list
 *
 * Options :
 *   --title     Nom affiché (requis sauf --list)
 *   --id        Identifiant technique (défaut : slug du titre)
 *   --folder    Préfixe R2 sans slash final, ex. galeries-12 (défaut : suivant)
 *   --cover     Image de couverture (défaut : /img/5.jpg)
 *   --dir       Dossier local JPEG → upload R2 après inscription
 *   --list      Affiche les albums déjà configurés
 *   --dry-run   Affiche sans modifier content.ts ni R2
 */
import "dotenv/config";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  albumById,
  albumByPrefix,
  galleryAlbums,
} from "../lib/galerie/content";

const CONTENT_PATH = path.join(process.cwd(), "lib/galerie/content.ts");
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

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function nextGaleriesPrefix() {
  let max = 1;
  for (const album of galleryAlbums) {
    const bare = album.prefix.replace(/\/$/, "");
    if (bare === "galeries") {
      max = Math.max(max, 1);
      continue;
    }
    const match = /^galeries-(\d+)$/.exec(bare);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `galeries-${max + 1}/`;
}

function normalizePrefix(raw: string) {
  const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed || !/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed)) {
    throw new Error(`Préfixe R2 invalide: ${raw}`);
  }
  return `${trimmed}/`;
}

function albumEntrySource(album: {
  id: string;
  title: string;
  prefix: string;
  cover: string;
}) {
  const title = album.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `  {
    id: "${album.id}",
    title: "${title}",
    prefix: "${album.prefix}",
    cover: "${album.cover}",
  },
`;
}

async function insertAlbumInContent(album: {
  id: string;
  title: string;
  prefix: string;
  cover: string;
}) {
  const source = await readFile(CONTENT_PATH, "utf8");
  const marker = "] as const satisfies readonly GalleryAlbum[];";
  const index = source.lastIndexOf(marker);
  if (index < 0) {
    throw new Error(`Impossible de trouver ${marker} dans content.ts`);
  }

  if (source.includes(`id: "${album.id}"`)) {
    throw new Error(`L’id "${album.id}" est déjà présent dans content.ts`);
  }
  if (source.includes(`prefix: "${album.prefix}"`)) {
    throw new Error(`Le préfixe "${album.prefix}" est déjà présent dans content.ts`);
  }

  const next = `${source.slice(0, index)}${albumEntrySource(album)}${source.slice(index)}`;
  await writeFile(CONTENT_PATH, next, "utf8");
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

/** Crée le « dossier » R2 via un marqueur .keep (les préfixes n’existent pas seuls). */
async function ensureR2Prefix(prefix: string) {
  const client = r2Client();
  const key = `${prefix}.keep`;
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(
        `# Album linked ${new Date().toISOString()}\n`,
        "utf8",
      ),
      ContentType: "text/plain",
    }),
  );
  return key;
}

function runNpmScript(script: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", script, "--", ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} a échoué (code ${code})`));
    });
  });
}

function printList() {
  console.log("Albums configurés :");
  for (const album of galleryAlbums) {
    console.log(
      `  ${album.id.padEnd(24)} ${album.title.padEnd(28)} → ${album.prefix}`,
    );
  }
  console.log(`\nProchain préfixe auto : ${nextGaleriesPrefix()}`);
}

async function main() {
  if (hasFlag("--list") || hasFlag("-l")) {
    printList();
    return;
  }

  const title = arg("--title") ?? arg("--name");
  if (!title?.trim()) {
    console.error(`Usage:
  npm run galerie:add-album -- --title "Brunch" [--id brunch] [--folder galeries-12] [--dir "/photos"]
  npm run galerie:add-album -- --list`);
    process.exit(1);
  }

  const id = (arg("--id") ?? slugify(title)).trim();
  if (!id || !/^[a-z][a-z0-9-]{0,39}$/.test(id)) {
    console.error(
      `Id invalide: "${id}" (attendu: minuscules, chiffres, tirets, max 40)`,
    );
    process.exit(1);
  }
  if (id === "ambiance") {
    console.error('L’id "ambiance" est réservé.');
    process.exit(1);
  }

  const folderArg = arg("--folder") ?? arg("--prefix");
  const prefix = folderArg
    ? normalizePrefix(folderArg)
    : nextGaleriesPrefix();
  const cover = (arg("--cover") ?? "/img/5.jpg").trim();
  const dir = arg("--dir");
  const dryRun = hasFlag("--dry-run");

  if (albumById(id)) {
    console.error(`Album déjà existant: ${id}`);
    process.exit(1);
  }
  if (albumByPrefix(prefix)) {
    console.error(`Préfixe déjà lié: ${prefix} → ${albumByPrefix(prefix)?.id}`);
    process.exit(1);
  }

  const album = { id, title: title.trim(), prefix, cover };

  console.log("Nouvel album :");
  console.log(`  id      ${album.id}`);
  console.log(`  titre   ${album.title}`);
  console.log(`  dossier ${album.prefix}  (bucket ${BUCKET})`);
  console.log(`  cover   ${album.cover}`);
  if (dir) console.log(`  upload  ${dir}`);

  if (dryRun) {
    console.log("\nDry-run : aucune modification.");
    return;
  }

  await insertAlbumInContent(album);
  console.log(`\n✓ Inscrit dans ${path.relative(process.cwd(), CONTENT_PATH)}`);

  try {
    const keepKey = await ensureR2Prefix(prefix);
    console.log(`✓ Préfixe R2 lié : ${BUCKET}/${keepKey}`);
  } catch (error) {
    console.warn(
      `⚠ content.ts mis à jour, mais liaison R2 impossible: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }

  if (dir) {
    console.log("\nUpload des JPEG manquants…");
    await runNpmScript("galerie:upload", ["--album", id, "--dir", dir]);
    console.log("\nEnsuite pour indexer Rekognition :");
    console.log(
      `  npm run galerie:index -- --album ${id} --dir "${dir}"`,
    );
  } else {
    console.log("\nSuite typique :");
    console.log(
      `  npm run galerie:upload -- --album ${id} --dir "/chemin/photos"`,
    );
    console.log(
      `  npm run galerie:index -- --album ${id} --dir "/chemin/photos"`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
