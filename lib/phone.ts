/** Nettoie et normalise en E.164 léger : chiffres avec préfixe +. */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/\+/g, "");

  if (!digits) return "";

  // 00243… → 243…
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  return `+${digits}`;
}

/** Variantes pour retrouver un numéro en base (avec ou sans +). */
export function phoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const withoutPlus = normalized.slice(1);
  return [...new Set([normalized, withoutPlus])];
}
