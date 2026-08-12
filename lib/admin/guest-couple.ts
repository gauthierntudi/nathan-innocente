/**
 * Détecte les libellés couple pour forcer 2 convives sur les cérémonies.
 *
 * Exemples :
 * - Couple Joel LOHOMBO
 * - Me & Mme KALONJI
 * - Mr & Mme DUPONT
 * - Jean & Marie
 */

export function isCoupleGuestName(name: string): boolean {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;

  if (/\bcouple\b/.test(normalized)) return true;

  // Me & Mme, Mr & Mme, Mme & Mr, Monsieur & Madame, etc.
  if (
    /\b(me|mr|mme|m|monsieur|madame)\b\s*(&|et)\s*\b(me|mr|mme|m|monsieur|madame)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  // name1 & name2 / name1 et name2
  const parts = normalized.split(/\s*(?:&| et )\s*/).map((part) => part.trim());
  if (parts.length === 2) {
    const [left, right] = parts;
    if (
      left.length >= 2 &&
      right.length >= 2 &&
      /[a-z]{2,}/.test(left) &&
      /[a-z]{2,}/.test(right)
    ) {
      return true;
    }
  }

  return false;
}

/** Si le nom est un couple et que le total demandé est < 2 → 2. */
export function resolveNumGuestsForGuestName(name: string, numGuests: number) {
  const base =
    Number.isFinite(numGuests) && numGuests >= 1 ? Math.floor(numGuests) : 1;
  if (isCoupleGuestName(name) && base < 2) return 2;
  return Math.min(50, base);
}
