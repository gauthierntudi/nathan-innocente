import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  albumById,
  galleryAlbums,
  galleryR2BaseUrl,
  photoPublicUrl,
  type GalleryAlbumId,
  type GalleryImage,
  type MatchedAlbum,
} from "@/lib/galerie/content";

export const NO_FACE_MANIFEST_KEY = "galerie-meta/no-face.json";

export const ambianceAlbumMeta = {
  id: "ambiance" as const,
  title: "Ambiance",
  cover: "/img/04.jpg",
};

export type NoFacePhotoRef = {
  albumId: string;
  filename: string;
};

export type NoFaceManifest = {
  updatedAt: string;
  photos: NoFacePhotoRef[];
  /** v2 = confirmé via DetectFaces / index « aucun visage » */
  version?: number;
};

const globalForNoFace = globalThis as typeof globalThis & {
  galerieNoFace?: { at: number; manifest: NoFaceManifest };
  galerieNoFaceBuilding?: Promise<NoFaceManifest>;
};

const CACHE_MS = 10 * 60_000;
const MAX_DETECT_BYTES = 5_242_880;
const DETECT_CONCURRENCY = 4;

const BUCKET = () => process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID = () =>
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

export function noFaceManifestPublicUrl() {
  return `${galleryR2BaseUrl()}/${NO_FACE_MANIFEST_KEY}`;
}

function emptyManifest(): NoFaceManifest {
  return { updatedAt: "", photos: [], version: 2 };
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

async function listPrefixKeys(client: S3Client, prefix: string) {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET(),
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

async function readManifestFromR2(client: S3Client): Promise<NoFaceManifest> {
  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: BUCKET(), Key: NO_FACE_MANIFEST_KEY }),
    );
    const text = await obj.Body?.transformToString("utf8");
    if (!text) return emptyManifest();
    const data = JSON.parse(text) as NoFaceManifest;
    return {
      updatedAt: data.updatedAt || "",
      photos: Array.isArray(data.photos) ? data.photos : [],
      version: data.version,
    };
  } catch {
    return emptyManifest();
  }
}

async function writeManifestToR2(client: S3Client, manifest: NoFaceManifest) {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: NO_FACE_MANIFEST_KEY,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    }),
  );
}

async function bytesForDetect(url: string) {
  const sharp = (await import("sharp")).default;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength <= MAX_DETECT_BYTES) return raw;

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
    if (compressed.byteLength <= MAX_DETECT_BYTES) return compressed;
    maxSide = Math.max(960, Math.round(maxSide * 0.82));
    quality = Math.max(55, quality - 8);
  }
  throw new Error("Image trop lourde pour DetectFaces");
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()),
  );
  return results;
}

function sortPhotos(photos: NoFacePhotoRef[]) {
  return [...photos].sort((a, b) =>
    `${a.albumId}/${a.filename}`.localeCompare(`${b.albumId}/${b.filename}`),
  );
}

/**
 * Fusionne des photos confirmées sans visage (ex. fin d’index).
 * Retire aussi de l’album tout fichier désormais indexé (donc avec visage).
 */
export async function mergeConfirmedNoFacePhotos(
  albumId: string,
  confirmedFilenames: string[],
): Promise<NoFaceManifest> {
  const client = r2ClientOrNull();
  if (!client) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants.");
  }

  const { externalIdFor, listIndexedExternalIds } = await import("@/lib/galerie/rekognition");
  const indexed = await listIndexedExternalIds();
  const existing = await readManifestFromR2(client);

  const keptOther = existing.photos.filter((photo) => photo.albumId !== albumId);
  const previousAlbum = existing.photos.filter((photo) => photo.albumId === albumId);

  const albumPhotos = new Map<string, NoFacePhotoRef>();
  for (const photo of previousAlbum) {
    if (indexed.has(externalIdFor(photo.albumId, photo.filename))) continue;
    albumPhotos.set(photo.filename, photo);
  }
  for (const filename of confirmedFilenames) {
    if (indexed.has(externalIdFor(albumId, filename))) continue;
    albumPhotos.set(filename, { albumId, filename });
  }

  const manifest: NoFaceManifest = {
    updatedAt: new Date().toISOString(),
    version: 2,
    photos: sortPhotos([...keptOther, ...albumPhotos.values()]),
  };

  await writeManifestToR2(client, manifest);
  globalForNoFace.galerieNoFace = { at: Date.now(), manifest };
  return manifest;
}

/**
 * Recalcule Ambiance : uniquement les JPEG R2 non indexés
 * pour lesquels DetectFaces confirme 0 visage.
 */
export async function rebuildNoFaceManifest(options?: {
  albumId?: string;
  onProgress?: (done: number, total: number, filename: string) => void;
}): Promise<NoFaceManifest> {
  const client = r2ClientOrNull();
  if (!client) {
    throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquants.");
  }

  const albumFilter = options?.albumId;
  const albums = albumFilter
    ? galleryAlbums.filter((album) => album.id === albumFilter)
    : [...galleryAlbums];

  if (albumFilter && albums.length === 0) {
    throw new Error(`Album inconnu: ${albumFilter}`);
  }

  const { externalIdFor, imageHasAnyFace, listIndexedExternalIds } = await import(
    "@/lib/galerie/rekognition"
  );
  const indexed = await listIndexedExternalIds();
  const existing = albumFilter ? await readManifestFromR2(client) : emptyManifest();
  const kept = albumFilter
    ? existing.photos.filter((photo) => photo.albumId !== albumFilter)
    : [];

  type Candidate = { albumId: string; filename: string; url: string };
  const candidates: Candidate[] = [];

  for (const album of albums) {
    const prefix = album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
    const keys = await listPrefixKeys(client, prefix);
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const filename = key.slice(prefix.length);
      if (!filename || filename.includes("/")) continue;
      if (!/\.jpe?g$/i.test(filename)) continue;
      if (indexed.has(externalIdFor(album.id, filename))) continue;
      candidates.push({
        albumId: album.id,
        filename,
        url: photoPublicUrl(album, filename),
      });
    }
  }

  const found: NoFacePhotoRef[] = [];
  let done = 0;

  await mapPool(candidates, DETECT_CONCURRENCY, async (candidate) => {
    done += 1;
    options?.onProgress?.(done, candidates.length, candidate.filename);
    try {
      const bytes = await bytesForDetect(candidate.url);
      const hasFace = await imageHasAnyFace(bytes);
      if (!hasFace) {
        found.push({ albumId: candidate.albumId, filename: candidate.filename });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  · skip ${candidate.albumId}/${candidate.filename}: ${message}`);
    }
  });

  const manifest: NoFaceManifest = {
    updatedAt: new Date().toISOString(),
    version: 2,
    photos: sortPhotos([...kept, ...found]),
  };

  await writeManifestToR2(client, manifest);
  globalForNoFace.galerieNoFace = { at: Date.now(), manifest };
  return manifest;
}

async function fetchPublicManifest(): Promise<NoFaceManifest> {
  try {
    const response = await fetch(noFaceManifestPublicUrl(), { cache: "no-store" });
    if (!response.ok) return emptyManifest();
    const data = (await response.json()) as NoFaceManifest;
    return {
      updatedAt: data.updatedAt || "",
      photos: Array.isArray(data.photos) ? data.photos : [],
      version: data.version,
    };
  } catch {
    return emptyManifest();
  }
}

/** Retire du manifeste les photos qui ont (enfin) un visage indexé. */
async function sanitizeManifest(manifest: NoFaceManifest): Promise<NoFaceManifest> {
  if (manifest.photos.length === 0) return manifest;
  try {
    const { externalIdFor, listIndexedExternalIds } = await import("@/lib/galerie/rekognition");
    const indexed = await listIndexedExternalIds();
    const photos = manifest.photos.filter(
      (photo) => !indexed.has(externalIdFor(photo.albumId, photo.filename)),
    );
    if (photos.length === manifest.photos.length) return manifest;
    return { ...manifest, photos };
  } catch {
    return manifest;
  }
}

/**
 * Charge le manifeste public. Ne reconstruit plus avec l’heuristique
 * « non indexé = sans visage » (qui mélangeait les photos avec visage).
 * La reconstruction précise se fait via index / `galerie:no-face`.
 */
export async function ensureNoFaceManifest(): Promise<NoFaceManifest> {
  const cached = globalForNoFace.galerieNoFace;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.manifest;
  }

  const publicManifest = await fetchPublicManifest();
  const sanitized = await sanitizeManifest(publicManifest);
  globalForNoFace.galerieNoFace = { at: Date.now(), manifest: sanitized };
  return sanitized;
}

export async function loadNoFaceManifest(): Promise<NoFaceManifest> {
  return ensureNoFaceManifest();
}

function noFaceImages(manifest: NoFaceManifest): GalleryImage[] {
  const photos: GalleryImage[] = [];
  const seen = new Set<string>();

  for (const entry of manifest.photos) {
    const album = albumById(entry.albumId);
    if (!album || !entry.filename) continue;
    const src = photoPublicUrl(album, entry.filename);
    if (seen.has(src)) continue;
    seen.add(src);
    photos.push({
      src,
      alt: `${album.title} — ${entry.filename}`,
      albumId: album.id as GalleryAlbumId,
    });
  }

  return photos;
}

/** Ajoute l’album Ambiance (photos sans visage confirmées) à chaque résultat de scan. */
export async function withAmbianceAlbum(albums: MatchedAlbum[]): Promise<MatchedAlbum[]> {
  const manifest = await ensureNoFaceManifest();
  // Ignore l’ancien manifeste v1 (R2 − index) qui contenait des photos avec visage.
  if ((manifest.version ?? 1) < 2) return albums;

  const photos = noFaceImages(manifest);
  if (photos.length === 0) return albums;

  const withoutAmbiance = albums.filter((album) => album.id !== ambianceAlbumMeta.id);
  return [
    ...withoutAmbiance,
    {
      id: ambianceAlbumMeta.id as GalleryAlbumId,
      title: ambianceAlbumMeta.title,
      cover: photos[0]?.src || ambianceAlbumMeta.cover,
      photos,
    },
  ];
}
