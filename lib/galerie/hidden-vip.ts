import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { galleryR2BaseUrl } from "@/lib/galerie/content";

export const HIDDEN_VIP_MANIFEST_KEY = "galerie-meta/hidden-vip.json";
/** Plus strict que le scan (80) : un sosie ne doit pas contourner le filtre. */
export const EXEMPT_MIN_SIMILARITY = 95;

export type HiddenVipManifest = {
  updatedAt: string;
  /** FaceIds Rekognition du personnage (pour reconnaître son scan). */
  faceIds: string[];
  /** Photos où il apparaît (`album__fichier.jpg`). */
  externalIds: string[];
  /** FaceIds des mariés : ils voient aussi les photos cachées. */
  exemptFaceIds: string[];
  label?: string;
};

const globalForVip = globalThis as typeof globalThis & {
  galerieHiddenVip?: { at: number; manifest: HiddenVipManifest };
};

const CACHE_MS = 10 * 60_000;

const BUCKET = () => process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID = () =>
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

export function hiddenVipManifestPublicUrl() {
  return `${galleryR2BaseUrl()}/${HIDDEN_VIP_MANIFEST_KEY}`;
}

export function emptyHiddenVipManifest(): HiddenVipManifest {
  return { updatedAt: "", faceIds: [], externalIds: [], exemptFaceIds: [] };
}

function r2ClientOrNull() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function normalizeManifest(data: Partial<HiddenVipManifest>): HiddenVipManifest {
  return {
    updatedAt: data.updatedAt || "",
    faceIds: Array.isArray(data.faceIds)
      ? [...new Set(data.faceIds.filter(Boolean))]
      : [],
    externalIds: Array.isArray(data.externalIds)
      ? [...new Set(data.externalIds.filter(Boolean))]
      : [],
    exemptFaceIds: Array.isArray(data.exemptFaceIds)
      ? [...new Set(data.exemptFaceIds.filter(Boolean))]
      : [],
    label: data.label?.trim() || undefined,
  };
}

async function readManifestFromR2(client: S3Client): Promise<HiddenVipManifest> {
  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: BUCKET(), Key: HIDDEN_VIP_MANIFEST_KEY }),
    );
    const text = await obj.Body?.transformToString("utf8");
    if (!text) return emptyHiddenVipManifest();
    return normalizeManifest(JSON.parse(text) as HiddenVipManifest);
  } catch {
    return emptyHiddenVipManifest();
  }
}

export async function writeHiddenVipManifest(
  manifest: HiddenVipManifest,
): Promise<HiddenVipManifest> {
  const client = r2ClientOrNull();
  if (!client) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants.");
  }
  const normalized = normalizeManifest({
    ...manifest,
    updatedAt: manifest.updatedAt || new Date().toISOString(),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: HIDDEN_VIP_MANIFEST_KEY,
      Body: JSON.stringify(normalized, null, 2),
      ContentType: "application/json",
    }),
  );
  globalForVip.galerieHiddenVip = { at: Date.now(), manifest: normalized };
  return normalized;
}

async function fetchPublicManifest(): Promise<HiddenVipManifest> {
  try {
    const response = await fetch(hiddenVipManifestPublicUrl(), {
      cache: "no-store",
    });
    if (!response.ok) return emptyHiddenVipManifest();
    return normalizeManifest((await response.json()) as HiddenVipManifest);
  } catch {
    return emptyHiddenVipManifest();
  }
}

/** Charge le manifeste (cache mémoire 10 min). */
export async function loadHiddenVipManifest(): Promise<HiddenVipManifest> {
  const cached = globalForVip.galerieHiddenVip;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.manifest;
  }

  const client = r2ClientOrNull();
  const manifest = client
    ? await readManifestFromR2(client)
    : await fetchPublicManifest();

  globalForVip.galerieHiddenVip = { at: Date.now(), manifest };
  return manifest;
}

export function isVipScanner(
  matchedFaceIds: Iterable<string>,
  manifest: HiddenVipManifest,
): boolean {
  if (manifest.faceIds.length === 0) return false;
  const vip = new Set(manifest.faceIds);
  for (const faceId of matchedFaceIds) {
    if (vip.has(faceId)) return true;
  }
  return false;
}

export function isExemptScanner(
  strongFaceIds: Iterable<string>,
  manifest: HiddenVipManifest,
): boolean {
  const exempt = new Set(manifest.exemptFaceIds);
  for (const faceId of strongFaceIds) {
    if (exempt.has(faceId)) return true;
  }
  return false;
}

/**
 * Si le scanneur n’est pas le VIP, retire les photos où il apparaît.
 * Sinon laisse la liste intacte.
 */
export function filterExternalIdsForVip(
  externalIds: string[],
  matchedFaceIds: Iterable<string>,
  manifest: HiddenVipManifest,
): string[] {
  if (manifest.externalIds.length === 0) return externalIds;
  if (isVipScanner(matchedFaceIds, manifest)) return externalIds;

  const hidden = new Set(manifest.externalIds);
  return externalIds.filter((id) => !hidden.has(id));
}
