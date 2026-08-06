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
  getTableCeremonyStatuses,
  guestHasTableAssignment,
  hasPendingTableResponse,
  type AdminGuest,
} from "@/lib/admin/types";

type MessagesFilter = "all" | "pending_invite" | "invite_sent" | "reminder";

type BulkConfirm =
  | { type: "invite"; recipients: AdminGuest[] }
  | { type: "reminder"; recipients: AdminGuest[] }
  | { type: "reminder_resend"; recipients: AdminGuest[] };

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

function tableCeremonyLabels(guest: AdminGuest) {
  return getTableCeremonyStatuses(guest).map((status) =>
    ceremonyShortLabel(status.ceremonyId),
  );
}

function canResendReminder(guest: AdminGuest) {
  return guestHasTableAssignment(guest) && guest.statusSend && hasPendingTableResponse(guest);
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

  const tableGuests = useMemo(
    () => guests.filter((guest) => guestHasTableAssignment(guest)),
    [guests],
  );

  const stats = useMemo(() => {
    const pendingInvite = tableGuests.filter((guest) => canSendInvitation(guest));
    const inviteSent = tableGuests.filter((guest) => guest.statusSend);
    const reminderReady = tableGuests.filter((guest) => canSendReminder(guest));
    return {
      total: tableGuests.length,
      pendingInvite: pendingInvite.length,
      inviteSent: inviteSent.length,
      reminderReady: reminderReady.length,
    };
  }, [tableGuests]);

  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tableGuests
      .filter((guest) => {
        if (filter === "pending_invite") return canSendInvitation(guest);
        if (filter === "invite_sent") return guest.statusSend;
        if (filter === "reminder") return canSendReminder(guest);
        return true;
      })
      .filter((guest) => {
        if (!query) return true;
        return (
          guest.name.toLowerCase().includes(query) ||
          guest.phone.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [tableGuests, filter, search]);

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

  const bulkCount = bulkConfirm?.recipients.length ?? 0;
  const isBulkInvite = bulkConfirm?.type === "invite";
  const isBulkResend = bulkConfirm?.type === "reminder_resend";

  return (
    <div className="admin-messages">
      <AdminConfirmModal
        open={bulkConfirm !== null}
        busy={busy}
        eyebrow="Messages"
        title={
          isBulkInvite
            ? "Envoyer les invitations ?"
            : isBulkResend
              ? "Renvoyer les rappels ?"
              : "Envoyer les rappels ?"
        }
        description={
          <>
            Vous allez envoyer{" "}
            <strong>
              {bulkCount} {isBulkInvite ? "invitation" : "rappel"}
              {bulkCount > 1 ? "s" : ""}
            </strong>{" "}
            WhatsApp aux invités sélectionnés.
          </>
        }
        confirmLabel={
          isBulkInvite
            ? `Envoyer ${bulkCount} invitation${bulkCount > 1 ? "s" : ""}`
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

      <section className="admin-stats" aria-label="Statistiques messages">
        <article className="admin-stat">
          <div className="admin-stat__label">Avec table</div>
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
      </section>

      <section className="admin-panel admin-messages__toolbar">
        <div className="admin-messages__filters">
          <input
            type="search"
            className="admin-input"
            placeholder="Rechercher un invité…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="admin-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as MessagesFilter)}
          >
            <option value="all">Tous (avec table)</option>
            <option value="pending_invite">Invitation à envoyer</option>
            <option value="invite_sent">Invitation envoyée</option>
            <option value="reminder">Rappel possible</option>
          </select>
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
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel__title">
          Messages WhatsApp
          <span className="admin-messages__count">
            {filteredGuests.length} invité{filteredGuests.length > 1 ? "s" : ""}
          </span>
        </h2>
        <p className="admin-messages__lead">
          Envoi des invitations et rappels WhatsApp aux invités déjà affectés à
          une table. « Invitation envoyée » = envoi depuis cet onglet
          uniquement. Les RSVP se gèrent dans Invitations.
        </p>

        <div className="admin-table-wrap">
          {filteredGuests.length === 0 ? (
            <p className="admin-empty">
              Aucun invité avec table ne correspond à ce filtre.
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
                  <th>Cérémonies (table)</th>
                  <th>Statut message</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuests.map((guest) => {
                  const labels = tableCeremonyLabels(guest);
                  const inviteReady = canSendInvitation(guest);
                  const reminderReady = canSendReminder(guest);

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
                            className="admin-btn admin-btn--secondary"
                            disabled={busy || !reminderReady}
                            title={
                              reminderReady
                                ? "Envoyer un rappel"
                                : "Rappel indisponible (invitation non envoyée, toutes les cérémonies avec table ont une réponse, ou rappel déjà fait)"
                            }
                            onClick={() => void sendReminder(guest)}
                          >
                            Rappel
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
