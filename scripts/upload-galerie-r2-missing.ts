/**
 * Envoie vers R2 uniquement les JPEG absents du préfixe album.
 *
 * Usage :
 *   npm run galerie:upload -- --album soiree --dir "/Users/mac/Downloads/soiree"
 *   npm run galerie:upload -- --album civil --dir "/chemin/photos" --concurrency 8
 *
 * Auth : session Wrangler (oauth) ou CLOUDFLARE_API_TOKEN.
 */
import "dotenv/config";

import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { albumById } from "../lib/galerie/content";

const BUCKET = "mariage";
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "2db1464f25a468e66bd514b16785ecee";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function wranglerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    return process.env.CLOUDFLARE_API_TOKEN.trim();
  }

  const configPath = path.join(
    os.homedir(),
    "Library/Preferences/.wrangler/config/default.toml",
  );
  try {
    const text = await readFile(configPath, "utf8");
    const match = text.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  throw new Error(
    "Aucun token Cloudflare. Lance `npx wrangler login` ou exporte CLOUDFLARE_API_TOKEN.",
  );
}

async function listRemoteKeys(prefix: string, token: string) {
  const keys = new Set<string>();
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects`,
    );
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: { key?: string }[] | { objects?: { key?: string }[] };
      result_info?: { cursor?: string; is_truncated?: boolean };
    };

    if (!response.ok || data.success === false) {
      const message = data.errors?.[0]?.message || `HTTP ${response.status}`;
      throw new Error(`Liste R2 impossible: ${message}`);
    }

    const rows = Array.isArray(data.result)
      ? data.result
      : (data.result?.objects ?? []);

    for (const row of rows) {
      if (row.key) keys.add(row.key);
    }

    cursor = data.result_info?.is_truncated ? data.result_info.cursor : undefined;
  } while (cursor);

  return keys;
}

function runWranglerPut(objectKey: string, filePath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "--yes",
        "wrangler@4",
        "r2",
        "object",
        "put",
        `${BUCKET}/${objectKey}`,
        "--file",
        filePath,
        "--content-type",
        "image/jpeg",
        "--remote",
        "-y",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `wrangler exit ${code}`));
    });
  });
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
  const concurrency = Math.max(1, Number(arg("--concurrency") ?? "6") || 6);

  if (!albumId || !dir) {
    console.error(
      'Usage: npm run galerie:upload -- --album soiree --dir "/chemin/photos"',
    );
    process.exit(1);
  }

  const album = albumById(albumId);
  if (!album) {
    console.error(`Album inconnu: ${albumId}`);
    console.error("Albums: civil, eglise, soiree, pre-dot");
    process.exit(1);
  }

  const prefix = album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  const token = await wranglerToken();

  console.log(`Liste R2 ${BUCKET}/${prefix}…`);
  const remote = await listRemoteKeys(prefix, token);
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
      await runWranglerPut(objectKey, filePath);
      ok += 1;
      console.log(`[${index + 1}/${missing.length}] → ${objectKey}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${index + 1}/${missing.length}] ✕ ${objectKey} — ${message}`);
    }
  });

  console.log(`Terminé — envoyés: ${ok}, erreurs: ${failed}, ignorés: ${files.length - missing.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
