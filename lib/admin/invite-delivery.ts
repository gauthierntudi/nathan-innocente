export const FAILED_INVITE_STATUSES = new Set(["failed", "undelivered"]);

export function isFailedInviteDelivery(status?: string | null) {
  return Boolean(status && FAILED_INVITE_STATUSES.has(status));
}

export function inviteDeliveryLabel(status?: string | null) {
  switch (status) {
    case "queued":
    case "accepted":
    case "sending":
      return "En cours";
    case "sent":
      return "Envoyé";
    case "delivered":
      return "Délivré";
    case "read":
      return "Lu";
    case "undelivered":
      return "Non délivré";
    case "failed":
      return "Échec";
    case "canceled":
    case "cancelled":
      return "Annulé";
    default:
      return status ? status : null;
  }
}

const TWILIO_ERROR_LABELS: Record<string, string> = {
  "21211": "Numéro invalide",
  "21408": "Permission d'envoyer vers ce pays manquante",
  "21610": "Destinataire désabonné",
  "21614": "Ce n'est pas un numéro mobile",
  "30003": "Injoignable",
  "30004": "Message bloqué",
  "30005": "Destination inconnue",
  "30006": "Ligne fixe ou injoignable",
  "30007": "Message filtré",
  "30008": "Erreur inconnue côté opérateur",
  "63003": "WhatsApp : destinataire introuvable",
  "63005": "WhatsApp : numéro non autorisé",
  "63007": "WhatsApp : envoi impossible",
  "63016": "Hors fenêtre de conversation 24 h",
  "63019": "Template WhatsApp introuvable",
  "63024": "Ce numéro n'a pas WhatsApp",
  "63032": "Limite d'envoi atteinte",
  "63049": "Meta bloque les messages marketing vers les USA",
};

export function inviteErrorLabel(
  errorCode?: string | number | null,
  errorMessage?: string | null,
) {
  const code = errorCode == null ? "" : String(errorCode);
  const mapped = code ? TWILIO_ERROR_LABELS[code] : null;
  if (mapped) return code ? `${mapped} (${code})` : mapped;
  if (errorMessage?.trim()) {
    return code ? `${errorMessage.trim()} (${code})` : errorMessage.trim();
  }
  return code ? `Erreur Twilio ${code}` : null;
}
