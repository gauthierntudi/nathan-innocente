export const GUEST_TYPES = ["standard", "honor"] as const;
export type GuestType = (typeof GUEST_TYPES)[number];

export const GUEST_TYPE_LABELS: Record<GuestType, string> = {
  standard: "Standard",
  honor: "Invité d'honneur",
};

export function isGuestType(value: unknown): value is GuestType {
  return (
    typeof value === "string" &&
    (GUEST_TYPES as readonly string[]).includes(value)
  );
}

/** Parse CSV / formulaire : standard | honor | honneur | invité d'honneur… */
export function parseGuestType(value: unknown): GuestType {
  if (isGuestType(value)) return value;
  if (typeof value !== "string") return "standard";

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (
    !normalized ||
    normalized === "standard" || normalized === "normal" ||
    normalized === "invite" ||
    normalized === "guest"
  ) {
    return "standard";
  }

  if (
    normalized === "honor" ||
    normalized === "honneur" ||
    normalized === "honneurs" ||
    normalized.includes("honneur") ||
    normalized.includes("honor")
  ) {
    return "honor";
  }

  return "standard";
}
