export const galleryPath = "/galerie" as const;

const DEFAULT_R2_BASE =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev";

export function galleryR2BaseUrl() {
  return (
    process.env.NEXT_PUBLIC_GALERIE_BASE_URL?.trim().replace(/\/$/, "") ||
    DEFAULT_R2_BASE
  );
}

export type GalleryAlbum = {
  id: string;
  title: string;
  /** Préfixe R2 dans le bucket mariage, ex. "albums/coutumier/" */
  prefix: string;
  /** Image de couverture (URL absolue ou chemin local) */
  cover: string;
};

/**
 * Tous les dossiers R2 physiques (upload / index / URL).
 * Les albums « secondaires » sont fusionnés à l’affichage via `galleryAlbumMerge`.
 */
export const galleryAlbumFolders = [
  {
    id: "coutumier",
    title: "Coutumier",
    prefix: "albums/coutumier/",
    cover: "/img/5.jpg",
  },
] as const satisfies readonly GalleryAlbum[];

/**
 * Fusion affichage scan : id source → id album visible.
 * Les photos restent dans leur dossier R2 ; seul le regroupement UI change.
 */
export const galleryAlbumMerge: Record<string, string> = {};

const MERGED_AWAY = new Set(
  Object.entries(galleryAlbumMerge)
    .filter(([source, canonical]) => source !== canonical)
    .map(([source]) => source),
);

/**
 * Dossiers R2 copiés à l’identique : ignorés au scan et à la réindexation.
 * id doublon → id du dossier conservé.
 */
export const galleryDuplicateAlbums: Record<string, string> = {};

/** Albums visibles après scan (fusion appliquée). */
export const galleryAlbums = galleryAlbumFolders.filter(
  (album) => !MERGED_AWAY.has(album.id),
);

/** @deprecated Alias — préférer galleryAlbumFolders pour upload/index. */
export const galleryAlbumsAll = galleryAlbumFolders;

export type GalleryAlbumId =
  | (typeof galleryAlbumFolders)[number]["id"]
  | "ambiance";

export type GalleryImage = {
  src: string;
  alt: string;
  albumId: GalleryAlbumId;
};

export type MatchedAlbum = {
  id: GalleryAlbumId;
  title: string;
  cover: string;
  photos: GalleryImage[];
};

/** Mur d’accueil (teaser) — pas les albums complets. */
export const galleryWallImages = [
  { src: "/img/5.jpg", alt: "Nathan et Innocente" },
  { src: "/img/1001.jpg", alt: "Nathan et Innocente" },
  { src: "/img/04.jpg", alt: "Nathan et Innocente" },
  { src: "/img/3.jpg", alt: "Nathan et Innocente" },
  { src: "/img/02.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--30.jpg", alt: "Nathan et Innocente" },
  { src: "/img/2.jpg", alt: "Nathan et Innocente" },
  { src: "/img/4.jpg", alt: "Nathan et Innocente" },
  { src: "/img/08.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LUK_0750.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5173.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5174.jpg", alt: "Nathan et Innocente" },
  { src: "/img/0T8A5252.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--27.jpg", alt: "Nathan et Innocente" },
  { src: "/img/03.jpg", alt: "Nathan et Innocente" },
  { src: "/img/05.jpg", alt: "Nathan et Innocente" },
  { src: "/img/06.jpg", alt: "Nathan et Innocente" },
  { src: "/img/LAB3-A-26--28%202.jpg", alt: "Nathan et Innocente" },
] as const;

/** @deprecated Utiliser galleryWallImages — conservé pour imports legacy. */
export const galleryImages = galleryWallImages;

/**
 * Nom de fichier tel que stocké sur R2 et dans l’ExternalImageId Rekognition.
 * Les deux doivent coïncider, sinon la photo trouvée au scan renvoie un 404.
 */
export function safeGalleryFilename(filename: string) {
  return filename
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.\-]/g, "-")
    .slice(0, 200);
}

/** Dossier R2 physique (upload / index / URL). */
export function albumById(id: string) {
  return galleryAlbumFolders.find((album) => album.id === id);
}

/** Album affiché après fusion (civil, soiree, …). */
export function displayAlbumById(id: string) {
  const canonical = canonicalAlbumId(id);
  return galleryAlbums.find((album) => album.id === canonical);
}

export function canonicalAlbumId(id: string): string {
  return galleryAlbumMerge[id] ?? id;
}

export function albumByPrefix(prefix: string) {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  return galleryAlbumFolders.find((album) => album.prefix === normalized);
}

export function photoPublicUrl(album: GalleryAlbum, filename: string) {
  const key = `${album.prefix}${filename}`.replace(/\/{2,}/g, "/");
  return `${galleryR2BaseUrl()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
