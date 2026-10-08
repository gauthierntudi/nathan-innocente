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
  /** Préfixe R2 dans le bucket mariage, ex. "galeries/" */
  prefix: string;
  /** Image de couverture (URL absolue ou chemin local) */
  cover: string;
};

/** Albums du bucket mariage — ajouter une entrée pour chaque nouveau dossier. */
export const galleryAlbums = [
  {
    id: "civil",
    title: "Mariage Civil",
    prefix: "galeries/",
    cover: "/img/5.jpg",
  },
  {
    id: "eglise",
    title: "Eglise",
    prefix: "galeries-2/",
    cover: "/img/1001.jpg",
  },
  {
    id: "soiree",
    title: "Soirée",
    prefix: "galeries-3/",
    cover: "/img/08.jpg",
  },
  {
    id: "pre-dot",
    title: "Pré-dot",
    prefix: "galeries-4/",
    cover: "/img/LUK_0750.jpg",
  },
] as const satisfies readonly GalleryAlbum[];

export type GalleryAlbumId = (typeof galleryAlbums)[number]["id"];

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

export function albumById(id: string) {
  return galleryAlbums.find((album) => album.id === id);
}

export function albumByPrefix(prefix: string) {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/?$/, "/");
  return galleryAlbums.find((album) => album.prefix === normalized);
}

export function photoPublicUrl(album: GalleryAlbum, filename: string) {
  const key = `${album.prefix}${filename}`.replace(/\/{2,}/g, "/");
  return `${galleryR2BaseUrl()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
