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
};

const globalForNoFace = globalThis as typeof globalThis & {
  galerieNoFace?: { at: number; manifest: NoFaceManifest };
  galerieNoFaceBuilding?: Promise<NoFaceManifest>;
};

const CACHE_MS = 10 * 60_000;
const STALE_MS = 24 * 60 * 60_000;

const BUCKET = () => process.env.R2_BUCKET?.trim() || "mariage";
const ACCOUNT_ID = () =>
  process.env.R2_ACCOUNT_ID?.trim() ||
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
  "2db1464f25a468e66bd514b16785ecee";

export function noFaceManifestPublicUrl() {
  return `${galleryR2BaseUrl()}/${NO_FACE_MANIFEST_KEY}`;
}

function emptyManifest(): NoFaceManifest {
  return { updatedAt: "", photos: [] };
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

/**
 * Recalcule les photos R2 absentes de Rekognition (= sans visage indexé).
 * albumId optionnel : ne met à jour que cet album dans le manifeste.
 */
export async function rebuildNoFaceManifest(options?: {
  albumId?: string;
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

  // Import dynamique pour éviter une dépendance circulaire avec rekognition.ts
  const { externalIdFor, listIndexedExternalIds } = await import("@/lib/galerie/rekognition");
  const indexed = await listIndexedExternalIds();
  const existing = albumFilter ? await readManifestFromR2(client) : emptyManifest();
  const kept = albumFilter
    ? existing.photos.filter((photo) => photo.albumId !== albumFilter)
    : [];

  const found: NoFacePhotoRef[] = [];
  for (const album of albums) {
    const prefix = album.prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
    const keys = await listPrefixKeys(client, prefix);
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const filename = key.slice(prefix.length);
      if (!filename || filename.includes("/")) continue;
      if (!/\.jpe?g$/i.test(filename)) continue;
      if (indexed.has(externalIdFor(album.id, filename))) continue;
      found.push({ albumId: album.id, filename });
    }
  }

  const photos = [...kept, ...found].sort((a, b) =>
    `${a.albumId}/${a.filename}`.localeCompare(`${b.albumId}/${b.filename}`),
  );

  const manifest: NoFaceManifest = {
    updatedAt: new Date().toISOString(),
    photos,
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
    };
  } catch {
    return emptyManifest();
  }
}

function isStale(manifest: NoFaceManifest) {
  if (!manifest.updatedAt || manifest.photos.length === 0) return true;
  const updated = Date.parse(manifest.updatedAt);
  if (!Number.isFinite(updated)) return true;
  return Date.now() - updated > STALE_MS;
}

/**
 * Charge le manifeste ; le reconstruit automatiquement s’il est vide / obsolète.
 */
export async function ensureNoFaceManifest(): Promise<NoFaceManifest> {
  const cached = globalForNoFace.galerieNoFace;
  if (cached && Date.now() - cached.at < CACHE_MS && cached.manifest.photos.length > 0) {
    return cached.manifest;
  }

  const publicManifest = await fetchPublicManifest();
  if (!isStale(publicManifest)) {
    globalForNoFace.galerieNoFace = { at: Date.now(), manifest: publicManifest };
    return publicManifest;
  }

  if (globalForNoFace.galerieNoFaceBuilding) {
    return globalForNoFace.galerieNoFaceBuilding;
  }

  if (!r2ClientOrNull()) {
    globalForNoFace.galerieNoFace = { at: Date.now(), manifest: publicManifest };
    return publicManifest;
  }

  globalForNoFace.galerieNoFaceBuilding = rebuildNoFaceManifest()
    .catch((error) => {
      console.error("[galerie] rebuild no-face impossible", error);
      return publicManifest;
    })
    .finally(() => {
      globalForNoFace.galerieNoFaceBuilding = undefined;
    });

  return globalForNoFace.galerieNoFaceBuilding;
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

/** Ajoute l’album Ambiance (photos sans visage) à chaque résultat de scan. */
export async function withAmbianceAlbum(albums: MatchedAlbum[]): Promise<MatchedAlbum[]> {
  const manifest = await ensureNoFaceManifest();
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
