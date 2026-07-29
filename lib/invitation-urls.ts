import type { CeremonyId } from "@/lib/admin/ceremony-types";

const DEFAULT_BASE_URL =
  "https://pub-5ff2b676c3a745bb957c2e00cc6690d6.r2.dev/invitations";

const INVITATION_BASE_URL = (
  process.env.NEXT_PUBLIC_INVITATION_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

/** PDF invitation par cérémonie (dossier mariage/invitations sur R2). */
const INVITATION_FILE_BY_CEREMONY: Partial<Record<CeremonyId, string>> = {
  coutumier:
    process.env.NEXT_PUBLIC_INVITATION_FILE_COUTUMIER ??
    "invitation-coutumier.pdf",
  civile:
    process.env.NEXT_PUBLIC_INVITATION_FILE_CIVILE ?? "invitation-civil.pdf",
  religieux:
    process.env.NEXT_PUBLIC_INVITATION_FILE_RELIGIEUX ??
    "invitation-religieux.pdf",
};

export function hasInvitationPdf(ceremonyId: CeremonyId): boolean {
  return Boolean(INVITATION_FILE_BY_CEREMONY[ceremonyId]);
}

export function getInvitationFilename(
  ceremonyId: CeremonyId,
): string | null {
  return INVITATION_FILE_BY_CEREMONY[ceremonyId] ?? null;
}

export function buildInvitationUrl(filename: string): string {
  const cleanFilename = filename.replace(/^\//, "");
  return `${INVITATION_BASE_URL}/${encodeURIComponent(cleanFilename)}`;
}

export function getCeremonyInvitationUrl(
  ceremonyId: CeremonyId,
): string | null {
  const filename = getInvitationFilename(ceremonyId);
  if (!filename) return null;
  return buildInvitationUrl(filename);
}

export function getInvitationDownloadPath(
  ceremonyId: CeremonyId,
  options: { view?: boolean } = {},
): string | null {
  if (!hasInvitationPdf(ceremonyId)) return null;

  const params = new URLSearchParams({ ceremonyId });
  if (options.view) params.set("view", "1");
  return `/api/invitation/download?${params.toString()}`;
}
