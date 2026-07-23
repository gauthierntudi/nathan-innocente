import type { CeremonyId } from "@/lib/admin/ceremony-types";

const DEFAULT_BASE_URL =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev/dresscode";

const DRESS_CODE_BASE_URL = (
  process.env.NEXT_PUBLIC_DRESS_CODE_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

/** Dress code standard (tous les invités). */
const DRESS_CODE_FILE_BY_CEREMONY: Record<CeremonyId, string> = {
  coutumier:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_COUTUMIER ??
    "I&N-Dress-code-Coutumier.pdf",
  civile:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_CIVILE ?? "I&N-Dress-code-Civile.pdf",
  religieux:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_RELIGIEUX ??
    "I&N-Dress-code-Religieux.pdf",
};

/**
 * Dress code invités d'honneur (affectés à plus d'une cérémonie).
 * Coutumier : même fichier pour tous.
 */
const HONOR_DRESS_CODE_FILE_BY_CEREMONY: Partial<Record<CeremonyId, string>> = {
  civile:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_CIVILE_HONOR ??
    "invite-honneur-dress-code-civil.pdf",
  religieux:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_RELIGIEUX_HONOR ??
    "invite-honneur-dress-code-religieux.pdf",
};

const DEFAULT_DRESS_CODE_FILE =
  process.env.NEXT_PUBLIC_DRESS_CODE_FILE_DEFAULT ??
  "I&N-Dress-code-Coutumier.pdf";

export type DressCodeOptions = {
  /** Invité affecté à plus d'une cérémonie. */
  honorGuest?: boolean;
};

export function isHonorDressCodeCeremony(ceremonyId: CeremonyId): boolean {
  return ceremonyId === "civile" || ceremonyId === "religieux";
}

export function getDressCodeFilename(
  ceremonyId?: CeremonyId | null,
  options: DressCodeOptions = {},
): string {
  if (!ceremonyId) {
    return DEFAULT_DRESS_CODE_FILE;
  }

  if (
    options.honorGuest &&
    isHonorDressCodeCeremony(ceremonyId) &&
    HONOR_DRESS_CODE_FILE_BY_CEREMONY[ceremonyId]
  ) {
    return HONOR_DRESS_CODE_FILE_BY_CEREMONY[ceremonyId]!;
  }

  return DRESS_CODE_FILE_BY_CEREMONY[ceremonyId];
}

export function buildDressCodeUrl(filename: string): string {
  const cleanFilename = filename.replace(/^\//, "");
  return `${DRESS_CODE_BASE_URL}/${encodeURIComponent(cleanFilename)}`;
}

export function getCeremonyDressCodeDownloadUrl(
  ceremonyId: CeremonyId,
  options: DressCodeOptions = {},
): string {
  return buildDressCodeUrl(getDressCodeFilename(ceremonyId, options));
}

export function getGuestDressCodeDownloadUrl(
  ceremonies: Array<{ id: CeremonyId }>,
  options: DressCodeOptions = {},
): string {
  if (ceremonies.length === 1) {
    return getCeremonyDressCodeDownloadUrl(ceremonies[0].id, options);
  }

  return buildDressCodeUrl(DEFAULT_DRESS_CODE_FILE);
}

export function getDressCodeDownloadPath(
  ceremonies: Array<{ id: CeremonyId }>,
): string {
  if (ceremonies.length === 1) {
    return `/api/dress-code/download?ceremonyId=${ceremonies[0].id}`;
  }

  return "/api/dress-code/download";
}

export function buildContentDispositionAttachment(filename: string): string {
  const asciiFallback = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
