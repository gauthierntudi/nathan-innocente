"use client";

import { useMemo, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  canSendInvitation,
  canSendReminder,
  canResendConfirmation,
  getConfirmedCeremonyStatuses,
  getInvitationCeremonyStatuses,
  hasPendingInvitationResponse,
  type AdminGuest,
} from "@/lib/admin/types";
import { guestMatchesSearch } from "@/lib/admin/guest-search";
import {
  inviteDeliveryLabel,
  isFailedInviteDelivery,
} from "@/lib/admin/invite-delivery";

type MessagesFilter =
  | "all"
  | "pending_invite"
  | "invite_sent"
  | "reminder"
  | "confirmed"
  | "invite_failed";

const SELECTION_BATCH_SIZE = 25;

type BulkConfirm =
  | { type: "invite"; recipients: AdminGuest[] }
  | { type: "reminder"; recipients: AdminGuest[] }
  | { type: "reminder_resend"; recipients: AdminGuest[] }
  | { type: "confirm"; recipients: AdminGuest[] };

type MessagesSectionProps = {
  guests: AdminGuest[];
  busy: boolean;
  setBusyState: (state: AdminBusyState) => void;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
};

function ceremonyShortLabel(ceremonyId: CeremonyId) {
  const def = CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId);
  return def?.name.replace(/^Cérémonie\s+/i, "").replace(/^Mariage\s+/i, "") ?? ceremonyId;
}

function invitationCeremonyLabels(guest: AdminGuest) {
  return getInvitationCeremonyStatuses(guest).map((status) =>
    ceremonyShortLabel(status.ceremonyId),
  );
}

function confirmedCeremonyLabels(guest: AdminGuest) {
  return getConfirmedCeremonyStatuses(guest).map((status) =>
    ceremonyShortLabel(status.ceremonyId),
  );
}

function confirmationMessageCount(guest: AdminGuest) {
  const confirmed = getConfirmedCeremonyStatuses(guest).length;
  if (confirmed > 0) return confirmed;
  return guest.availability === true ? 1 : 0;
}

function canResendReminder(guest: AdminGuest) {
  return (
    Boolean(guest.invitationEnabled) &&
    guest.statusSend &&
    hasPendingInvitationResponse(guest)
  );
}

export function MessagesSection({
  guests,
  busy,
  setBusyState,
  onMessage,
  onRefresh,
}: MessagesSectionProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MessagesFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminGuest | null>(null);

  const messageGuests = useMemo(
    () =>
      guests.filter(
        (guest) => guest.invitationEnabled && !guest.phoneFictitious,
      ),
    [guests],
  );

  const stats = useMemo(() => {
    const pendingInvite = messageGuests.filter((guest) => canSendInvitation(guest));
    const inviteSent = messageGuests.filter((guest) => guest.statusSend);
    const reminderReady = messageGuests.filter((guest) => canSendReminder(guest));
    const confirmed = guests.filter((guest) => canResendConfirmation(guest));
    const inviteFailed = messageGuests.filter((guest) =>
      isFailedInviteDelivery(guest.inviteDeliveryStatus),
    );
    return {
      total: messageGuests.length,
      pendingInvite: pendingInvite.length,
      inviteSent: inviteSent.length,
      reminderReady: reminderReady.length,
      confirmed: confirmed.length,
      inviteFailed: inviteFailed.length,
    };
  }, [messageGuests, guests]);

  const filteredGuests = useMemo(() => {
    const source =
      filter === "confirmed"
        ? guests.filter((guest) => canResendConfirmation(guest))
        : messageGuests.filter((guest) => {
            if (filter === "pending_invite") return canSendInvitation(guest);
            if (filter === "invite_sent") return guest.statusSend;
            if (filter === "invite_failed") {
              return isFailedInviteDelivery(guest.inviteDeliveryStatus);
            }
            if (filter === "reminder") return canSendReminder(guest);
            return true;
          });

    return source
      .filter((guest) => guestMatchesSearch(guest, search))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [guests, messageGuests, filter, search]);

  const selectionBatches = useMemo(() => {
    const batches: Array<{
      index: number;
      start: number;
      end: number;
      guests: AdminGuest[];
    }> = [];

    for (let i = 0; i < filteredGuests.length; i += SELECTION_BATCH_SIZE) {
      const guestsInBatch = filteredGuests.slice(i, i + SELECTION_BATCH_SIZE);
      batches.push({
        index: batches.length,
        start: i + 1,
        end: i + guestsInBatch.length,
        guests: guestsInBatch,
      });
    }

    return batches;
  }, [filteredGuests]);

  const activeBatchIndex = useMemo(() => {
    if (selected.size === 0 || selectionBatches.length === 0) return null;

    for (const batch of selectionBatches) {
      if (batch.guests.length === 0) continue;
      const allSelected = batch.guests.every((guest) => selected.has(guest.id));
      const onlyThisBatch =
        allSelected &&
        selected.size === batch.guests.length &&
        batch.guests.every((guest) => selected.has(guest.id));
      if (onlyThisBatch) return batch.index;
    }

    return null;
  }, [selected, selectionBatches]);

  function toggleGuest(guestId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(guestId);
      else next.delete(guestId);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const guest of filteredGuests) {
        if (checked) next.add(guest.id);
        else next.delete(guest.id);
      }
      return next;
    });
  }

  function selectBatch(batchIndex: number) {
    const batch = selectionBatches[batchIndex];
    if (!batch) return;
    setSelected(new Set(batch.guests.map((guest) => guest.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function sendInvite(guest: AdminGuest) {
    setBusyState({
      title: "Envoi WhatsApp",
      variant: "whatsapp",
      detail: `Invitation pour ${guest.name}…`,
    });
    onMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      const data = await response.json();
      onMessage(data.message ?? (data.success ? "Invitation envoyée" : "Erreur"));
      if (data.success) {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(guest.id);
          return next;
        });
        await onRefresh();
      }
    } catch {
      onMessage("Erreur réseau lors de l'envoi.");
    } finally {
      setBusyState(null);
    }
  }

  async function refreshInviteStatus(guest: AdminGuest) {
    setBusyState({
      title: "Statut Twilio",
      detail: `Vérification pour ${guest.name}…`,
    });
    onMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/invite-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      const data = await response.json();
      onMessage(data.message ?? (data.success ? "Statut mis à jour" : "Erreur"));
      if (data.success) await onRefresh();
    } catch {
      onMessage("Erreur réseau lors de la vérification du statut.");
    } finally {
      setBusyState(null);
    }
  }

  async function refreshInviteStatusBulk(
    guestIds: string[],
    allSent = false,
  ) {
    if (!allSent && guestIds.length === 0) {
      onMessage("Aucun invité sélectionné avec un envoi à vérifier.");
      return;
    }
    setBusyState({
      title: "Statuts Twilio",
      variant: "whatsapp",
      detail: allSent
        ? "Recherche des invitations déjà envoyées chez Twilio…"
        : `Vérification de ${guestIds.length} invitation${guestIds.length > 1 ? "s" : ""}…`,
    });
    onMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/invite-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allSent ? { allSent: true } : { guestIds }),
      });
      const data = await response.json();
      onMessage(data.message ?? (data.success ? "Statuts mis à jour" : "Erreur"));
      if (data.success) await onRefresh();
    } catch {
      onMessage("Erreur réseau lors de la vérification des statuts.");
    } finally {
      setBusyState(null);
    }
  }

  async function sendReminder(guest: AdminGuest) {
    setBusyState({
      title: "Envoi du rappel",
      variant: "whatsapp",
      detail: `Rappel pour ${guest.name}…`,
    });
    onMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      const data = await response.json();
      onMessage(data.success ? `Rappel envoyé à ${guest.name}` : data.message);
      if (data.success) {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(guest.id);
          return next;
        });
        await onRefresh();
      }
    } catch {
      onMessage("Erreur réseau lors de l'envoi du rappel.");
    } finally {
      setBusyState(null);
    }
  }

  async function sendConfirmation(guest: AdminGuest) {
    const count = confirmationMessageCount(guest);
    setBusyState({
      title: "Renvoi confirmation",
      variant: "whatsapp",
      detail: `Confirmation pour ${guest.name} (${count} cérémonie${count > 1 ? "s" : ""})…`,
    });
    onMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      const data = await response.json();
      onMessage(
        data.message ??
          (data.success ? "Confirmation renvoyée" : "Erreur"),
      );
      if (data.success) {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(guest.id);
          return next;
        });
        await onRefresh();
      }
    } catch {
      onMessage("Erreur réseau lors du renvoi de confirmation.");
    } finally {
      setBusyState(null);
    }
  }

  function requestBulkConfirmations() {
    const recipients = filteredGuests.filter(
      (guest) => selected.has(guest.id) && canResendConfirmation(guest),
    );
    if (recipients.length === 0) {
      onMessage("Aucun invité sélectionné n'a confirmé (disponible).");
      return;
    }
    setBulkConfirm({ type: "confirm", recipients });
  }

  async function executeBulkConfirmations(recipients: AdminGuest[]) {
    onMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        const count = confirmationMessageCount(guest);
        setBusyState({
          title: "Renvoi confirmation groupé",
          variant: "whatsapp",
          detail: `Confirmation pour ${guest.name} (${count} cérémonie${count > 1 ? "s" : ""})…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }
      }

      onMessage(`Confirmations — Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelected(new Set());
      await onRefresh();
    } finally {
      setBusyState(null);
    }
  }

  function requestBulkInvites() {
    const recipients = filteredGuests.filter(
      (guest) => selected.has(guest.id) && canSendInvitation(guest),
    );
    if (recipients.length === 0) {
      onMessage("Aucun invité sélectionné éligible à l'invitation.");
      return;
    }
    setBulkConfirm({ type: "invite", recipients });
  }

  async function executeBulkInvites(recipients: AdminGuest[]) {
    onMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        setBusyState({
          title: "Envoi WhatsApp groupé",
          variant: "whatsapp",
          detail: `Invitation pour ${guest.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }
      }

      onMessage(`Invitations — Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelected(new Set());
      await onRefresh();
    } finally {
      setBusyState(null);
    }
  }

  function requestBulkReminders() {
    const recipients = filteredGuests.filter(
      (guest) => selected.has(guest.id) && canSendReminder(guest),
    );
    if (recipients.length === 0) {
      onMessage("Aucun invité sélectionné éligible au rappel.");
      return;
    }
    setBulkConfirm({ type: "reminder", recipients });
  }

  function requestBulkResendReminders() {
    const recipients = filteredGuests.filter(
      (guest) => selected.has(guest.id) && canResendReminder(guest),
    );
    if (recipients.length === 0) {
      onMessage("Aucun invité sélectionné éligible au renvoi de rappel.");
      return;
    }
    setBulkConfirm({ type: "reminder_resend", recipients });
  }

  async function executeBulkReminders(recipients: AdminGuest[]) {
    onMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        setBusyState({
          title: "Envoi des rappels",
          variant: "whatsapp",
          detail: `Rappel pour ${guest.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/reminder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }
      }

      onMessage(`Rappels — Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelected(new Set());
      await onRefresh();
    } finally {
      setBusyState(null);
    }
  }

  async function executeBulkResendReminders(recipients: AdminGuest[]) {
    onMessage("");
    let sentCount = 0;
    let failCount = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const guest = recipients[index];
        setBusyState({
          title: "Renvoi des rappels",
          variant: "whatsapp",
          detail: `Rappel pour ${guest.name}…`,
          current: index + 1,
          total: recipients.length,
          sent: sentCount,
          failed: failCount,
        });

        try {
          const response = await fetch("/api/admin/whatsapp/reminder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId: guest.id, force: true }),
          });
          const data = await response.json();
          if (data.success) sentCount += 1;
          else failCount += 1;
        } catch {
          failCount += 1;
        }
      }

      onMessage(`Rappels renvoyés — Envoyés: ${sentCount} | Erreurs: ${failCount}`);
      setSelected(new Set());
      await onRefresh();
    } finally {
      setBusyState(null);
    }
  }

  function confirmBulkAction() {
    if (!bulkConfirm) return;
    const action = bulkConfirm;
    setBulkConfirm(null);
    if (action.type === "invite") {
      void executeBulkInvites(action.recipients);
      return;
    }
    if (action.type === "confirm") {
      void executeBulkConfirmations(action.recipients);
      return;
    }
    if (action.type === "reminder_resend") {
      void executeBulkResendReminders(action.recipients);
      return;
    }
    void executeBulkReminders(action.recipients);
  }

  async function confirmResetMessageStatus() {
    if (!resetTarget) return;
    const guest = resetTarget;
    setResetTarget(null);

    setBusyState({
      title: "Réinitialisation",
      detail: `Reset du statut message de ${guest.name}…`,
    });
    onMessage("");

    try {
      const response = await fetch("/api/admin/whatsapp/message-status/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id }),
      });
      const data = await response.json();
      onMessage(
        data.message ??
          (data.success ? "Statut message réinitialisé" : "Erreur"),
      );
      if (data.success) await onRefresh();
    } catch {
      onMessage("Erreur réseau lors de la réinitialisation.");
    } finally {
      setBusyState(null);
    }
  }

  function canResetMessageStatus(guest: AdminGuest) {
    return guest.statusSend || guest.statusReminderSent;
  }

  const selectedInviteCount = filteredGuests.filter(
    (guest) => selected.has(guest.id) && canSendInvitation(guest),
  ).length;
  const selectedReminderCount = filteredGuests.filter(
    (guest) => selected.has(guest.id) && canSendReminder(guest),
  ).length;
  const selectedResendReminderCount = filteredGuests.filter(
    (guest) => selected.has(guest.id) && canResendReminder(guest),
  ).length;
  const selectedConfirmCount = filteredGuests.filter(
    (guest) => selected.has(guest.id) && canResendConfirmation(guest),
  ).length;
  const selectedConfirmMessages = filteredGuests
    .filter((guest) => selected.has(guest.id) && canResendConfirmation(guest))
    .reduce((sum, guest) => sum + confirmationMessageCount(guest), 0);
  const selectedStatusIds = filteredGuests
    .filter((guest) => selected.has(guest.id) && guest.statusSend)
    .map((guest) => guest.id);

  const bulkCount = bulkConfirm?.recipients.length ?? 0;
  const bulkMessageCount =
    bulkConfirm?.type === "confirm"
      ? bulkConfirm.recipients.reduce(
          (sum, guest) => sum + confirmationMessageCount(guest),
          0,
        )
      : bulkCount;
  const isBulkInvite = bulkConfirm?.type === "invite";
  const isBulkResend = bulkConfirm?.type === "reminder_resend";
  const isBulkConfirm = bulkConfirm?.type === "confirm";

  return (
    <div className="admin-messages">
      <AdminConfirmModal
        open={bulkConfirm !== null}
        busy={busy}
        eyebrow="Messages"
        title={
          isBulkInvite
            ? "Envoyer les invitations ?"
            : isBulkConfirm
              ? "Renvoyer les confirmations ?"
              : isBulkResend
                ? "Renvoyer les rappels ?"
                : "Envoyer les rappels ?"
        }
        description={
          isBulkConfirm ? (
            <>
              Vous allez renvoyer le message de confirmation (disponible)
              à{" "}
              <strong>
                {bulkCount} invité{bulkCount > 1 ? "s" : ""}
              </strong>
              , uniquement pour les cérémonies où ils ont dit oui (
              <strong>
                {bulkMessageCount} message{bulkMessageCount > 1 ? "s" : ""}
              </strong>
              ).
            </>
          ) : (
            <>
              Vous allez envoyer{" "}
              <strong>
                {bulkCount} {isBulkInvite ? "invitation" : "rappel"}
                {bulkCount > 1 ? "s" : ""}
              </strong>{" "}
              WhatsApp aux invités sélectionnés.
            </>
          )
        }
        confirmLabel={
          isBulkInvite
            ? `Envoyer ${bulkCount} invitation${bulkCount > 1 ? "s" : ""}`
            : isBulkConfirm
              ? `Renvoyer ${bulkMessageCount} confirmation${bulkMessageCount > 1 ? "s" : ""}`
              : isBulkResend
                ? `Renvoyer ${bulkCount} rappel${bulkCount > 1 ? "s" : ""}`
                : `Envoyer ${bulkCount} rappel${bulkCount > 1 ? "s" : ""}`
        }
        onClose={() => {
          if (!busy) setBulkConfirm(null);
        }}
        onConfirm={confirmBulkAction}
      />

      <AdminConfirmModal
        open={resetTarget !== null}
        busy={busy}
        eyebrow="Messages"
        title="Réinitialiser le statut message ?"
        description={
          resetTarget ? (
            <>
              Remettre <strong>{resetTarget.name}</strong> en{" "}
              <strong>À inviter</strong>. Les badges Invitation envoyée / Rappel
              envoyé seront effacés (aucun message WhatsApp n&apos;est renvoyé).
            </>
          ) : null
        }
        confirmLabel="Réinitialiser"
        tone="danger"
        onClose={() => {
          if (!busy) setResetTarget(null);
        }}
        onConfirm={() => void confirmResetMessageStatus()}
      />

      <section className="admin-stats admin-stats--five" aria-label="Statistiques messages">
        <article className="admin-stat">
          <div className="admin-stat__label">Invitation activée</div>
          <div className="admin-stat__value">{stats.total}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Invitation à envoyer</div>
          <div className="admin-stat__value">{stats.pendingInvite}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Invitation envoyée</div>
          <div className="admin-stat__value">{stats.inviteSent}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Rappel possible</div>
          <div className="admin-stat__value">{stats.reminderReady}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Confirmés (oui)</div>
          <div className="admin-stat__value">{stats.confirmed}</div>
        </article>
      </section>

      <section className="admin-panel admin-messages__toolbar">
        <div className="admin-messages__filters">
          <label className="admin-messages__search">
            <span className="admin-messages__search-label">Recherche</span>
            <input
              type="search"
              className="admin-input"
              placeholder="Nom, téléphone, cérémonie, groupe…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(new Set());
              }}
            />
          </label>
          <label className="admin-messages__search">
            <span className="admin-messages__search-label">Filtre</span>
            <select
              className="admin-select"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as MessagesFilter);
                setSelected(new Set());
              }}
            >
              <option value="all">Tous (invitation activée)</option>
              <option value="pending_invite">Invitation à envoyer</option>
              <option value="invite_sent">Invitation envoyée</option>
              <option value="invite_failed">Échecs Twilio</option>
              <option value="reminder">Rappel possible</option>
              <option value="confirmed">Confirmés (disponible)</option>
            </select>
          </label>
        </div>

        <div className="admin-messages__actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy || selectedInviteCount === 0}
            onClick={requestBulkInvites}
          >
            Envoyer invitations ({selectedInviteCount})
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--warning"
            disabled={busy || selectedReminderCount === 0}
            onClick={requestBulkReminders}
          >
            Envoyer rappels ({selectedReminderCount})
          </button>
          {selectedResendReminderCount > 0 ? (
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={busy}
              onClick={requestBulkResendReminders}
            >
              Renvoyer rappels ({selectedResendReminderCount})
            </button>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn--success"
            disabled={busy || selectedConfirmCount === 0}
            onClick={requestBulkConfirmations}
          >
            Renvoyer confirmation ({selectedConfirmCount}
            {selectedConfirmMessages > selectedConfirmCount
              ? ` · ${selectedConfirmMessages} msg`
              : ""}
            )
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={busy || stats.inviteSent === 0}
            onClick={() => void refreshInviteStatusBulk([], true)}
          >
            Vérifier toutes les invitations envoyées ({stats.inviteSent})
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={busy || selectedStatusIds.length === 0}
            onClick={() => void refreshInviteStatusBulk(selectedStatusIds)}
          >
            Vérifier la sélection ({selectedStatusIds.length})
          </button>
        </div>

        {selectionBatches.length > 0 ? (
          <div className="admin-messages__batches" aria-label="Sélection par groupes de 25">
            <span className="admin-messages__batches-label">
              Sélectionner par groupe de {SELECTION_BATCH_SIZE}
              {search.trim() || filter !== "all" ? " (résultats filtrés)" : ""}
            </span>
            <div className="admin-messages__batch-list">
              {selectionBatches.map((batch) => {
                const isActive = activeBatchIndex === batch.index;
                return (
                  <button
                    key={batch.index}
                    type="button"
                    className={`admin-btn admin-btn--ghost admin-messages__batch-btn${
                      isActive ? " admin-messages__batch-btn--active" : ""
                    }`}
                    disabled={busy}
                    aria-pressed={isActive}
                    onClick={() => selectBatch(batch.index)}
                    title={`Sélectionner les invités ${batch.start} à ${batch.end}`}
                  >
                    {batch.start}–{batch.end}
                  </button>
                );
              })}
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busy || selected.size === 0}
                onClick={clearSelection}
              >
                Tout désélectionner
              </button>
            </div>
            <p className="admin-messages__batches-hint">
              {selected.size > 0
                ? `${selected.size} invité${selected.size > 1 ? "s" : ""} sélectionné${selected.size > 1 ? "s" : ""}`
                : "Aucun invité sélectionné"}
            </p>
          </div>
        ) : null}
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel__title">
          Messages WhatsApp
          <span className="admin-messages__count">
            {filteredGuests.length} invité{filteredGuests.length > 1 ? "s" : ""}
          </span>
        </h2>
        <p className="admin-messages__lead">
          {filter === "confirmed"
            ? "Renvoi du message de confirmation uniquement pour les cérémonies où l'invité a dit oui (disponible). Un message est envoyé par cérémonie confirmée."
            : "La recherche Twilio ne retient que les invitations d'août 2026 (texte « participation à la cérémonie de mariage ») et ignore les confirmations dress-code. Cliquez sur « Vérifier toutes les invitations envoyées »."}
        </p>

        <div className="admin-table-wrap">
          {filteredGuests.length === 0 ? (
            <p className="admin-empty">
              {filter === "confirmed"
                ? "Aucun invité confirmé (disponible) ne correspond à ce filtre."
                : filter === "invite_failed"
                  ? "Aucun échec Twilio vérifié pour l'instant. Sélectionnez des invitations envoyées puis « Vérifier statut Twilio »."
                : "Aucun invité avec invitation activée ne correspond à ce filtre."}
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Sélectionner tous"
                      checked={
                        filteredGuests.length > 0 &&
                        filteredGuests.every((guest) => selected.has(guest.id))
                      }
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Cérémonies</th>
                  <th>Statut message</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuests.map((guest) => {
                  const labels =
                    filter === "confirmed"
                      ? confirmedCeremonyLabels(guest)
                      : invitationCeremonyLabels(guest);
                  const inviteReady = canSendInvitation(guest);
                  const reminderReady = canSendReminder(guest);
                  const confirmReady = canResendConfirmation(guest);
                  const confirmCount = confirmationMessageCount(guest);
                  const deliveryLabel = inviteDeliveryLabel(
                    guest.inviteDeliveryStatus,
                  );
                  const deliveryFailed = isFailedInviteDelivery(
                    guest.inviteDeliveryStatus,
                  );

                  return (
                    <tr key={guest.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(guest.id)}
                          onChange={(e) =>
                            toggleGuest(guest.id, e.target.checked)
                          }
                        />
                      </td>
                      <td className="admin-table__name">{guest.name}</td>
                      <td className="admin-table__phone">{guest.phone}</td>
                      <td>
                        <div className="admin-messages__tags">
                          {labels.map((label) => (
                            <span key={label} className="admin-badge admin-badge--muted">
                              {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="admin-messages__tags">
                          {guest.statusSend ? (
                            <span className="admin-badge admin-badge--success">
                              Invitation envoyée
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge--warning">
                              À inviter
                            </span>
                          )}
                          {deliveryLabel ? (
                            <span
                              className={`admin-badge ${
                                deliveryFailed
                                  ? "admin-badge--danger"
                                  : guest.inviteDeliveryStatus === "delivered" ||
                                      guest.inviteDeliveryStatus === "read"
                                    ? "admin-badge--success"
                                    : "admin-badge--muted"
                              }`}
                              title={guest.inviteDeliveryError ?? undefined}
                            >
                              {deliveryLabel}
                              {guest.inviteDeliveryError
                                ? ` · ${guest.inviteDeliveryError}`
                                : ""}
                            </span>
                          ) : guest.statusSend ? (
                            <span className="admin-badge admin-badge--muted">
                              Statut non vérifié
                            </span>
                          ) : null}
                          {guest.statusReminderSent ? (
                            <span className="admin-badge admin-badge--info">
                              Rappel envoyé
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="admin-table__actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            disabled={busy || !inviteReady}
                            title={
                              inviteReady
                                ? "Envoyer l'invitation"
                                : guest.statusSend
                                  ? "Invitation déjà envoyée"
                                  : "Non éligible"
                            }
                            onClick={() => void sendInvite(guest)}
                          >
                            Invitation
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            disabled={busy || !guest.statusSend}
                            title={
                              guest.statusSend
                                ? guest.inviteMessageSid
                                  ? "Lire le statut réel chez Twilio (délivré, échec, cause)"
                                  : "Retrouver l'ancien envoi chez Twilio via le numéro, puis afficher le statut"
                                : "Aucun envoi à vérifier"
                            }
                            onClick={() => void refreshInviteStatus(guest)}
                          >
                            Statut
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--secondary"
                            disabled={busy || !reminderReady}
                            title={
                              reminderReady
                                ? "Envoyer un rappel"
                                : "Rappel indisponible (invitation non envoyée, toutes les cérémonies ont une réponse, ou rappel déjà fait)"
                            }
                            onClick={() => void sendReminder(guest)}
                          >
                            Rappel
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--success"
                            disabled={busy || !confirmReady}
                            title={
                              confirmReady
                                ? `Renvoyer la confirmation pour ${confirmCount} cérémonie${confirmCount > 1 ? "s" : ""} (oui uniquement)`
                                : "Aucune cérémonie confirmée (disponible)"
                            }
                            onClick={() => void sendConfirmation(guest)}
                          >
                            Confirmation
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            disabled={busy || !canResetMessageStatus(guest)}
                            title={
                              canResetMessageStatus(guest)
                                ? "Remettre le statut message à « À inviter »"
                                : "Rien à réinitialiser"
                            }
                            onClick={() => setResetTarget(guest)}
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
