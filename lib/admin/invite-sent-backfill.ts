import {
  hasSuccessfulInviteDelivery,
  isFailedInviteDelivery,
} from "@/lib/admin/invite-delivery";

/** Signaux qu’un invité a déjà été contacté (RSVP, scan, dress code, etc.). */
export type GuestContactSignals = {
  deviceId?: string | null;
  availability?: boolean | null;
  statusReminderSent?: boolean;
  dressCodeDownloadedAt?: Date | null;
  inviteMessageSid?: string | null;
  inviteDeliveryStatus?: string | null;
  passCheckedInAt?: Date | null;
  guestCeremonies?: Array<{
    availability?: boolean | null;
    checkedInAt?: Date | null;
    dressCodeDownloadedAt?: Date | null;
    passSentAt?: Date | null;
    respondedAt?: Date | null;
  }>;
};

/**
 * Indique si l’invité a déjà interagi ou reçu un message avant le reset plan de table.
 * Utilisé pour le rattrapage `statusSend` et pour ne pas réinitialiser à l’affectation table.
 */
export function guestWasAlreadyContacted(guest: GuestContactSignals): boolean {
  if (
    guest.inviteMessageSid &&
    !isFailedInviteDelivery(guest.inviteDeliveryStatus)
  ) {
    return true;
  }
  if (hasSuccessfulInviteDelivery(guest.inviteDeliveryStatus)) return true;
  if (guest.statusReminderSent) return true;
  if (guest.deviceId) return true;
  if (guest.availability !== null && guest.availability !== undefined) return true;
  if (guest.dressCodeDownloadedAt) return true;
  if (guest.passCheckedInAt) return true;

  for (const ceremony of guest.guestCeremonies ?? []) {
    if (ceremony.availability !== null && ceremony.availability !== undefined) {
      return true;
    }
    if (ceremony.checkedInAt) return true;
    if (ceremony.dressCodeDownloadedAt) return true;
    if (ceremony.passSentAt) return true;
    if (ceremony.respondedAt) return true;
  }

  return false;
}

/** Invité déjà marqué « invitation envoyée » (statut message / Twilio / rappel). */
export function guestAlreadyMarkedInvited(guest: {
  statusSend?: boolean;
  inviteMessageSid?: string | null;
  inviteDeliveryStatus?: string | null;
  statusReminderSent?: boolean;
}): boolean {
  if (isFailedInviteDelivery(guest.inviteDeliveryStatus)) return false;

  return Boolean(
    guest.statusSend ||
      guest.inviteMessageSid ||
      guest.statusReminderSent ||
      hasSuccessfulInviteDelivery(guest.inviteDeliveryStatus),
  );
}
