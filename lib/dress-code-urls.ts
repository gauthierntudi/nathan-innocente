import type { CeremonyId } from "@/lib/admin/ceremony-types";

const DEFAULT_BASE_URL =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev/dresscode";

const DRESS_CODE_BASE_URL = (
  process.env.NEXT_PUBLIC_DRESS_CODE_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

const DRESS_CODE_FILE_BY_CEREMONY: Record<CeremonyId, string> = {
  coutumier:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_COUTUMIER ?? "I&N-Dress-code-Coutumier.pdf",
  civile:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_CIVILE ?? "I&N-Dress-code-Civile.pdf",
  religieux:
    process.env.NEXT_PUBLIC_DRESS_CODE_FILE_RELIGIEUX ?? "I&N-Dress-code-Religieux.pdf",
};

const DEFAULT_DRESS_CODE_FILE =
  process.env.NEXT_PUBLIC_DRESS_CODE_FILE_DEFAULT ?? "I&N-Dress-code-Coutumier.pdf";

export function getDressCodeFilename(ceremonyId?: CeremonyId | null): string {
  if (ceremonyId) {
    return DRESS_CODE_FILE_BY_CEREMONY[ceremonyId];
  }

  return DEFAULT_DRESS_CODE_FILE;
}

export function buildDressCodeUrl(filename: string): string {
  const cleanFilename = filename.replace(/^\//, "");
  return `${DRESS_CODE_BASE_URL}/${encodeURIComponent(cleanFilename)}`;
}

export function getGuestDressCodeDownloadUrl(
  ceremonies: Array<{ id: CeremonyId }>,
): string {
  if (ceremonies.length === 1) {
    return buildDressCodeUrl(DRESS_CODE_FILE_BY_CEREMONY[ceremonies[0].id]);
  }

  return buildDressCodeUrl(DEFAULT_DRESS_CODE_FILE);
}

export function getCeremonyDressCodeDownloadUrl(ceremonyId: CeremonyId): string {
  return buildDressCodeUrl(DRESS_CODE_FILE_BY_CEREMONY[ceremonyId]);
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
